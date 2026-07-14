-- Align historical backfilled keys with the canonical skill-name policy used
-- for newly generated pending skills.
UPDATE "SkillProfile"
SET "skill_key" = CASE "skill_key"
  WHEN 'c sharp' THEN 'c#'
  WHEN 'csharp' THEN 'c#'
  WHEN 'c plus plus' THEN 'c++'
  WHEN 'cpp' THEN 'c++'
  WHEN 'js' THEN 'javascript'
  WHEN 'node js' THEN 'node.js'
  WHEN 'nodejs' THEN 'node.js'
  WHEN 'postgres' THEN 'postgresql'
  WHEN 'ts' THEN 'typescript'
  ELSE "skill_key"
END
WHERE "skill_key" IS NOT NULL;
