import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const targetMigration = '20260808110000_durable_realtime_notifications';
const migrationsDirectory = fileURLToPath(
  new URL('../prisma/migrations/', import.meta.url),
);
const beforeFixture = fileURLToPath(
  new URL('../test/migrations/notification-semantic-before.sql', import.meta.url),
);
const assertionsFixture = fileURLToPath(
  new URL('../test/migrations/notification-semantic-assertions.sql', import.meta.url),
);

const sourceUrl = new URL(
  process.env.DATABASE_URL ??
    'postgresql://sharek:sharek@localhost:5432/sharek?schema=public',
);
sourceUrl.searchParams.delete('schema');

const databaseName = `sharek_notification_test_${randomUUID().replaceAll('-', '')}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = '/postgres';
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
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
  run('psql', [testUrl.toString(), '-X', '-v', 'ON_ERROR_STOP=1', '-f', file]);
}

let created = false;
try {
  run('createdb', [`--maintenance-db=${adminUrl.toString()}`, databaseName]);
  created = true;

  const migrations = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    if (migration === targetMigration) break;
    applySqlFile(`${migrationsDirectory}${migration}/migration.sql`);
  }

  applySqlFile(beforeFixture);
  applySqlFile(
    `${migrationsDirectory}${targetMigration}/migration.sql`,
  );
  applySqlFile(assertionsFixture);
  console.log('Semantic Notification migration fixtures passed.');
} finally {
  if (created) {
    run('dropdb', [`--maintenance-db=${adminUrl.toString()}`, databaseName]);
  }
}
