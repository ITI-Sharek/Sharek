import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontendRoot = resolve(
  process.env.SHAREK_FRONTEND_ROOT ?? join(backendRoot, '..', 'Frontend'),
);
const aiRoot = resolve(
  process.env.SHAREK_AI_ROOT ?? join(backendRoot, '..', 'AI_Agents'),
);

const checks = [];

function read(root, relativePath) {
  const path = join(root, relativePath);
  if (!existsSync(path)) throw new Error(`Missing release-gate file: ${path}`);
  return readFileSync(path, 'utf8');
}

function requires(root, relativePath, patterns) {
  const content = read(root, relativePath);
  for (const pattern of patterns) {
    if (!pattern.test(content)) {
      throw new Error(`${relativePath} does not satisfy ${pattern}`);
    }
  }
  checks.push(relativePath);
}

function sha(root) {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

requires(backendRoot, 'src/modules/contribution-tasks/controllers/contribution-tasks.controller.ts', [
  /@Post\('projects\/:projectId\/contribution-requests'\)/,
  /@Post\('contribution-requests\/:requestId\/publish'\)/,
]);
requires(backendRoot, 'src/modules/applications/applications.controller.ts', [
  /@Post\('tasks\/:requestId\/applications'\)/,
  /@Post\('applications\/:applicationId\/accept'\)/,
  /@Post\('applications\/:applicationId\/decline'\)/,
  /@Post\('applications\/:applicationId\/assessment-requests'\)/,
]);
requires(backendRoot, 'src/modules/applications/applications.service.spec.ts', [
  /keeps pending Applications visible and decidable regardless of AI assessment state/,
  /accepts exactly one pending Application with AI assessment state/,
]);
requires(backendRoot, 'src/modules/contribution-proposals/contribution-proposals.controller.ts', [
  /@Post\(':proposalId\/versions'\)/,
  /@Post\(':proposalId\/revision-requests'\)/,
  /@Post\(':proposalId\/accept'\)/,
]);
requires(backendRoot, 'src/modules/contribution-proposals/contribution-proposals.service.spec.ts', [
  /accepts a pending proposal and creates one attributed draft Request/,
]);

requires(frontendRoot, 'src/modules/contribution-requests/services/applications.service.ts', [
  /\/assessment-requests/,
  /\/accept/,
  /\/decline/,
]);
requires(frontendRoot, 'src/modules/contribution-requests/components/advisory-fit-assessment.test.tsx', [
  /without making it a decision gate/,
]);
requires(frontendRoot, 'src/modules/contribution-proposals/services/contribution-proposals.service.ts', [
  /\/versions/,
  /\/revision-requests/,
  /\/accept/,
]);
requires(frontendRoot, 'src/modules/contribution-proposals/components/proposal-editor.tsx', [
  /لا يمنحني القبول إسناد العمل أو/,
  /أولوية الاختيار/,
]);

requires(aiRoot, 'src/sharek_agents/main.py', [/\/advisory-fit\/assess/]);
requires(aiRoot, 'src/sharek_agents/agents/advisory_fit/schemas.py', [
  /NOT_STARTED_NO_ASSESSABLE_EVIDENCE/,
  /NOT_STARTED_SYSTEM_LIMIT/,
  /extra="forbid"/,
]);
requires(aiRoot, 'tests/test_advisory_fit_contract.py', [
  /requires_the_shared_service_token/,
  /unauthorized_output/,
]);

const request = JSON.parse(
  read(backendRoot, 'test/fixtures/sprint4-core/advisory-fit-request.json'),
);
const response = JSON.parse(
  read(backendRoot, 'test/fixtures/sprint4-core/advisory-fit-response.json'),
);
const requirements = new Map(request.requirements.map((item) => [item.id, item.kind]));
const allowed = new Set(request.allowedEvidenceIds);
if (response.findings.length !== requirements.size) {
  throw new Error('Advisory Fit fixture does not cover every Requirement exactly once');
}
for (const finding of response.findings) {
  if (requirements.get(finding.requirementId) !== finding.requirementKind) {
    throw new Error('Advisory Fit fixture changed Requirement classification');
  }
  if (finding.citations.some((citation) => !allowed.has(citation))) {
    throw new Error('Advisory Fit fixture cites unauthorized evidence');
  }
}
const serialized = JSON.stringify(response).toLowerCase();
for (const prohibited of ['eligibility', 'recommendation', 'applicationstatus', 'rank', 'score']) {
  if (serialized.includes(prohibited)) {
    throw new Error(`Advisory Fit fixture contains prohibited authority: ${prohibited}`);
  }
}

console.log(JSON.stringify({
  gate: 'S4-B11',
  status: 'contract-fixtures-passed',
  repositories: {
    backend: sha(backendRoot),
    frontend: sha(frontendRoot),
    ai: sha(aiRoot),
  },
  checkedFiles: checks.length,
}, null, 2));
