import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(backendRoot, 'test/fixtures/sprint4-core');
const crossRepo = process.argv.includes('--cross-repo');

const backendSuites = [
  'test/contribution-requests.e2e-spec.ts',
  'test/contribution-request-public-lifecycle.e2e-spec.ts',
  'test/applications.e2e-spec.ts',
  'test/contribution-proposals.e2e-spec.ts',
  'src/modules/applications/applications.service.spec.ts',
  'src/modules/applications/services/advisory-fit-assessment.service.spec.ts',
  'src/modules/ai/integrations/advisory-fit.client.spec.ts',
  'src/modules/contribution-proposals/contribution-proposals.service.spec.ts',
];

const frontendSuites = [
  'src/modules/contribution-requests/services/applications.service.test.ts',
  'src/modules/contribution-requests/components/advisory-fit-assessment.test.tsx',
  'src/modules/contribution-requests/components/owner-application-review.test.tsx',
  'src/modules/contribution-proposals/services/contribution-proposals.service.test.ts',
  'src/modules/contribution-proposals/components/proposal-components.test.tsx',
  'src/modules/contribution-requests/components/contribution-request-components.test.tsx',
];

function json(relativePath) {
  return JSON.parse(readFileSync(join(fixtureRoot, relativePath), 'utf8'));
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} keys differ: ${actual.join(', ')}`);
  }
}

function assertString(value, label, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new Error(`${label} must be a non-blank string up to ${maximum} chars`);
  }
}

function validateCanonicalFixtures() {
  const request = json('advisory-fit-request.json');
  const response = json('advisory-fit-response.json');
  exactKeys(
    request,
    [
      'assessmentRequestId',
      'requirements',
      'evidence',
      'allowedEvidenceIds',
      'requestedAt',
      'contractVersion',
    ],
    'request',
  );
  if (request.contractVersion !== 'advisory-fit-v1') {
    throw new Error('Unexpected Advisory Fit contract version');
  }
  const requirements = new Map();
  for (const [index, requirement] of request.requirements.entries()) {
    exactKeys(requirement, ['id', 'kind', 'position', 'text'], `requirement ${index}`);
    assertString(requirement.id, `requirement ${index} id`, 200);
    assertString(requirement.text, `requirement ${index} text`, 5000);
    if (!['required', 'preferred'].includes(requirement.kind)) {
      throw new Error(`requirement ${index} has an invalid kind`);
    }
    if (!Number.isInteger(requirement.position) || requirement.position < 0) {
      throw new Error(`requirement ${index} has an invalid position`);
    }
    if (requirements.has(requirement.id)) throw new Error('Duplicate Requirement ID');
    requirements.set(requirement.id, requirement.kind);
  }

  const evidenceIds = new Set();
  for (const [index, capsule] of request.evidence.entries()) {
    const allowedKeys = capsule.summary === undefined
      ? ['evidenceId', 'type', 'label']
      : ['evidenceId', 'type', 'label', 'summary'];
    exactKeys(capsule, allowedKeys, `evidence capsule ${index}`);
    assertString(capsule.evidenceId, `evidence capsule ${index} id`, 250);
    assertString(capsule.label, `evidence capsule ${index} label`, 200);
    if (!['approved_skill', 'github_repository'].includes(capsule.type)) {
      throw new Error(`evidence capsule ${index} has an invalid type`);
    }
    if (capsule.summary !== undefined) {
      assertString(capsule.summary, `evidence capsule ${index} summary`, 1000);
    }
    if (evidenceIds.has(capsule.evidenceId)) throw new Error('Duplicate evidence ID');
    evidenceIds.add(capsule.evidenceId);
  }
  const allowlist = new Set(request.allowedEvidenceIds);
  if (
    allowlist.size !== request.allowedEvidenceIds.length ||
    allowlist.size !== evidenceIds.size ||
    [...allowlist].some((id) => !evidenceIds.has(id))
  ) {
    throw new Error('Evidence allowlist must exactly match unique capsule IDs');
  }

  exactKeys(response, ['status', 'findings', 'metadata'], 'response');
  if (response.status !== 'COMPLETED') throw new Error('Fixture must be completed');
  const findingIds = new Set();
  for (const [index, finding] of response.findings.entries()) {
    exactKeys(
      finding,
      [
        'requirementId',
        'requirementKind',
        'finding',
        'confidence',
        'citations',
        'uncertainty',
        'explanation',
      ],
      `finding ${index}`,
    );
    if (findingIds.has(finding.requirementId)) throw new Error('Duplicate finding ID');
    findingIds.add(finding.requirementId);
    if (requirements.get(finding.requirementId) !== finding.requirementKind) {
      throw new Error('Finding changed or invented a Requirement');
    }
    if (finding.citations.some((citation) => !allowlist.has(citation))) {
      throw new Error('Finding cites evidence outside the allowlist');
    }
  }
  if (findingIds.size !== requirements.size) {
    throw new Error('Findings must cover every Requirement exactly once');
  }
  const serialized = JSON.stringify(response).toLowerCase();
  for (const prohibited of [
    'eligibility',
    'recommendation',
    'applicationstatus',
    'rank',
    'score',
  ]) {
    if (serialized.includes(prohibited)) {
      throw new Error(`Response contains prohibited authority: ${prohibited}`);
    }
  }
}

function run(command, args, cwd, extraEnvironment = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnvironment },
  });
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function verifyReviewedCheckout(root, expected) {
  if (git(root, ['status', '--porcelain'])) {
    throw new Error(`${expected.repository} reviewed checkout is not clean`);
  }
  const head = git(root, ['rev-parse', 'HEAD']);
  if (head !== expected.sha) {
    throw new Error(`${expected.repository} HEAD ${head} != reviewed ${expected.sha}`);
  }
  execFileSync('git', ['merge-base', '--is-ancestor', expected.defaultRef, 'HEAD'], {
    cwd: root,
    stdio: 'inherit',
  });
  return head;
}

validateCanonicalFixtures();
run('npx', ['jest', '--runInBand', ...backendSuites], backendRoot);

const result = {
  gate: 'S4-B11',
  mode: crossRepo ? 'cross-repository' : 'backend-ci',
  canonicalFixtureValidation: 'passed',
  backendContractSuites: backendSuites.length,
};

if (crossRepo) {
  const revisions = json('reviewed-revisions.json');
  if (!process.env.SHAREK_FRONTEND_ROOT || !process.env.SHAREK_AI_ROOT) {
    throw new Error('Cross-repository mode requires Frontend and AI roots');
  }
  const frontendRoot = resolve(process.env.SHAREK_FRONTEND_ROOT);
  const aiRoot = resolve(process.env.SHAREK_AI_ROOT);
  if (!existsSync(frontendRoot) || !existsSync(aiRoot)) {
    throw new Error('Cross-repository mode requires valid Frontend and AI roots');
  }
  result.frontend = verifyReviewedCheckout(frontendRoot, revisions.frontend);
  result.ai = verifyReviewedCheckout(aiRoot, revisions.ai);
  run(
    'corepack',
    ['pnpm', 'exec', 'vitest', 'run', ...frontendSuites],
    frontendRoot,
  );
  const aiPython = process.env.SHAREK_AI_PYTHON ?? join(aiRoot, '.venv/bin/python');
  const schemaCheck = [
    'import json,sys',
    'from sharek_agents.agents.advisory_fit.schemas import AdvisoryFitInput,AdvisoryFitResult',
    'AdvisoryFitInput.model_validate(json.load(open(sys.argv[1])))',
    'AdvisoryFitResult.model_validate(json.load(open(sys.argv[2])))',
  ].join(';');
  run(
    aiPython,
    [
      '-c',
      schemaCheck,
      join(fixtureRoot, 'advisory-fit-request.json'),
      join(fixtureRoot, 'advisory-fit-response.json'),
    ],
    aiRoot,
    { PYTHONPATH: join(aiRoot, 'src') },
  );
  run(
    aiPython,
    ['-m', 'pytest', '-q', 'tests/test_advisory_fit_contract.py'],
    aiRoot,
    { PYTHONPATH: join(aiRoot, 'src') },
  );
  result.frontendContractSuites = frontendSuites.length;
  result.aiCanonicalSchemaAndHttpTests = 'passed';
}

console.log(`\n${JSON.stringify(result, null, 2)}`);
