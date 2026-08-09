import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

const baseUrl = process.env.SHAREK_DEMO_BASE_URL ?? 'http://127.0.0.1:4000';
const password = process.env.SHAREK_DEMO_PASSWORD;
const prisma = new PrismaClient();
const transcript = [];
const createdMaterialIds = [];
let fixtureProjectId = null;
let ownerToken;

if (!password) {
  throw new Error('SHAREK_DEMO_PASSWORD is required');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(step, status, assertions) {
  transcript.push({ step, httpStatus: status, assertions });
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

async function callMultipart({ path, token, fields, file }) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append(
    'file',
    new Blob([file.bytes], { type: file.mimeType }),
    file.filename,
  );

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
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

async function createAndAssignRequest(ownerToken, contributorToken, projectId) {
  const created = await call({
    method: 'POST',
    path: `/projects/${projectId}/contribution-requests`,
    token: ownerToken,
    idempotencyKey: randomUUID(),
    body: {
      title: 'Sprint 4 Materials runtime request',
      description: 'Fixture request for the final Materials runtime verification.',
      requiredRequirements: [{ text: 'Use the Materials HTTP contract' }],
      preferredRequirements: [{ text: 'Keep the fixture repeatable' }],
      technologyTags: ['NestJS'],
      applicationsCloseTime: '2030-03-10T12:00:00.000Z',
      targetCompletionDate: '2030-03-20',
      difficulty: 'intermediate',
      reward: 100,
      rewardCurrency: 'USD',
    },
  });
  expectStatus(created, 201, 'create fixture request');

  const published = await call({
    method: 'POST',
    path: `/contribution-requests/${created.body.id}/publish`,
    token: ownerToken,
    idempotencyKey: randomUUID(),
  });
  expectStatus(published, 200, 'publish fixture request');

  const application = await call({
    method: 'POST',
    path: `/tasks/${created.body.id}/applications`,
    token: contributorToken,
    body: {
      contributionApproach: 'I will verify the Materials contract end to end.',
      proposedDeliveryDurationDays: 5,
      idempotencyKey: randomUUID(),
    },
  });
  expectStatus(application, 201, 'submit fixture application');

  const accepted = await call({
    method: 'POST',
    path: `/applications/${application.body.id}/accept`,
    token: ownerToken,
    idempotencyKey: randomUUID(),
  });
  expectStatus(accepted, 200, 'accept fixture application');
  assert(accepted.body?.application?.status === 'ACCEPTED', 'fixture application was not accepted');
  assert(accepted.body?.assignment, 'fixture acceptance did not create an Assignment');

  record('assignment-fixture-created', accepted.status, [
    'published-request',
    'accepted-application',
    'active-assignment',
    'identifiers-redacted',
  ]);
  return created.body.id;
}

async function upload({ token, path, title, visibility, filename, mimeType, bytes, label }) {
  const result = await callMultipart({
    path,
    token,
    fields: {
      title,
      visibility,
      idempotencyKey: randomUUID(),
    },
    file: { filename, mimeType, bytes },
  });
  expectStatus(result, 201, `${label} upload`);
  assert(result.body?.versions?.[0]?.scanStatus === 'QUARANTINED', `${label} did not start quarantined`);
  createdMaterialIds.push(result.body.id);
  record(`${label}-uploaded`, result.status, [
    'status=QUARANTINED',
    'upload-does-not-start-AI',
    'identifier-redacted',
  ]);
  return result.body.id;
}

async function waitForScan(token, materialId, expectedStatus, label) {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    last = await call({ path: `/materials/${materialId}`, token });
    expectStatus(last, 200, `${label} read`);
    if (last.body?.versions?.[0]?.scanStatus === expectedStatus) {
      record(`${label}-scan-settled`, last.status, [`status=${expectedStatus}`]);
      return last.body;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not reach ${expectedStatus}: ${JSON.stringify(last?.body)}`);
}

async function listMaterials(token, path, label) {
  const result = await call({ path, token });
  expectStatus(result, 200, `${label} list`);
  assert(Array.isArray(result.body), `${label} did not return a Material list`);
  return result.body;
}

async function download(token, materialId, version, expectedBytes, label) {
  const tokenResult = await call({
    method: 'POST',
    path: `/materials/${materialId}/versions/${version}/download-token`,
    token,
  });
  expectStatus(tokenResult, 201, `${label} download token`);
  assert(tokenResult.body?.token, `${label} did not return a download token`);

  const response = await fetch(
    `${baseUrl}/material-downloads?token=${encodeURIComponent(tokenResult.body.token)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expectStatus({ status: response.status }, 200, `${label} download`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.equals(expectedBytes), `${label} returned unexpected bytes`);
  record(`${label}-downloaded`, response.status, [
    'short-lived-token',
    'live-authorization-checked',
    'bytes-match',
  ]);
  return tokenResult.body.token;
}

async function expectNotFound(result, label) {
  expectStatus(result, 404, label);
  assert(result.body?.code, `${label} omitted its audience-safe error code`);
}

async function main() {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: 'owner@sharek.local' },
  });
  const projectSlug = `s4-materials-${randomUUID().replace(/-/g, '')}`;
  const project = await prisma.project.create({
    data: {
      owner_id: owner.id,
      title: 'Sprint 4 Materials Runtime Fixture',
      slug: projectSlug,
      slug_normalized: projectSlug,
      description: 'Fixture project for the final Materials runtime gate.',
      github_repo_url: 'https://github.com/ITI-Sharek/Sharek',
      technologies: ['NestJS'],
      status: 'published',
      published_at: new Date(),
    },
  });
  fixtureProjectId = project.id;

  ownerToken = await login('owner@sharek.local', 'owner');
  const contributorToken = await login('contributor@sharek.local', 'contributor');
  const adminToken = await login('admin@sharek.local', 'stranger');
  const requestId = await createAndAssignRequest(ownerToken, contributorToken, project.id);

  const publicBytesV1 = Buffer.from('# Public project brief\nversion one\n', 'utf8');
  const publicMaterialId = await upload({
    token: ownerToken,
    path: `/projects/${project.id}/materials`,
    title: 'Public project brief',
    visibility: 'PUBLIC',
    filename: 'brief.md',
    mimeType: 'text/markdown',
    bytes: publicBytesV1,
    label: 'public-project-material',
  });
  await waitForScan(ownerToken, publicMaterialId, 'READY', 'public-project-material');

  const contributorProjectList = await listMaterials(
    contributorToken,
    `/projects/${project.id}/materials`,
    'contributor-public-project-materials',
  );
  assert(
    contributorProjectList.some((material) => material.id === publicMaterialId),
    'published public Project Material was not visible to the contributor',
  );
  record('public-material-visible', 200, ['published-project-scope', 'contributor-can-list']);
  await download(contributorToken, publicMaterialId, 1, publicBytesV1, 'public-material');

  const publicBytesV2 = Buffer.from('# Public project brief\nversion two\n', 'utf8');
  const replacement = await callMultipart({
    path: `/materials/${publicMaterialId}/versions`,
    token: ownerToken,
    fields: { idempotencyKey: randomUUID() },
    file: {
      filename: 'brief-v2.md',
      mimeType: 'text/markdown',
      bytes: publicBytesV2,
    },
  });
  expectStatus(replacement, 201, 'append Material version');
  assert(replacement.body?.currentVersion === 2, 'replacement did not append version 2');
  assert(replacement.body?.versions?.some((version) => version.version === 1), 'version 1 was not retained');
  record('material-version-appended', replacement.status, [
    'currentVersion=2',
    'version-1-retained',
    'replacement-immutable',
  ]);
  await waitForScan(ownerToken, publicMaterialId, 'READY', 'public-material-version-2');
  await download(ownerToken, publicMaterialId, 2, publicBytesV2, 'public-material-version-2');

  const restrictedMaterialId = await upload({
    token: ownerToken,
    path: `/projects/${project.id}/materials`,
    title: 'Restricted project brief',
    visibility: 'RESTRICTED_PROJECT',
    filename: 'restricted.md',
    mimeType: 'text/markdown',
    bytes: Buffer.from('restricted project context\n', 'utf8'),
    label: 'restricted-project-material',
  });
  await waitForScan(ownerToken, restrictedMaterialId, 'READY', 'restricted-project-material');
  const beforeGrant = await call({ path: `/materials/${restrictedMaterialId}`, token: contributorToken });
  await expectNotFound(beforeGrant, 'restricted material before grant');
  record('restricted-material-denied-before-grant', beforeGrant.status, ['not-found-boundary']);

  const granted = await call({
    method: 'POST',
    path: `/materials/${restrictedMaterialId}/grants`,
    token: ownerToken,
    body: { granteeId: (await prisma.user.findUniqueOrThrow({ where: { email: 'contributor@sharek.local' } })).id, idempotencyKey: randomUUID() },
  });
  expectStatus(granted, 201, 'grant restricted Material');
  const afterGrant = await call({ path: `/materials/${restrictedMaterialId}`, token: contributorToken });
  expectStatus(afterGrant, 200, 'read restricted Material after grant');
  await download(
    contributorToken,
    restrictedMaterialId,
    1,
    Buffer.from('restricted project context\n', 'utf8'),
    'restricted-material',
  );
  record('restricted-material-granted', granted.status, ['active-assignee-required', 'download-authorized']);

  const restrictedToken = await (async () => {
    const tokenResult = await call({
      method: 'POST',
      path: `/materials/${restrictedMaterialId}/versions/1/download-token`,
      token: contributorToken,
    });
    expectStatus(tokenResult, 201, 'issue restricted token before revoke');
    return tokenResult.body.token;
  })();
  const contributor = await prisma.user.findUniqueOrThrow({
    where: { email: 'contributor@sharek.local' },
  });
  const revoked = await call({
    method: 'POST',
    path: `/materials/${restrictedMaterialId}/grants/${contributor.id}/revocations`,
    token: ownerToken,
    body: { idempotencyKey: randomUUID() },
  });
  expectStatus(revoked, 201, 'revoke restricted Material grant');
  const redeemedAfterRevoke = await fetch(
    `${baseUrl}/material-downloads?token=${encodeURIComponent(restrictedToken)}`,
    { headers: { Authorization: `Bearer ${contributorToken}` } },
  );
  await expectNotFound(
    { status: redeemedAfterRevoke.status, body: await redeemedAfterRevoke.json() },
    'redeem revoked download token',
  );
  record('restricted-material-revoked', revoked.status, [
    'grant-retained-as-revoked-history',
    'old-token-denied-at-redemption',
  ]);

  const assignmentBytes = Buffer.from('assignment-only request context\n', 'utf8');
  const assignmentMaterialId = await upload({
    token: ownerToken,
    path: `/contribution-requests/${requestId}/materials`,
    title: 'Assignment-only request context',
    visibility: 'ASSIGNMENT',
    filename: 'assignment.md',
    mimeType: 'text/markdown',
    bytes: assignmentBytes,
    label: 'assignment-request-material',
  });
  await waitForScan(ownerToken, assignmentMaterialId, 'READY', 'assignment-request-material');
  const contributorRequestList = await listMaterials(
    contributorToken,
    `/contribution-requests/${requestId}/materials`,
    'contributor-assignment-materials',
  );
  assert(
    contributorRequestList.some((material) => material.id === assignmentMaterialId),
    'active Request assignee could not see Assignment Material',
  );
  const strangerAssignmentRead = await call({ path: `/materials/${assignmentMaterialId}`, token: adminToken });
  await expectNotFound(strangerAssignmentRead, 'Assignment Material stranger read');
  await download(contributorToken, assignmentMaterialId, 1, assignmentBytes, 'assignment-material');
  record('assignment-material-authorized', 200, ['owner-and-assignee-only', 'stranger-denied']);

  const infectedMaterialId = await upload({
    token: ownerToken,
    path: `/projects/${project.id}/materials`,
    title: 'Rejected scan fixture',
    visibility: 'PUBLIC',
    filename: 'infected.txt',
    mimeType: 'text/plain',
    bytes: Buffer.from([
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$',
      'EICAR-STANDARD-',
      'ANTIVIRUS-TEST-FILE!$H+H*',
    ].join(''), 'utf8'),
    label: 'infected-material',
  });
  const infected = await waitForScan(ownerToken, infectedMaterialId, 'REJECTED', 'infected-material');
  assert(infected.versions[0].scanErrorCode === 'MATERIAL_SCAN_INFECTED', 'infected scan did not expose the stable error code');
  const infectedDownload = await call({
    method: 'POST',
    path: `/materials/${infectedMaterialId}/versions/1/download-token`,
    token: ownerToken,
  });
  await expectNotFound(infectedDownload, 'rejected Material download');
  record('infected-material-rejected', infectedDownload.status, [
    'scanStatus=REJECTED',
    'stable-infected-error-code',
    'not-downloadable',
  ]);

  const deletionToken = await (async () => {
    const tokenResult = await call({
      method: 'POST',
      path: `/materials/${publicMaterialId}/versions/1/download-token`,
      token: ownerToken,
    });
    expectStatus(tokenResult, 201, 'issue deletion fixture token');
    return tokenResult.body.token;
  })();
  const deleted = await call({
    method: 'POST',
    path: `/materials/${publicMaterialId}/deletions`,
    token: ownerToken,
    body: { idempotencyKey: randomUUID() },
  });
  expectStatus(deleted, 201, 'delete public Material');
  const ownerAfterDelete = await listMaterials(
    ownerToken,
    `/projects/${project.id}/materials`,
    'owner-deleted-material-list',
  );
  const deletedView = ownerAfterDelete.find((material) => material.id === publicMaterialId);
  assert(deletedView?.deletedAt, 'owner listing did not retain deleted Material metadata');
  assert(deletedView.versions.every((version) => version.purgedAt), 'deleted Material content was not purged');
  const readerAfterDelete = await call({ path: `/materials/${publicMaterialId}`, token: contributorToken });
  await expectNotFound(readerAfterDelete, 'deleted Material reader access');
  const redeemedAfterDelete = await fetch(
    `${baseUrl}/material-downloads?token=${encodeURIComponent(deletionToken)}`,
    { headers: { Authorization: `Bearer ${ownerToken}` } },
  );
  await expectNotFound(
    { status: redeemedAfterDelete.status, body: await redeemedAfterDelete.json() },
    'redeem deleted Material token',
  );
  record('material-deleted-and-purged', deleted.status, [
    'access-revoked-immediately',
    'raw-content-purged',
    'non-content-owner-history-retained',
    'old-token-denied',
  ]);

  console.log(JSON.stringify({ result: 'PASS', transcript }, null, 2));
}

async function cleanupFixture(projectId, ownerToken) {
  for (const materialId of createdMaterialIds) {
    if (!ownerToken) continue;
    try {
      await call({
        method: 'POST',
        path: `/materials/${materialId}/deletions`,
        token: ownerToken,
        body: { idempotencyKey: randomUUID() },
      });
    } catch {
      // Direct database cleanup below still removes rows; the route is best effort.
    }
  }

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
  const requirementSnapshotIds = applications.map((application) => application.requirement_snapshot_id).filter(Boolean);
  const evidenceSnapshotIds = applications.map((application) => application.evidence_snapshot_id).filter(Boolean);
  const assessmentRequests = await prisma.assessmentRequest.findMany({
    where: { application_id: { in: applicationIds } },
    select: { id: true },
  });
  const assessmentRequestIds = assessmentRequests.map((request) => request.id);
  const materialRows = await prisma.material.findMany({
    where: { OR: [{ project_id: projectId }, { contribution_request_id: { in: requestIds } }] },
    select: { id: true },
  });
  const materialIds = materialRows.map((material) => material.id);

  await prisma.$transaction([
    prisma.materialAudit.deleteMany({ where: { material_id: { in: materialIds } } }),
    prisma.materialGrant.deleteMany({ where: { material_id: { in: materialIds } } }),
    prisma.materialVersion.deleteMany({ where: { material_id: { in: materialIds } } }),
    prisma.material.deleteMany({ where: { id: { in: materialIds } } }),
    prisma.assessmentRequestAudit.deleteMany({ where: { assessment_request_id: { in: assessmentRequestIds } } }),
    prisma.assessmentAttempt.deleteMany({ where: { assessment_request_id: { in: assessmentRequestIds } } }),
    prisma.assessmentRequest.deleteMany({ where: { id: { in: assessmentRequestIds } } }),
    prisma.assignment.deleteMany({ where: { application_id: { in: applicationIds } } }),
    prisma.ownerDecision.deleteMany({ where: { application_id: { in: applicationIds } } }),
    prisma.applicationAudit.deleteMany({ where: { application_id: { in: applicationIds } } }),
    prisma.application.deleteMany({ where: { id: { in: applicationIds } } }),
    prisma.applicationRequirementSnapshot.deleteMany({ where: { id: { in: requirementSnapshotIds } } }),
    prisma.applicationEvidenceSnapshot.deleteMany({ where: { id: { in: evidenceSnapshotIds } } }),
    prisma.contributionRequestAudit.deleteMany({ where: { contribution_request_id: { in: requestIds } } }),
    prisma.contributionRequest.deleteMany({ where: { id: { in: requestIds } } }),
    prisma.project.deleteMany({ where: { id: projectId } }),
  ]);
}

try {
  await main();
} finally {
  try {
    if (fixtureProjectId) await cleanupFixture(fixtureProjectId, ownerToken);
  } catch (error) {
    console.error(`Cleanup failed for fixture project ${fixtureProjectId}: ${error.message}`);
  }
  await prisma.$disconnect();
}
