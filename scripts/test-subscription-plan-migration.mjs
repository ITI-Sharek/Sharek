/**
 * Replays every migration up to the plan-tier collapse against a throwaway
 * database, inserts Bronze/Silver/Gold rows as they existed before it, then
 * applies the two plan migrations and asserts what happened to those rows.
 *
 * Both migrations rewrite existing data — one remaps an enum column, the other
 * backfills the billing period — so neither is provable by the mocked jest
 * suites.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const planMigration = '20260814090000_single_paid_tier_plans';
const sourceMigration = '20260814100000_subscription_source_and_billing_period';
const migrationsDirectory = fileURLToPath(
  new URL('../prisma/migrations/', import.meta.url),
);
const beforeFixture = fileURLToPath(
  new URL('../test/migrations/subscription-plan-before.sql', import.meta.url),
);
const assertionsFixture = fileURLToPath(
  new URL('../test/migrations/subscription-plan-assertions.sql', import.meta.url),
);

const sourceUrl = new URL(
  process.env.DATABASE_URL ??
    'postgresql://sharek:sharek@localhost:5432/sharek?schema=public',
);
sourceUrl.searchParams.delete('schema');

const databaseName = `sharek_subscription_test_${randomUUID().replaceAll('-', '')}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = '/postgres';
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });

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
    if (migration === planMigration) break;
    applySqlFile(`${migrationsDirectory}${migration}/migration.sql`);
  }

  applySqlFile(beforeFixture);
  applySqlFile(`${migrationsDirectory}${planMigration}/migration.sql`);
  applySqlFile(`${migrationsDirectory}${sourceMigration}/migration.sql`);
  applySqlFile(assertionsFixture);
  console.log('Subscription plan migration fixtures passed.');
} finally {
  if (created) {
    run('dropdb', [`--maintenance-db=${adminUrl.toString()}`, databaseName]);
  }
}
