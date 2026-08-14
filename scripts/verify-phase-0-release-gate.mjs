/**
 * Phase 0 release gate (P0-Q01, #119).
 *
 * Runs the named suites that prove the eligibility gate works end to end and
 * that the phase stands on its own. Deterministic by construction: every suite
 * below uses a mocked database, a controlled clock and stubbed providers, so a
 * rerun months from now produces the same result and **no paid model call is
 * ever made**. A live provider is never release authority.
 *
 *   node scripts/verify-phase-0-release-gate.mjs [--cross-repo]
 *
 * Cross-repository mode additionally runs the Frontend suites that render the
 * block and the AI suites that own the inference contract, so the three
 * repositories are proven against each other rather than each against its own
 * mocks.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const crossRepo = process.argv.includes('--cross-repo');

/** The journey, the two contribution paths, guidance, and independence. */
const backendSuites = [
  'test/phase-0-release-gate.e2e-spec.ts',
  'test/eligibility-gate.e2e-spec.ts',
  'test/proposal-eligibility-gate.e2e-spec.ts',
  'test/eligibility-guidance.e2e-spec.ts',
  'test/requirement-inference.e2e-spec.ts',
  'src/modules/eligibility/services/skill-level-comparison.spec.ts',
  'src/modules/eligibility/services/eligibility.service.spec.ts',
  'src/modules/contribution-proposals/services/proposal-eligibility.service.spec.ts',
  'src/modules/skill-guidance/services/eligibility-guidance.service.spec.ts',
  'src/modules/skill-guidance/services/eligibility-guidance-processor.service.spec.ts',
  'src/modules/contribution-tasks/services/contribution-request-skill-requirements.service.spec.ts',
  'src/modules/contribution-tasks/services/requirement-inference-processor.service.spec.ts',
  'src/modules/ai/integrations/requirement-inference.client.spec.ts',
  // Regression: the pre-Phase-0 submission path must still behave identically.
  'test/applications.e2e-spec.ts',
  'src/modules/applications/applications.service.spec.ts',
];

const frontendSuites = [
  'src/modules/eligibility/components/eligibility-block-panel.test.tsx',
  'src/modules/eligibility/utils/blocking-skills.test.ts',
  'src/modules/contribution-requests/components/contributor-contribution-request-detail-view.interaction.test.tsx',
];

const aiSuites = ['tests/test_requirement_inference_contract.py'];

/**
 * Files Phase 0 introduced that a contributor's request can reach.
 *
 * Checked as source rather than as rendered output, because the rule is about
 * what can *ever* be shown. A comment promising a tier gate is how the next
 * person learns one is expected.
 */
const phaseZeroSurfaces = [
  'src/modules/eligibility/services/eligibility.service.ts',
  'src/modules/eligibility/services/skill-level-comparison.ts',
  'src/modules/eligibility/dto/eligibility.dto.ts',
  'src/modules/eligibility/eligibility.controller.ts',
  'src/modules/skill-guidance/services/eligibility-guidance.service.ts',
  'src/modules/skill-guidance/controllers/eligibility-guidance.controller.ts',
  'src/modules/skill-guidance/dto/eligibility-guidance.dto.ts',
  'src/modules/contribution-proposals/services/proposal-eligibility.service.ts',
];

const forbiddenOnPhaseZeroSurfaces = [
  'gold',
  'upgrade',
  'paymob',
  'checkout',
  'commission',
  'payout',
  'escrow',
];

function run(command, args, cwd, extraEnvironment = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnvironment },
  });
}

/**
 * The independence gate, as a static check.
 *
 * The suites prove the gate *reaches a verdict* without a subscription; this
 * proves no Phase 0 surface can mention money at all. Both are needed: the
 * first is about behaviour, the second about what a future edit could
 * introduce without anyone noticing.
 */
function verifyNoMonetizationOnPhaseZeroSurfaces() {
  const offences = [];
  for (const surface of phaseZeroSurfaces) {
    const source = readFileSync(join(backendRoot, surface), 'utf8').toLowerCase();
    for (const term of forbiddenOnPhaseZeroSurfaces) {
      if (source.includes(term)) offences.push(`${surface}: ${term}`);
    }
  }
  if (offences.length > 0) {
    throw new Error(
      `Phase 0 surfaces must not mention monetization:\n  ${offences.join('\n  ')}`,
    );
  }
  console.log(
    `Independence: ${phaseZeroSurfaces.length} Phase 0 surfaces mention no plan, tier, or money.`,
  );
}

/**
 * The gate must not depend on any Phase 1-3 module being wired.
 *
 * Asserted on imports rather than at runtime: a Phase 0 file that imports the
 * subscriptions or payments module has taken the dependency whether or not the
 * current code path happens to execute it.
 */
function verifyNoMonetizationImports() {
  const offences = [];
  for (const surface of phaseZeroSurfaces) {
    const source = readFileSync(join(backendRoot, surface), 'utf8');
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      if (/modules\/(subscriptions|payments)/.test(match[1])) {
        offences.push(`${surface} imports ${match[1]}`);
      }
    }
  }
  if (offences.length > 0) {
    throw new Error(
      `Phase 0 must not depend on a monetization module:\n  ${offences.join('\n  ')}`,
    );
  }
  console.log('Independence: no Phase 0 surface imports subscriptions or payments.');
}

verifyNoMonetizationOnPhaseZeroSurfaces();
verifyNoMonetizationImports();

// `--runInBand` so the evidence is a stable, ordered transcript rather than
// interleaved worker output.
run('npx', ['jest', '--runInBand', ...backendSuites], backendRoot);

const result = {
  gate: 'P0-Q01',
  mode: crossRepo ? 'cross-repository' : 'backend-ci',
  independenceChecks: 'passed',
  backendSuites: backendSuites.length,
};

if (crossRepo) {
  if (!process.env.SHAREK_FRONTEND_ROOT || !process.env.SHAREK_AI_ROOT) {
    throw new Error('Cross-repository mode requires Frontend and AI roots');
  }
  const frontendRoot = resolve(process.env.SHAREK_FRONTEND_ROOT);
  const aiRoot = resolve(process.env.SHAREK_AI_ROOT);
  if (!existsSync(frontendRoot) || !existsSync(aiRoot)) {
    throw new Error('Cross-repository mode requires valid Frontend and AI roots');
  }

  // Plain `pnpm`, not `corepack pnpm`: the Frontend package.json has no
  // packageManager field, so corepack resolves its own bundled default rather
  // than the pinned pnpm the checkout was installed with.
  run('pnpm', ['exec', 'vitest', 'run', ...frontendSuites], frontendRoot);

  const aiPython = process.env.SHAREK_AI_PYTHON ?? join(aiRoot, '.venv/bin/python');
  run(aiPython, ['-m', 'pytest', '-q', ...aiSuites], aiRoot, {
    PYTHONPATH: join(aiRoot, 'src'),
  });
  run(aiPython, ['-m', 'compileall', '-q', 'src'], aiRoot);

  result.frontendSuites = frontendSuites.length;
  result.aiSuites = aiSuites.length;
}

console.log(`\n${JSON.stringify(result, null, 2)}`);
console.log('\nPhase 0 release gate passed.');
