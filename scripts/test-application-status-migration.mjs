import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const databaseUrl = new URL(
  process.env.DATABASE_URL ??
    'postgresql://sharek:sharek@localhost:5432/sharek?schema=public',
);
databaseUrl.searchParams.delete('schema');

const testFile = fileURLToPath(
  new URL('../test/migrations/application-owner-review-states.sql', import.meta.url),
);
const result = spawnSync(
  'psql',
  [databaseUrl.toString(), '-X', '-v', 'ON_ERROR_STOP=1', '-f', testFile],
  { stdio: 'inherit' },
);

if (result.error) {
  console.error(`Unable to run PostgreSQL migration test: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
