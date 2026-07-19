/**
 * SEC-003 legacy remediation entrypoint.
 *
 * Usage (from backend/, with production env configured):
 *   pnpm remediate:github-legacy           # flag accounts + quarantine snapshots
 *   pnpm remediate:github-legacy --purge   # delete quarantined snapshots + legacy tokens
 *
 * Both modes are idempotent and safe to retry; see
 * docs/operations/github-legacy-remediation.md for the runbook.
 */
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { GitHubRemediationService } from '../src/modules/github/services/github-remediation.service';

async function main(): Promise<void> {
  const purge = process.argv.includes('--purge');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const remediation = app.get(GitHubRemediationService);
    const results = purge
      ? await remediation.purge()
      : await remediation.remediate();

    for (const step of results) {
      console.log(
        `${step.action}: ${step.result} affected=${step.affectedCount}`,
      );
    }

    if (results.some((step) => step.result === 'failed')) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch(() => {
  // Error details are intentionally not printed: they can wrap responses that
  // reference private repositories or credentials.
  console.error('GitHub legacy remediation failed to run');
  process.exitCode = 1;
});
