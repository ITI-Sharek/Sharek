/**
 * Replays every migration against a throwaway database and then asserts the
 * raw partial unique index the `assignment_calls` migration adds outside
 * schema.prisma:
 *
 *   CREATE UNIQUE INDEX "assignment_call_participation_one_active_per_user"
 *     ON "AssignmentCallParticipation" ("user_id") WHERE "active";
 *
 * Prisma cannot express a WHERE clause on an index, so nothing derived from
 * schema.prisma can prove it, and the mocked jest suites never touch real
 * DDL -- a real second insert against a real unique index is the only thing
 * that actually proves "one active Assignment Call per user, platform-wide"
 * (COMMUNICATION.md rule 8).
 */
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const migrationsDirectory = fileURLToPath(
  new URL('../prisma/migrations/', import.meta.url),
);
const assertionsFixture = fileURLToPath(
  new URL(
    '../test/migrations/assignment-call-participation-unique-assertions.sql',
    import.meta.url,
  ),
);

const sourceUrl = new URL(
  process.env.DATABASE_URL ??
    'postgresql://sharek:sharek@localhost:5432/sharek?schema=public',
);
sourceUrl.searchParams.delete('schema');

const databaseName = `sharek_assignment_calls_test_${randomUUID().replaceAll('-', '')}`;
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

  // Every migration, in order -- the whole accumulated chain (User through
  // the last `assignment_calls` migration) has to exist for the fixture
  // below to attach real participations to real calls.
  const migrations = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    applySqlFile(`${migrationsDirectory}${migration}/migration.sql`);
  }

  applySqlFile(assertionsFixture);
  console.log('Assignment Call participation partial unique index holds.');
} finally {
  if (created) {
    run('dropdb', [`--maintenance-db=${adminUrl.toString()}`, databaseName]);
  }
}
