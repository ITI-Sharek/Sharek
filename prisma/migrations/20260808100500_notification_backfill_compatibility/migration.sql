-- The skill-generation backfill migrations have earlier timestamps than the
-- semantic Notification migration. In an environment where the semantic
-- migration was deployed first, Prisma can apply those older backfills later.
-- Temporarily allow their legacy column list to insert; the repair migration
-- after the semantic migration restores the constraints.
DO $$
BEGIN
  IF (
    SELECT count(*) = 2
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'Notification'
      AND column_name IN ('template_key', 'parameters')
  ) THEN
    EXECUTE 'ALTER TABLE "Notification"
      ALTER COLUMN "template_key" DROP NOT NULL,
      ALTER COLUMN "parameters" DROP NOT NULL';
  END IF;
END $$;
