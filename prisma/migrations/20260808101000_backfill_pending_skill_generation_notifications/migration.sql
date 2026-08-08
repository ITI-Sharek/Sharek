-- Preserve the user-visible outcome of generations that completed before the
-- notification workflow was introduced. The deduplication key makes this
-- safe if the migration is inspected or replayed in another environment.
INSERT INTO "Notification" (
  "id",
  "user_id",
  "type",
  "title",
  "message",
  "metadata",
  "deduplication_key"
)
SELECT
  gen_random_uuid(),
  generation."user_id",
  'skill_profile_generation'::"NotificationType",
  'Skill analysis ready for review',
  format(
    'Your skill analysis is complete. %s skill%s are waiting for admin review.',
    COUNT(skill."id"),
    CASE WHEN COUNT(skill."id") = 1 THEN '' ELSE 's' END
  ),
  jsonb_build_object(
    'generationId', generation."id",
    'status', 'ready_for_review',
    'skillCount', COUNT(skill."id"),
    'selectedRepositoryCount', generation."snapshotted_repository_count"
  ),
  'skill-profile-generation:' || generation."id" || ':ready_for_review'
FROM "SkillProfileGeneration" AS generation
LEFT JOIN "SkillProfile" AS skill
  ON skill."generation_id" = generation."id"
WHERE generation."status" = 'pending_review'::"SkillProfileGenerationStatus"
  AND NOT EXISTS (
    SELECT 1
    FROM "Notification" AS existing
    WHERE existing."deduplication_key" =
      'skill-profile-generation:' || generation."id" || ':ready_for_review'
  )
GROUP BY
  generation."id",
  generation."user_id",
  generation."snapshotted_repository_count";
