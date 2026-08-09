import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

const baseUrl = process.env.SHAREK_DEMO_BASE_URL ?? 'http://127.0.0.1:4000';
const password = process.env.SHAREK_DEMO_PASSWORD;
const prisma = new PrismaClient();
const transcript = [];
let fixtureProjectId;
let fixtureMaterialId;
let ownerToken;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(step, status, assertions) {
  transcript.push({ step, httpStatus: status, assertions });
}

async function call({ method = 'GET', path, token, body }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
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
  form.append('file', new Blob([file.bytes], { type: file.mimeType }), file.filename);
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const payload = await response.json();
  return { status: response.status, body: payload };
}

function expectStatus(result, expected, label) {
  assert(
    result.status === expected,
    `${label}: expected HTTP ${expected}, received ${result.status}: ${JSON.stringify(result.body)}`,
  );
}

async function login() {
  const result = await call({
    method: 'POST',
    path: '/auth/login',
    body: { email: 'owner@sharek.local', password },
  });
  expectStatus(result, 201, 'owner login');
  assert(result.body?.tokens?.accessToken, 'owner login did not return a token');
  record('owner-login', result.status, ['authenticated', 'credentials-redacted']);
  return result.body.tokens.accessToken;
}

async function waitForReady(materialId) {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    last = await call({ path: `/materials/${materialId}`, token: ownerToken });
    expectStatus(last, 200, 'analysis Material read');
    if (last.body?.versions?.[0]?.scanStatus === 'READY') return last.body;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`analysis Material did not reach READY: ${JSON.stringify(last?.body)}`);
}

async function waitForRun(runId) {
  const deadline = Date.now() + 150_000;
  let last;
  while (Date.now() < deadline) {
    last = await call({ path: `/material-analysis/runs/${runId}`, token: ownerToken });
    expectStatus(last, 200, 'analysis Run read');
    if (last.body?.status === 'COMPLETED') return last.body;
    if (last.body?.status === 'FAILED') {
      throw new Error(`analysis Run failed: ${JSON.stringify(last.body)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`analysis Run did not complete: ${JSON.stringify(last?.body)}`);
}

async function main() {
  assert(password, 'SHAREK_DEMO_PASSWORD is required');
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: 'owner@sharek.local' },
  });
  const slug = `s4-material-analysis-${randomUUID().replace(/-/g, '')}`;
  const project = await prisma.project.create({
    data: {
      owner_id: owner.id,
      title: 'Sprint 4 Material Analysis Runtime Fixture',
      slug,
      slug_normalized: slug,
      description: 'Disposable fixture for the TASK-4-11 runtime gate.',
      github_repo_url: `https://github.com/ITI-Sharek/Sharek-${slug}`,
      technologies: ['NestJS'],
      status: 'draft',
    },
  });
  fixtureProjectId = project.id;
  ownerToken = await login();

  const uploaded = await callMultipart({
    path: `/projects/${project.id}/materials`,
    token: ownerToken,
    fields: {
      title: 'Analysis brief',
      visibility: 'PUBLIC',
      idempotencyKey: randomUUID(),
    },
    file: {
      filename: 'analysis-brief.md',
      mimeType: 'text/markdown',
      bytes: Buffer.from(
        '# Sharek analysis fixture\nBuild a web application with a React interface and a NestJS API.\n',
        'utf8',
      ),
    },
  });
  expectStatus(uploaded, 201, 'analysis Material upload');
  fixtureMaterialId = uploaded.body.id;
  await waitForReady(fixtureMaterialId);
  record('analysis-material-ready', 200, [
    'quarantined-upload',
    'clean-scan-release',
    'owner-boundary',
  ]);

  const constraints = await call({
    path: `/projects/${project.id}/material-analysis/constraints`,
    token: ownerToken,
  });
  expectStatus(constraints, 200, 'analysis constraints');
  assert(constraints.body.maxDocuments >= 1, 'analysis limits were not returned');
  record('analysis-constraints', constraints.status, [
    'server-configured-document-limit',
    'server-configured-character-limit',
    'supported-mime-types',
  ]);

  const set = await call({
    method: 'POST',
    path: `/projects/${project.id}/material-analysis/sets`,
    token: ownerToken,
    body: { materialVersions: [{ materialId: fixtureMaterialId, version: 1 }] },
  });
  expectStatus(set, 201, 'create Analysis Set');
  const started = await call({
    method: 'POST',
    path: `/material-analysis/sets/${set.body.id}/runs`,
    token: ownerToken,
  });
  expectStatus(started, 201, 'start Analysis Run');
  assert(['REQUESTED', 'RUNNING', 'COMPLETED'].includes(started.body.status), 'Run was not queued');
  record('analysis-run-queued', started.status, [
    'explicit-owner-command',
    'requested-or-running-lifecycle',
    'queue-backed-processing',
  ]);

  const completed = await waitForRun(started.body.id);
  const chunkCount = await prisma.materialAnalysisChunk.count({
    where: { run_id: started.body.id },
  });
  assert(chunkCount > 0, 'completed Run did not persist vector chunks');
  assert(completed.suggestions.length > 0, 'provider returned no draft suggestions');
  record('analysis-run-completed', 200, [
    'authenticated-AI-contract',
    'strict-provenance-validated',
    'private-suggestions-persisted',
    'pgvector-chunk-persisted',
  ]);

  const projectSuggestion = completed.suggestions.find(
    (suggestion) => suggestion.type === 'PROJECT_UPDATE' && suggestion.status === 'PENDING',
  );
  assert(projectSuggestion, 'provider returned no pending Project suggestion');
  const reviewTarget = completed.suggestions.find(
    (suggestion) => suggestion.id !== projectSuggestion.id && suggestion.status === 'PENDING',
  );
  assert(reviewTarget, 'provider returned only one pending suggestion');
  const rejected = await call({
    method: 'POST',
    path: `/material-analysis/suggestions/${reviewTarget.id}/reject`,
    token: ownerToken,
  });
  expectStatus(rejected, 201, 'reject Draft Suggestion');
  assert(rejected.body.status === 'REJECTED', 'suggestion rejection was not persisted');
  record('suggestion-rejected', rejected.status, [
    'explicit-review-command',
    'source-provenance-retained',
  ]);

  const adopted = await call({
    method: 'POST',
    path: `/material-analysis/suggestions/${projectSuggestion.id}/adopt-project`,
    token: ownerToken,
    body: { expectedRevision: 1, idempotencyKey: randomUUID() },
  });
  expectStatus(adopted, 201, 'adopt Project Suggestion');
  assert(adopted.body.suggestion?.status === 'ACCEPTED', 'Project adoption was not persisted');
  record('project-suggestion-adopted', adopted.status, [
    'owning-Project-service-command',
    'revision-checked',
    'explicit-adoption-only',
  ]);

  const deleted = await call({
    method: 'POST',
    path: `/materials/${fixtureMaterialId}/deletions`,
    token: ownerToken,
    body: { idempotencyKey: randomUUID() },
  });
  expectStatus(deleted, 201, 'delete analysis Material');
  const remainingChunks = await prisma.materialAnalysisChunk.count({
    where: { run_id: started.body.id },
  });
  assert(remainingChunks === 0, 'source deletion left vector chunks behind');
  const afterDelete = await call({
    path: `/material-analysis/runs/${started.body.id}`,
    token: ownerToken,
  });
  expectStatus(afterDelete, 200, 'read reviewed Run after source deletion');
  assert(
    afterDelete.body.suggestions.every((suggestion) => suggestion.sourceRemovedAt),
    'source deletion did not mark suggestion provenance as removed',
  );
  record('analysis-source-cleanup', deleted.status, [
    'raw-vector-content-deleted',
    'suggestion-audit-retained',
    'source-removal-marked',
  ]);

  console.log(JSON.stringify({ result: 'PASS', transcript }, null, 2));
}

async function cleanupFixture() {
  if (!fixtureProjectId) return;
  try {
    if (fixtureMaterialId && ownerToken) {
      await call({
        method: 'POST',
        path: `/materials/${fixtureMaterialId}/deletions`,
        token: ownerToken,
        body: { idempotencyKey: randomUUID() },
      });
    }
  } catch {
    // Direct cleanup below remains the final safety net.
  }
  const materials = await prisma.material.findMany({
    where: { project_id: fixtureProjectId },
    select: { id: true },
  });
  const materialIds = materials.map((material) => material.id);
  await prisma.$transaction([
    prisma.materialAnalysisChunk.deleteMany({ where: { material_id: { in: materialIds } } }),
    prisma.materialAnalysisSetVersion.deleteMany({ where: { material_id: { in: materialIds } } }),
    prisma.materialAudit.deleteMany({ where: { material_id: { in: materialIds } } }),
    prisma.materialGrant.deleteMany({ where: { material_id: { in: materialIds } } }),
    prisma.materialVersion.deleteMany({ where: { material_id: { in: materialIds } } }),
    prisma.material.deleteMany({ where: { id: { in: materialIds } } }),
    prisma.project.deleteMany({ where: { id: fixtureProjectId } }),
  ]);
}

try {
  await main();
} finally {
  try {
    await cleanupFixture();
  } catch (error) {
    console.error(`Cleanup failed for fixture project ${fixtureProjectId}: ${error.message}`);
  }
  await prisma.$disconnect();
}
