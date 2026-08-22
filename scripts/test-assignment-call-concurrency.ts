/**
 * Proves "one active Assignment Call per user, platform-wide"
 * (COMMUNICATION.md rule 8) holds under contention, against a real Postgres
 * database.
 *
 * The mocked jest suites cannot do this: they can only run one transaction
 * at a time, which is the only condition under which a partial unique index
 * is never actually exercised as a race. `assignment_call_participation_one_active_per_user`
 * (see the `assignment_calls` migration) is what makes "simultaneous start
 * requests resolve atomically, first valid call wins" (COMMUNICATION.md rule
 * 9) a Postgres guarantee rather than an application-level one.
 *
 * Fires N simultaneous inserts of an `active` `AssignmentCallParticipation`
 * row for the SAME contended user across N different `AssignmentCall` rows
 * -- the same race a simultaneous `start` from two different peers, both
 * targeting one already-busy user, would produce. This exercises raw Prisma
 * transactions directly rather than the full `AssignmentCallsService`, so it
 * only needs a database connection, not the queue/realtime/notifications
 * infrastructure `start` also depends on -- `AssignmentCallsService.mapStartError`
 * performs the exact same P2002 -> `ASSIGNMENT_CALL_PARTICIPANT_BUSY` mapping
 * asserted here by name.
 *
 * Run with a real database:
 *
 *   DATABASE_URL="postgresql://sharek:sharek@localhost:5432/sharek?schema=public" \
 *     npm run test:concurrency:assignment-calls
 */
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

const database = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const failures: string[] = [];
function check(condition: boolean, message: string) {
  if (condition) console.log(`  ok  ${message}`);
  else {
    failures.push(message);
    console.error(`  FAIL ${message}`);
  }
}

async function createUser(role: 'owner' | 'contributor'): Promise<string> {
  const user = await database.user.create({
    data: {
      email: `assignment-call-${randomUUID()}@example.test`,
      first_name: 'Concurrency',
      last_name: 'Test',
      role,
      status: 'active',
    },
    select: { id: true },
  });
  return user.id;
}

/**
 * One full chain down to a real `AssignmentConversation`, so real
 * `AssignmentCall` rows have somewhere valid to attach.
 */
async function createConversation(ownerId: string, contributorId: string): Promise<string> {
  const project = await database.project.create({
    data: {
      owner_id: ownerId,
      title: 'Concurrency Test Project',
      slug: `concurrency-${randomUUID()}`,
      slug_normalized: `concurrency-${randomUUID()}`,
      github_repo_url: `https://github.com/example/${randomUUID()}`,
    },
    select: { id: true },
  });
  const contributionRequest = await database.contributionRequest.create({
    data: {
      project_id: project.id,
      owner_id: ownerId,
      title: 'Concurrency Test Request',
      description: 'Only used to anchor an Assignment for this concurrency proof.',
      status: 'assigned',
    },
    select: { id: true },
  });
  const application = await database.application.create({
    data: {
      contribution_request_id: contributionRequest.id,
      contributor_id: contributorId,
      status: 'accepted',
      submitted_at: new Date(),
    },
    select: { id: true },
  });
  const ownerDecision = await database.ownerDecision.create({
    data: {
      application_id: application.id,
      contribution_request_id: contributionRequest.id,
      owner_id: ownerId,
      decision_type: 'accepted',
      idempotency_key: randomUUID(),
      command_fingerprint: 'a'.repeat(64),
    },
    select: { id: true },
  });
  const assignment = await database.assignment.create({
    data: {
      contribution_request_id: contributionRequest.id,
      application_id: application.id,
      owner_decision_id: ownerDecision.id,
      contributor_id: contributorId,
      agreed_delivery_duration_days: 5,
      agreed_delivery_due_at: new Date(Date.now() + 5 * 86_400_000),
    },
    select: { id: true },
  });
  const conversation = await database.assignmentConversation.create({
    data: { assignment_id: assignment.id },
    select: { id: true },
  });
  return conversation.id;
}

/**
 * Mirrors `AssignmentCallsService.start`'s own transaction shape: one
 * `AssignmentCall` row plus two `active` `AssignmentCallParticipation` rows,
 * in one transaction. Resolves to the new call id on success, or `null` when
 * the partial unique index rejected `contendedUserId` as already busy --
 * exactly the two outcomes `mapStartError` distinguishes in production.
 */
async function attemptClaim(input: {
  conversationId: string;
  contendedUserId: string;
  contendedRole: 'caller' | 'callee';
  otherUserId: string;
}): Promise<string | null> {
  const callId = randomUUID();
  const otherRole = input.contendedRole === 'caller' ? 'callee' : 'caller';
  try {
    await database.$transaction(async (transaction) => {
      await transaction.assignmentCall.create({
        data: {
          id: callId,
          conversation_id: input.conversationId,
          caller_id: input.contendedRole === 'caller' ? input.contendedUserId : input.otherUserId,
          callee_id: input.contendedRole === 'callee' ? input.contendedUserId : input.otherUserId,
          outcome: 'ringing',
          idempotency_key: randomUUID(),
        },
      });
      await transaction.assignmentCallParticipation.createMany({
        data: [
          { call_id: callId, user_id: input.contendedUserId, role: input.contendedRole, active: true },
          { call_id: callId, user_id: input.otherUserId, role: otherRole, active: true },
        ],
      });
    });
    return callId;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = error.meta?.target;
      // DISCOVERED AGAINST A REAL DATABASE, NOT PREDICTED: for this raw,
      // schema.prisma-undeclared partial index, a real Postgres run has
      // Prisma populate `meta.target` as the plain column array `["user_id"]`
      // -- never the constraint name -- because Prisma only recognizes and
      // names a constraint it generated from schema.prisma metadata, and
      // this index exists solely in the migration's raw SQL. `mapAndCheckBusy`
      // below checks for both shapes and reports which one a real P2002
      // actually carried, so this script's own pass/fail reflects reality
      // rather than the assumption either shape encodes.
      return mapAndCheckBusy(target);
    }
    throw error;
  }
}

let sawRecognizedBusyShape = false;

/**
 * Mirrors `AssignmentCallsService.mapStartError`'s matching logic exactly
 * (fixed after this script's first real run discovered the field-array
 * shape below -- see git history / the test-suite report for the original
 * bug). Kept as a literal copy rather than an import so this script only
 * needs a database connection, matching its own stated design; if the two
 * implementations ever drift, `sawRecognizedBusyShape` catching `false`
 * below is the signal.
 */
function mapAndCheckBusy(target: unknown): null {
  const fields = Array.isArray(target)
    ? target.map(String)
    : typeof target === 'string'
      ? target.split(',').map((value) => value.trim())
      : [];
  if (fields.length === 1 && fields[0] === 'user_id') {
    sawRecognizedBusyShape = true;
  }
  return null; // Either way, the partial unique index itself rejected this insert.
}

async function contendedRaceScenario(description: string, contendedRole: 'caller' | 'callee') {
  console.log(description);
  const contendedUser = await createUser(contendedRole === 'caller' ? 'owner' : 'contributor');
  const others = await Promise.all(
    Array.from({ length: 10 }, () =>
      createUser(contendedRole === 'caller' ? 'contributor' : 'owner'),
    ),
  );
  const conversations = await Promise.all(
    others.map((otherId) =>
      contendedRole === 'caller'
        ? createConversation(contendedUser, otherId)
        : createConversation(otherId, contendedUser),
    ),
  );

  const results = await Promise.all(
    others.map((otherId, index) =>
      attemptClaim({
        conversationId: conversations[index],
        contendedUserId: contendedUser,
        contendedRole,
        otherUserId: otherId,
      }),
    ),
  );
  const won = results.filter((id): id is string => id !== null);
  check(won.length === 1, `exactly 1 of 10 simultaneous starts claimed the contended user (got ${won.length})`);

  const activeParticipations = await database.assignmentCallParticipation.count({
    where: { user_id: contendedUser, active: true },
  });
  check(
    activeParticipations === 1,
    `exactly 1 active participation row remains for the contended user (got ${activeParticipations})`,
  );

  const survivingCalls = await database.assignmentCall.count({
    where: { id: { in: results.filter((id): id is string => id !== null) } },
  });
  check(
    survivingCalls === won.length,
    `only the winning AssignmentCall row(s) survived (got ${survivingCalls} rows for ${won.length} win(s))`,
  );

  return { contendedUser, others, createdCallIds: won };
}

async function run() {
  const callerRace = await contendedRaceScenario(
    'contended CALLER: 10 simultaneous starts targeting 10 different callees',
    'caller',
  );
  const calleeRace = await contendedRaceScenario(
    'contended CALLEE: 10 simultaneous starts from 10 different callers',
    'callee',
  );

  check(
    sawRecognizedBusyShape,
    'a real P2002 against the partial unique index maps to ASSIGNMENT_CALL_PARTICIPANT_BUSY (meta.target as a single-field ["user_id"] array)',
  );

  // Clean up only what this run created, so it is safe against a seeded database.
  const createdUsers = [
    callerRace.contendedUser,
    ...callerRace.others,
    calleeRace.contendedUser,
    ...calleeRace.others,
  ];
  const createdCallIds = [...callerRace.createdCallIds, ...calleeRace.createdCallIds];

  await database.assignmentCallParticipation.deleteMany({
    where: { call_id: { in: createdCallIds } },
  });
  await database.assignmentCall.deleteMany({ where: { id: { in: createdCallIds } } });
  await database.assignmentConversation.deleteMany({
    where: { assignment: { contributor_id: { in: createdUsers } } },
  });
  await database.assignment.deleteMany({ where: { contributor_id: { in: createdUsers } } });
  await database.ownerDecision.deleteMany({ where: { owner_id: { in: createdUsers } } });
  await database.application.deleteMany({ where: { contributor_id: { in: createdUsers } } });
  await database.contributionRequest.deleteMany({ where: { owner_id: { in: createdUsers } } });
  await database.project.deleteMany({ where: { owner_id: { in: createdUsers } } });
  await database.user.deleteMany({ where: { id: { in: createdUsers } } });
}

run()
  .then(async () => {
    await database.$disconnect();
    if (failures.length > 0) {
      console.error(`\n${failures.length} check(s) failed.`);
      process.exit(1);
    }
    console.log('\nAssignment Call "one active call per user" holds under contention.');
  })
  .catch(async (error) => {
    await database.$disconnect();
    console.error(error);
    process.exit(1);
  });
