import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationsDirectory = join(process.cwd(), 'prisma', 'migrations');

describe('Notification skill-generation backfill ordering', () => {
  it('keeps late-applied legacy backfills compatible with semantic constraints', () => {
    const migrations = readdirSync(migrationsDirectory).sort();
    const compatibilityMigration = migrations.find((migration) =>
      migration.includes('notification_backfill_compatibility'),
    );
    const repairMigration = migrations.find((migration) =>
      migration.includes('repair_out_of_order_skill_generation_notifications'),
    );

    expect(compatibilityMigration).toBeDefined();
    expect(repairMigration).toBeDefined();

    const compatibilitySql = readFileSync(
      join(migrationsDirectory, compatibilityMigration!, 'migration.sql'),
      'utf8',
    );
    const repairSql = readFileSync(
      join(migrationsDirectory, repairMigration!, 'migration.sql'),
      'utf8',
    );

    expect(compatibilityMigration!).toMatch(/^20260808100500_/);
    expect(repairMigration!).toMatch(/^20260808111000_/);
    expect(compatibilitySql).toMatch(/information_schema\.columns/);
    expect(compatibilitySql).toMatch(/ALTER COLUMN "template_key" DROP NOT NULL/);
    expect(compatibilitySql).toMatch(/ALTER COLUMN "parameters" DROP NOT NULL/);
    expect(repairSql).toMatch(/"template_key" IS NULL/);
    expect(repairSql).toMatch(/"parameters" IS NULL/);
    expect(repairSql).toMatch(/ALTER COLUMN "template_key" SET NOT NULL/);
    expect(repairSql).toMatch(/ALTER COLUMN "parameters" SET NOT NULL/);
  });
});
