/**
 * Replays every migration against a throwaway database and then asserts the DDL
 * the eligibility gate depends on.
 *
 * The jest suites mock Prisma, so they can prove the service *intends* to reject
 * a duplicate skill name but never that the database would refuse one — and the
 * duplicate check in the service is racy across two concurrent draft edits, so
 * the index is the real guarantee. Same for the cascade and the level enum.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const migrationsDirectory = fileURLToPath(
  new URL('../prisma/migrations/', import.meta.url),
);
const beforeFixture = fileURLToPath(
  new URL(
    '../test/migrations/contribution-request-skill-requirements-before.sql',
    import.meta.url,
  ),
);
const assertionsFixture = fileURLToPath(
  new URL(
    '../test/migrations/contribution-request-skill-requirements-assertions.sql',
    import.meta.url,
  ),
);

const sourceUrl = new URL(
  process.env.DATABASE_URL ??
    'postgresql://sharek:sharek@localhost:5432/sharek?schema=public',
);
sourceUrl.searchParams.delete('schema');

const databaseName = `sharek_skill_requirements_test_${randomUUID().replaceAll('-', '')}`;
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

  // Every migration, in order — the table is new, so nothing is skipped and the
  // run doubles as proof the whole chain still applies cleanly from empty.
  const migrations = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    applySqlFile(`${migrationsDirectory}${migration}/migration.sql`);
  }

  applySqlFile(beforeFixture);
  applySqlFile(assertionsFixture);
  console.log('Contribution Request skill requirement migration fixtures passed.');
} finally {
  if (created) {
    run('dropdb', [`--maintenance-db=${adminUrl.toString()}`, databaseName]);
  }
}
