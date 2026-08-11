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
const lateBackfillFixture = fileURLToPath(
  new URL('../test/migrations/notification-skill-generation-before.sql', import.meta.url),
);
const lateBackfillAssertions = fileURLToPath(
  new URL('../test/migrations/notification-backfill-order-assertions.sql', import.meta.url),
);

const sourceUrl = new URL(
  process.env.DATABASE_URL ??
    'postgresql://sharek:sharek@localhost:5432/sharek?schema=public',
);
sourceUrl.searchParams.delete('schema');

const databaseName = `sharek_notification_test_${randomUUID().replaceAll('-', '')}`;
const lateDatabaseName = `sharek_notification_order_test_${randomUUID().replaceAll('-', '')}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = '/postgres';
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;
const lateTestUrl = new URL(sourceUrl);
lateTestUrl.pathname = `/${lateDatabaseName}`;

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

function applySqlFileTo(databaseUrl, file) {
  run('psql', [databaseUrl.toString(), '-X', '-v', 'ON_ERROR_STOP=1', '-f', file]);
}

let created = false;
let lateCreated = false;
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

  run('createdb', [`--maintenance-db=${adminUrl.toString()}`, lateDatabaseName]);
  lateCreated = true;

  const skillGenerationMigration =
    '20260808100000_skill_profile_generation_notifications';
  const compatibilityMigration =
    '20260808100500_notification_backfill_compatibility';
  const pendingBackfills = migrations.filter((migration) =>
    migration === '20260808101000_backfill_pending_skill_generation_notifications' ||
    migration === '20260808102000_backfill_admin_skill_generation_notifications',
  );
  for (const migration of migrations) {
    if (migration === skillGenerationMigration) break;
    applySqlFileTo(
      lateTestUrl,
      `${migrationsDirectory}${migration}/migration.sql`,
    );
  }
  applySqlFileTo(
    lateTestUrl,
    `${migrationsDirectory}${skillGenerationMigration}/migration.sql`,
  );
  applySqlFileTo(lateTestUrl, beforeFixture);
  applySqlFileTo(lateTestUrl, lateBackfillFixture);
  applySqlFileTo(
    lateTestUrl,
    `${migrationsDirectory}${targetMigration}/migration.sql`,
  );
  applySqlFileTo(
    lateTestUrl,
    `${migrationsDirectory}${compatibilityMigration}/migration.sql`,
  );
  for (const migration of pendingBackfills) {
    applySqlFileTo(
      lateTestUrl,
      `${migrationsDirectory}${migration}/migration.sql`,
    );
  }
  applySqlFileTo(
    lateTestUrl,
    `${migrationsDirectory}20260808111000_repair_out_of_order_skill_generation_notifications/migration.sql`,
  );
  applySqlFileTo(lateTestUrl, lateBackfillAssertions);
  console.log('Semantic Notification migration fixtures passed.');
} finally {
  if (created) {
    run('dropdb', [`--maintenance-db=${adminUrl.toString()}`, databaseName]);
  }
  if (lateCreated) {
    run('dropdb', [`--maintenance-db=${adminUrl.toString()}`, lateDatabaseName]);
  }
}
