import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const databaseUrl = new URL(
  process.env.DATABASE_URL ??
    'postgresql://sharek:sharek@localhost:5432/sharek?schema=public',
);
databaseUrl.searchParams.delete('schema');

const mappingTestFile = fileURLToPath(
  new URL('../test/migrations/application-owner-review-states.sql', import.meta.url),
);
const mappingResult = spawnSync(
  'psql',
  [databaseUrl.toString(), '-X', '-v', 'ON_ERROR_STOP=1', '-f', mappingTestFile],
  { stdio: 'inherit' },
);

if (mappingResult.error) {
  console.error(
    `Unable to run PostgreSQL migration test: ${mappingResult.error.message}`,
  );
  process.exit(1);
}
if (mappingResult.status !== 0) process.exit(mappingResult.status ?? 1);

const guardTestFile = fileURLToPath(
  new URL(
    '../test/migrations/application-owner-review-draft-guard.sql',
    import.meta.url,
  ),
);
const guardResult = spawnSync(
  'psql',
  [databaseUrl.toString(), '-X', '-v', 'ON_ERROR_STOP=1', '-f', guardTestFile],
  { encoding: 'utf8' },
);

if (guardResult.error) {
  console.error(
    `Unable to run PostgreSQL migration guard test: ${guardResult.error.message}`,
  );
  process.exit(1);
}

const expectedGuardMessage =
  'Cannot migrate unresolved Applications attached to a draft Contribution Request';
if (
  guardResult.status === 0 ||
  !guardResult.stderr.includes(expectedGuardMessage)
) {
  process.stderr.write(guardResult.stderr);
  console.error('Draft-parent migration guard did not fail as expected.');
  process.exit(1);
}

console.log('Draft-parent migration guard rejected invalid legacy history.');
