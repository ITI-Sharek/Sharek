import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

const baseUrl = process.env.SHAREK_DEMO_BASE_URL ?? 'http://127.0.0.1:4000';
const password = process.env.SHAREK_DEMO_PASSWORD;

if (!password) {
  throw new Error('SHAREK_DEMO_PASSWORD is required');
}

const prisma = new PrismaClient();
const transcript = [];

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
  const project = await prisma.project.create({
    data: {
      owner_id: owner.id,
      title: 'Sprint 4 Runtime Gate Fixture',
      slug: `s4-runtime-${randomUUID().slice(0, 8)}`,
      slug_normalized: `s4-runtime-${randomUUID()}`,
      description: 'Fixture project for the Sprint 4 sequential runtime gate.',
      github_repo_url: 'https://github.com/ITI-Sharek/Sharek',
      technologies: ['NestJS', 'PostgreSQL'],
      status: 'published',
      published_at: new Date(),
    },
  });
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
  record('proposal-submitted', proposal.status, ['status=PENDING', 'identifier-redacted']);

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

try {
  await main();
} finally {
  await prisma.$disconnect();
}
