import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const targetMigration = '20260813150000_payment_checkout_handoff';
const migrationsDirectory = fileURLToPath(
  new URL('../prisma/migrations/', import.meta.url),
);
const assertionsFile = fileURLToPath(
  new URL('../test/migrations/payment-persistence-assertions.sql', import.meta.url),
);

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required to run the payment persistence migration test',
  );
}

const sourceUrl = new URL(process.env.DATABASE_URL);
sourceUrl.searchParams.delete('schema');

const databaseName = `sharek_payment_test_${randomUUID().replaceAll('-', '')}`;
const connectionEnvironment = {
  ...process.env,
  PGHOST: sourceUrl.hostname,
  PGPORT: sourceUrl.port || undefined,
  PGUSER: decodeURIComponent(sourceUrl.username),
  PGPASSWORD: decodeURIComponent(sourceUrl.password),
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: connectionEnvironment,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${command} exited with ${result.status}`);
  }
  return result;
}

function applySqlFile(file) {
  run('psql', [databaseName, '-X', '-v', 'ON_ERROR_STOP=1', '-f', file]);
}

let created = false;
try {
  run('createdb', ['--maintenance-db=postgres', databaseName]);
  created = true;

  const migrations = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    if (migration === targetMigration) break;
    applySqlFile(`${migrationsDirectory}${migration}/migration.sql`);
  }

  applySqlFile(`${migrationsDirectory}${targetMigration}/migration.sql`);
  applySqlFile(assertionsFile);
  console.log('PAY-02/PAY-03 payment persistence migration round-trip passed.');
} finally {
  if (created) {
    run('dropdb', ['--maintenance-db=postgres', databaseName]);
  }
}
