import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

const baseUrl = process.env.SHAREK_DEMO_BASE_URL ?? 'http://127.0.0.1:4000';
const password = process.env.SHAREK_DEMO_PASSWORD;

if (!password) {
  throw new Error('SHAREK_DEMO_PASSWORD is required');
}

// Opt out of teardown when a failed run needs inspecting. Kept as an opt-out so
// the default is to leave the database as the run found it; note that preserved
// runs still count toward the proposer's daily submission limit.
const keepData =
  process.argv.includes('--keep-data') || process.env.SHAREK_DEMO_KEEP_DATA === '1';

const prisma = new PrismaClient();
const transcript = [];
let fixtureProjectId = null;

function record(step, status, assertions) {
  transcript.push({ step, httpStatus: status, assertions });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function call({ method = 'GET', path, token, body, idempotencyKey }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { status: response.status, body: payload };
}

function expectStatus(result, expected, label) {
  assert(
    result.status === expected,
    `${label}: expected HTTP ${expected}, received ${result.status}: ${JSON.stringify(result.body)}`,
  );
}

async function login(email, alias) {
  const result = await call({
    method: 'POST',
    path: '/auth/login',
    body: { email, password },
  });
  expectStatus(result, 201, `${alias} login`);
  assert(result.body?.tokens?.accessToken, `${alias} login did not return an access token`);
  record(`${alias}-login`, result.status, ['authenticated', 'credentials-redacted']);
  return result.body.tokens.accessToken;
}

const requestContract = (suffix) => ({
  title: `Sprint 4 runtime request ${suffix}`,
  description: `Exercise the real Sprint 4 contribution workflow for ${suffix}.`,
  requiredRequirements: [{ text: 'Deliver tested NestJS endpoints' }],
  preferredRequirements: [{ text: 'Document the HTTP contract' }],
  technologyTags: ['NestJS', 'PostgreSQL'],
  applicationsCloseTime: '2030-03-10T12:00:00.000Z',
  targetCompletionDate: '2030-03-20',
  difficulty: 'intermediate',
  reward: 150,
  rewardCurrency: 'USD',
});

async function createAndPublishRequest(ownerToken, projectId, alias) {
  const created = await call({
    method: 'POST',
    path: `/projects/${projectId}/contribution-requests`,
    token: ownerToken,
    idempotencyKey: randomUUID(),
    body: requestContract(alias),
  });
  expectStatus(created, 201, `${alias} create draft`);
  assert(created.body?.status === 'draft', `${alias} was not created as draft`);
  record(`${alias}-draft-created`, created.status, ['status=draft', 'identifier-redacted']);

  const published = await call({
    method: 'POST',
    path: `/contribution-requests/${created.body.id}/publish`,
    token: ownerToken,
    idempotencyKey: randomUUID(),
  });
  expectStatus(published, 200, `${alias} publish`);
  assert(published.body?.status === 'published', `${alias} was not published`);
  record(`${alias}-published`, published.status, ['status=published']);
  return created.body.id;
}

async function apply(contributorToken, requestId, alias) {
  const result = await call({
    method: 'POST',
    path: `/tasks/${requestId}/applications`,
    token: contributorToken,
    body: {
      contributionApproach: 'I will implement the requested workflow with focused tests.',
      proposedDeliveryDurationDays: 5,
      idempotencyKey: randomUUID(),
    },
  });
  expectStatus(result, 201, `${alias} apply`);
  assert(
    result.body?.status === 'PENDING_OWNER_REVIEW',
    `${alias} application was not immediately PENDING_OWNER_REVIEW`,
  );
  record(`${alias}-application-submitted`, result.status, [
    'status=PENDING_OWNER_REVIEW',
    'visible-immediately',
    'identifier-redacted',
  ]);
  return result.body.id;
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: 'owner@sharek.local' },
  });
  // Every publication path keeps slug_normalized === slug.toLowerCase(), and
  // public project lookups resolve a slug against that column, so the fixture
  // has to hold the same invariant rather than roll a second identifier.
  const projectSlug = `s4-runtime-${randomUUID().replace(/-/g, '')}`;
  const project = await prisma.project.create({
    data: {
      owner_id: owner.id,
      title: 'Sprint 4 Runtime Gate Fixture',
      slug: projectSlug,
      slug_normalized: projectSlug.toLowerCase(),
      description: 'Fixture project for the Sprint 4 sequential runtime gate.',
      github_repo_url: 'https://github.com/ITI-Sharek/Sharek',
      technologies: ['NestJS', 'PostgreSQL'],
      status: 'published',
      published_at: new Date(),
    },
  });
  fixtureProjectId = project.id;
  record('fixture-created', 0, ['published-project', 'direct-database-fixture', 'identifier-redacted']);

  const ownerToken = await login('owner@sharek.local', 'owner');
  const contributorToken = await login('contributor@sharek.local', 'contributor');

  const acceptedRequestId = await createAndPublishRequest(ownerToken, project.id, 'request-accept');
  const publicRequest = await call({ path: `/tasks/${acceptedRequestId}` });
  expectStatus(publicRequest, 200, 'discover published request');
  record('request-discovered-publicly', publicRequest.status, ['status=published']);

  const acceptedApplicationId = await apply(contributorToken, acceptedRequestId, 'request-accept');
  const ownerApplications = await call({
    path: `/tasks/${acceptedRequestId}/applications`,
    token: ownerToken,
  });
  expectStatus(ownerApplications, 200, 'owner list applications');
  const listedApplications = Array.isArray(ownerApplications.body)
    ? ownerApplications.body
    : ownerApplications.body?.applications ?? ownerApplications.body?.items;
  assert(
    listedApplications?.some((application) => application.id === acceptedApplicationId),
    'submitted application was not immediately visible to the owner',
  );
  record('owner-sees-application', ownerApplications.status, [
    'application-present',
    'status=PENDING_OWNER_REVIEW',
  ]);

  const assessmentRequest = await call({
    method: 'POST',
    path: `/applications/${acceptedApplicationId}/assessment-requests`,
    token: ownerToken,
    body: { idempotencyKey: randomUUID() },
  });
  expectStatus(assessmentRequest, 202, 'request optional Advisory Fit');
  assert(
    assessmentRequest.body?.requestStatus === 'NOT_STARTED_NO_ASSESSABLE_EVIDENCE',
    `unexpected Advisory Fit state: ${assessmentRequest.body?.requestStatus}`,
  );
  record('advisory-fit-requested', assessmentRequest.status, [
    'requestStatus=NOT_STARTED_NO_ASSESSABLE_EVIDENCE',
    'optional-non-blocking-result',
  ]);

  const assessmentRead = await call({
    path: `/applications/${acceptedApplicationId}/assessment`,
    token: ownerToken,
  });
  expectStatus(assessmentRead, 200, 'read Advisory Fit');
  assert(
    assessmentRead.body?.requestStatus === 'NOT_STARTED_NO_ASSESSABLE_EVIDENCE',
    'Advisory Fit terminal state was not persisted',
  );
  record('advisory-fit-read', assessmentRead.status, [
    'requestStatus=NOT_STARTED_NO_ASSESSABLE_EVIDENCE',
  ]);

  const accepted = await call({
    method: 'POST',
    path: `/applications/${acceptedApplicationId}/accept`,
    token: ownerToken,
    idempotencyKey: randomUUID(),
  });
  expectStatus(accepted, 200, 'accept application');
  assert(accepted.body?.application?.status === 'ACCEPTED', 'application was not ACCEPTED');
  record('application-accepted', accepted.status, [
    'status=ACCEPTED',
    'decision-not-gated-by-advisory-fit',
  ]);

  const declinedRequestId = await createAndPublishRequest(ownerToken, project.id, 'request-decline');
  const declinedApplicationId = await apply(contributorToken, declinedRequestId, 'request-decline');
  const declined = await call({
    method: 'POST',
    path: `/applications/${declinedApplicationId}/decline`,
    token: ownerToken,
    idempotencyKey: randomUUID(),
    body: { feedback: 'The approach needs stronger testing coverage.' },
  });
  expectStatus(declined, 200, 'decline application');
  assert(
    declined.body?.application?.status === 'DECLINED_BY_OWNER',
    'application was not DECLINED_BY_OWNER',
  );
  record('application-declined', declined.status, [
    'status=DECLINED_BY_OWNER',
    'decision-without-advisory-fit',
  ]);

  const proposal = await call({
    method: 'POST',
    path: '/contribution-proposals',
    token: contributorToken,
    body: {
      projectId: project.id,
      title: 'Add a delivery health dashboard',
      problemOrOpportunity: 'Owners need clearer delivery health signals across active requests.',
      proposedOutcome: 'Provide a focused dashboard with tested request health indicators.',
      projectBenefit: 'The project gains earlier visibility into delivery risks and blockers.',
      acknowledgesAttributionAndAssignmentDisclosure: true,
      idempotencyKey: randomUUID(),
    },
  });
  expectStatus(proposal, 201, 'submit contribution proposal');
  assert(proposal.body?.status === 'PENDING', 'proposal was not PENDING');
  assert(
    typeof proposal.body?.proposerName === 'string' && proposal.body.proposerName.length > 0,
    'proposal response omitted proposer identity',
  );
  record('proposal-submitted', proposal.status, [
    'status=PENDING',
    'proposer-identified',
    'identifier-redacted',
  ]);

  const revisionRequest = await call({
    method: 'POST',
    path: `/contribution-proposals/${proposal.body.id}/revision-requests`,
    token: ownerToken,
    body: { reason: 'Please clarify the testing and delivery scope.', idempotencyKey: randomUUID() },
  });
  expectStatus(revisionRequest, 201, 'request proposal revision');
  record('proposal-revision-requested', revisionRequest.status, ['status=PENDING', 'revision-requested']);

  const revised = await call({
    method: 'POST',
    path: `/contribution-proposals/${proposal.body.id}/versions`,
    token: contributorToken,
    body: {
      title: 'Add a tested delivery health dashboard',
      problemOrOpportunity: 'Owners need clearer delivery health signals across active requests.',
      proposedOutcome: 'Provide a focused dashboard backed by API and integration test coverage.',
      projectBenefit: 'The project gains earlier visibility into delivery risks and verified behavior.',
      idempotencyKey: randomUUID(),
    },
  });
  expectStatus(revised, 201, 'submit revised proposal version');
  assert(revised.body?.currentVersion === 2, 'proposal version did not advance to 2');
  record('proposal-version-submitted', revised.status, ['currentVersion=2']);

  const proposalAccepted = await call({
    method: 'POST',
    path: `/contribution-proposals/${proposal.body.id}/accept`,
    token: ownerToken,
    body: { idempotencyKey: randomUUID() },
  });
  expectStatus(proposalAccepted, 200, 'accept proposal');
  assert(proposalAccepted.body?.status === 'ACCEPTED', 'proposal was not ACCEPTED');
  assert(
    proposalAccepted.body?.resultingContributionRequestStatus === 'DRAFT',
    'accepted proposal did not create a DRAFT request',
  );
  const attributedRequestId = proposalAccepted.body.resultingContributionRequestId;
  record('proposal-accepted', proposalAccepted.status, [
    'status=ACCEPTED',
    'resultingRequestStatus=DRAFT',
    'identifier-redacted',
  ]);

  const completedDraft = await call({
    method: 'PATCH',
    path: `/contribution-requests/${attributedRequestId}`,
    token: ownerToken,
    idempotencyKey: randomUUID(),
    body: {
      requiredRequirements: [{ text: 'Deliver the dashboard with integration tests' }],
      preferredRequirements: [{ text: 'Document the dashboard HTTP contract' }],
      technologyTags: ['NestJS', 'PostgreSQL'],
      applicationsCloseTime: '2030-03-10T12:00:00.000Z',
      targetCompletionDate: '2030-03-20',
      difficulty: 'intermediate',
    },
  });
  expectStatus(completedDraft, 200, 'complete attributed request draft');
  record('attributed-draft-completed', completedDraft.status, [
    'status=draft',
    'owner-controlled-contract-completed',
  ]);

  const attributedPublished = await call({
    method: 'POST',
    path: `/contribution-requests/${attributedRequestId}/publish`,
    token: ownerToken,
    idempotencyKey: randomUUID(),
  });
  expectStatus(attributedPublished, 200, 'publish attributed request');
  assert(attributedPublished.body?.status === 'published', 'attributed request was not published');
  record('attributed-request-published', attributedPublished.status, ['status=published']);

  const attributedPublic = await call({ path: `/tasks/${attributedRequestId}` });
  expectStatus(attributedPublic, 200, 'read attributed request publicly');
  assert(attributedPublic.body?.attribution, 'public request did not expose attribution');
  assert(
    !('assignment' in attributedPublic.body) && !('selectionPriority' in attributedPublic.body),
    'public attribution leaked assignment or selection priority',
  );
  record('attribution-visible-publicly', attributedPublic.status, [
    'attribution-present',
    'no-assignment',
    'no-selection-priority',
  ]);

  console.log(JSON.stringify({ result: 'PASS', transcript }, null, 2));
}

/**
 * Removes everything the run created, so the runner is idempotent and repeated
 * same-day runs cannot trip the proposer's daily submission limit.
 *
 * Every filter is derived from the fixture Project, so seeded users and any
 * pre-existing rows are structurally unreachable. Audit tables are all
 * onDelete: Restrict and have to go by hand; requirements, proposal versions
 * and project operations/transitions cascade. AssessmentRequest holds Restrict
 * references onto both snapshot tables, so it must be deleted before them.
 *
 * AuthSession rows are deliberately left alone: deleting them by user_id would
 * sign out anyone else sharing the seeded accounts on the same database.
 */
async function cleanupFixture(projectId) {
  const requests = await prisma.contributionRequest.findMany({
    where: { project_id: projectId },
    select: { id: true },
  });
  const requestIds = requests.map((request) => request.id);

  const applications = await prisma.application.findMany({
    where: { contribution_request_id: { in: requestIds } },
    select: { id: true, requirement_snapshot_id: true, evidence_snapshot_id: true },
  });
  const applicationIds = applications.map((application) => application.id);
  const requirementSnapshotIds = applications
    .map((application) => application.requirement_snapshot_id)
    .filter(Boolean);
  const evidenceSnapshotIds = applications
    .map((application) => application.evidence_snapshot_id)
    .filter(Boolean);

  const assessmentRequests = await prisma.assessmentRequest.findMany({
    where: { application_id: { in: applicationIds } },
    select: { id: true },
  });
  const assessmentRequestIds = assessmentRequests.map((request) => request.id);

  const proposals = await prisma.contributionProposal.findMany({
    where: { project_id: projectId },
    select: { id: true },
  });
  const proposalIds = proposals.map((proposal) => proposal.id);

  const notificationFilters = [
    ...applicationIds.map((id) => ({
      deduplication_key: { startsWith: `application:${id}:` },
    })),
    ...proposalIds.map((id) => ({
      deduplication_key: { startsWith: `proposal:${id}:` },
    })),
  ];

  await prisma.$transaction([
    prisma.assessmentRequestAudit.deleteMany({
      where: { assessment_request_id: { in: assessmentRequestIds } },
    }),
    prisma.assessmentAttempt.deleteMany({
      where: { assessment_request_id: { in: assessmentRequestIds } },
    }),
    prisma.assessmentRequest.deleteMany({ where: { id: { in: assessmentRequestIds } } }),
    prisma.assignment.deleteMany({ where: { application_id: { in: applicationIds } } }),
    prisma.ownerDecision.deleteMany({ where: { application_id: { in: applicationIds } } }),
    prisma.applicationAudit.deleteMany({ where: { application_id: { in: applicationIds } } }),
    prisma.application.deleteMany({ where: { id: { in: applicationIds } } }),
    prisma.applicationRequirementSnapshot.deleteMany({
      where: { id: { in: requirementSnapshotIds } },
    }),
    prisma.applicationEvidenceSnapshot.deleteMany({
      where: { id: { in: evidenceSnapshotIds } },
    }),
    prisma.contributionRequestAudit.deleteMany({
      where: { contribution_request_id: { in: requestIds } },
    }),
    prisma.contributionRequest.deleteMany({ where: { project_id: projectId } }),
    prisma.contributionProposalMisuseReport.deleteMany({
      where: { proposal_id: { in: proposalIds } },
    }),
    prisma.contributionProposalAudit.deleteMany({
      where: { proposal_id: { in: proposalIds } },
    }),
    prisma.contributionProposal.deleteMany({ where: { project_id: projectId } }),
    ...(notificationFilters.length > 0
      ? [prisma.notification.deleteMany({ where: { OR: notificationFilters } })]
      : []),
    prisma.project.deleteMany({ where: { id: projectId } }),
  ]);
}

try {
  await main();
} finally {
  if (fixtureProjectId && !keepData) {
    try {
      await cleanupFixture(fixtureProjectId);
    } catch (cleanupError) {
      // Never mask the original failure; leave a breadcrumb for manual cleanup.
      console.error(
        `Cleanup failed for fixture project ${fixtureProjectId}: ${cleanupError.message}`,
      );
    }
  }
  await prisma.$disconnect();
}
