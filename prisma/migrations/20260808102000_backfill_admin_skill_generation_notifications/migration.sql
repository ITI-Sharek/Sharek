-- Give active admins a durable inbox item for every completed analysis that
-- is already waiting in the review queue. The recipient-specific key keeps
-- this safe for multiple admins and for repeated deployments.
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
  admin."id",
  'skill_profile_generation'::"NotificationType",
  'Skill analysis awaiting admin review',
  format(
    'A contributor has a completed skill analysis with %s skill%s waiting for your review.',
    COUNT(skill."id"),
    CASE WHEN COUNT(skill."id") = 1 THEN '' ELSE 's' END
  ),
  jsonb_build_object(
    'generationId', generation."id",
    'status', 'ready_for_review',
    'skillCount', COUNT(skill."id"),
    'selectedRepositoryCount', generation."snapshotted_repository_count",
    'audience', 'admin'
  ),
  'skill-profile-generation:' || generation."id" || ':ready_for_review:admin:' || admin."id"
FROM "SkillProfileGeneration" AS generation
CROSS JOIN "User" AS admin
LEFT JOIN "SkillProfile" AS skill
  ON skill."generation_id" = generation."id"
WHERE generation."status" = 'pending_review'::"SkillProfileGenerationStatus"
  AND admin."role" = 'admin'::"UserRole"
  AND admin."status" = 'active'::"UserStatus"
  AND NOT EXISTS (
    SELECT 1
    FROM "Notification" AS existing
    WHERE existing."deduplication_key" =
      'skill-profile-generation:' || generation."id" || ':ready_for_review:admin:' || admin."id"
  )
GROUP BY
  generation."id",
  generation."snapshotted_repository_count",
  admin."id";
