/**
 * Proves the contributor daily Application allowance holds under contention,
 * against a real Postgres database.
 *
 * The mocked jest suites cannot do this. They cannot execute
 * `pg_advisory_xact_lock` — raw SQL that returns `void` and throws `P2010` if
 * it is ever issued through `$queryRaw` instead of `$executeRaw` — and they
 * cannot run two transactions at once, which is the only condition under which
 * a check-then-increment counter is actually wrong.
 *
 * Run with a real database:
 *
 *   docker compose up -d postgres
 *   DATABASE_URL="postgresql://sharek:sharek@localhost:5433/sharek?schema=public" \
 *     pnpm run test:concurrency:application-quota
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient, SubscriptionPlanType, UserActionType } from '@prisma/client';

import { ApplicationDailyQuotaService } from '../src/modules/applications/services/application-daily-quota.service';
import { EntitlementsService } from '../src/modules/subscriptions/entitlements.service';

const database = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});
const quota = new ApplicationDailyQuotaService(
  new EntitlementsService(database as never),
  database as never,
);

const now = new Date();
const failures: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) console.log(`  ok  ${message}`);
  else {
    failures.push(message);
    console.error(`  FAIL ${message}`);
  }
}

async function createContributor(): Promise<string> {
  const user = await database.user.create({
    data: {
      email: `quota-${randomUUID()}@example.test`,
      password_hash: 'x',
      first_name: 'Quota',
      last_name: 'Contributor',
      role: 'contributor',
      status: 'active',
    },
    select: { id: true },
  });
  return user.id;
}

/**
 * One reservation in its own transaction. Resolves to the reserved count, or to
 * null when the allowance refused it — the two outcomes the caller counts.
 */
async function attempt(contributorId: string): Promise<number | null> {
  try {
    return await database.$transaction(async (transaction) => {
      await quota.lockContributor(contributorId, transaction);
      const reserved = await quota.reserve({
        contributorId,
        transaction,
        now,
      });
      return reserved.used;
    });
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'APPLICATION_DAILY_LIMIT_REACHED'
    ) {
      return null;
    }
    throw error;
  }
}

async function parallelAttempts(contributorId: string, count: number) {
  const results = await Promise.all(
    Array.from({ length: count }, () => attempt(contributorId)),
  );
  const granted = results.filter((used): used is number => used !== null);
  const tally = await database.usageTracker.findUnique({
    where: {
      user_id_action_type_period_date: {
        user_id: contributorId,
        action_type: UserActionType.application_submitted,
        period_date: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        ),
      },
    },
    select: { count: true },
  });
  return { granted, tally: tally?.count ?? 0 };
}

async function run() {
  console.log('free contributor, 8 parallel attempts at a limit of 1');
  const freeContributor = await createContributor();
  const free = await parallelAttempts(freeContributor, 8);
  check(free.granted.length === 1, `exactly 1 attempt was granted (got ${free.granted.length})`);
  check(free.tally === 1, `the tally settled at 1 (got ${free.tally})`);
  check(
    new Set(free.granted).size === free.granted.length,
    'no two grants claimed the same slot number',
  );

  console.log('gold contributor, 12 parallel attempts at a limit of 5');
  const goldContributor = await createContributor();
  await database.subscription.create({
    data: {
      user_id: goldContributor,
      user_role_context: 'contributor',
      plan_type: SubscriptionPlanType.gold,
      status: 'active',
      source: 'admin',
      starts_at: new Date(now.getTime() - 86_400_000),
      expires_at: new Date(now.getTime() + 86_400_000),
      current_period_start: new Date(now.getTime() - 86_400_000),
      current_period_end: new Date(now.getTime() + 86_400_000),
    },
  });
  const gold = await parallelAttempts(goldContributor, 12);
  check(gold.granted.length === 5, `exactly 5 attempts were granted (got ${gold.granted.length})`);
  check(gold.tally === 5, `the tally settled at 5 (got ${gold.tally})`);
  check(
    [...gold.granted].sort((a, b) => a - b).join(',') === '1,2,3,4,5',
    `the grants numbered 1..5 with no gap or repeat (got ${[...gold.granted].sort((a, b) => a - b).join(',')})`,
  );

  console.log('at the boundary, 6 parallel attempts with 4 of 5 already spent');
  const boundaryContributor = await createContributor();
  await database.subscription.create({
    data: {
      user_id: boundaryContributor,
      user_role_context: 'contributor',
      plan_type: SubscriptionPlanType.gold,
      status: 'active',
      source: 'admin',
      starts_at: new Date(now.getTime() - 86_400_000),
      expires_at: new Date(now.getTime() + 86_400_000),
      current_period_start: new Date(now.getTime() - 86_400_000),
      current_period_end: new Date(now.getTime() + 86_400_000),
    },
  });
  await database.usageTracker.create({
    data: {
      user_id: boundaryContributor,
      action_type: UserActionType.application_submitted,
      period_date: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      ),
      count: 4,
    },
  });
  const boundary = await parallelAttempts(boundaryContributor, 6);
  check(
    boundary.granted.length === 1,
    `exactly the last slot was granted (got ${boundary.granted.length})`,
  );
  check(boundary.tally === 5, `the tally settled at 5 (got ${boundary.tally})`);

  console.log('a rolled-back transaction refunds the slot');
  const rollbackContributor = await createContributor();
  await database
    .$transaction(async (transaction) => {
      await quota.lockContributor(rollbackContributor, transaction);
      await quota.reserve({ contributorId: rollbackContributor, transaction, now });
      throw new Error('deliberate rollback');
    })
    .catch(() => undefined);
  const afterRollback = await database.usageTracker.findUnique({
    where: {
      user_id_action_type_period_date: {
        user_id: rollbackContributor,
        action_type: UserActionType.application_submitted,
        period_date: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        ),
      },
    },
    select: { count: true },
  });
  check(
    afterRollback === null,
    `a failed submission left no tally behind (got ${afterRollback?.count ?? 'none'})`,
  );

  // Clean up only what this run created, so it is safe against a seeded database.
  const created = [
    freeContributor,
    goldContributor,
    boundaryContributor,
    rollbackContributor,
  ];
  await database.usageTracker.deleteMany({ where: { user_id: { in: created } } });
  await database.subscription.deleteMany({ where: { user_id: { in: created } } });
  await database.user.deleteMany({ where: { id: { in: created } } });
}

run()
  .then(async () => {
    await database.$disconnect();
    if (failures.length > 0) {
      console.error(`\n${failures.length} check(s) failed.`);
      process.exit(1);
    }
    console.log('\nApplication daily quota holds under contention.');
  })
  .catch(async (error) => {
    await database.$disconnect();
    console.error(error);
    process.exit(1);
  });
