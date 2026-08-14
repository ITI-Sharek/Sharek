-- What the mocked jest suites structurally cannot prove: that the DDL is real.
-- The unique index and the cascade are the two guarantees the application code
-- relies on and does not enforce itself.

\set ON_ERROR_STOP on

-- A first row inserts normally.
INSERT INTO "ContributionRequestSkillRequirement" (
  "id", "contribution_request_id", "skill_name", "skill_name_normalized",
  "required_level", "kind", "source", "confidence", "position"
) VALUES (
  '44444444-4444-4444-8444-444444444444',
  '33333333-3333-4333-8333-333333333333',
  'React', 'react', 'advanced', 'required', 'ai_inferred', 'high', 0
);

-- An owner override carries no confidence. The column must accept NULL.
INSERT INTO "ContributionRequestSkillRequirement" (
  "id", "contribution_request_id", "skill_name", "skill_name_normalized",
  "required_level", "kind", "source", "confidence", "position"
) VALUES (
  '55555555-5555-4555-8555-555555555555',
  '33333333-3333-4333-8333-333333333333',
  'Node.js', 'nodejs', 'intermediate', 'required', 'owner_override', NULL, 1
);

DO $$
BEGIN
  -- THE INVARIANT: one normalized skill name per Request. The service rejects
  -- duplicates before they reach here, but that check is racy across two
  -- concurrent draft edits — this index is the guarantee.
  BEGIN
    INSERT INTO "ContributionRequestSkillRequirement" (
      "id", "contribution_request_id", "skill_name", "skill_name_normalized",
      "required_level", "kind", "source", "confidence", "position"
    ) VALUES (
      '66666666-6666-4666-8666-666666666666',
      '33333333-3333-4333-8333-333333333333',
      'NodeJS', 'nodejs', 'beginner', 'preferred', 'ai_inferred', 'low', 2
    );
    RAISE EXCEPTION
      'the unique index on (contribution_request_id, skill_name_normalized) is missing';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- The same normalized name against a *different* Request is fine: the index
  -- is scoped per Request, not global.
  INSERT INTO "ContributionRequest" (
    "id", "project_id", "owner_id", "title", "description",
    "technology_tags", "status", "max_applicants", "created_at", "updated_at"
  ) VALUES (
    '77777777-7777-4777-8777-777777777777',
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'A second Request', 'Another Request in the same project.',
    '[]'::jsonb, 'draft', 1, NOW(), NOW()
  );
  INSERT INTO "ContributionRequestSkillRequirement" (
    "id", "contribution_request_id", "skill_name", "skill_name_normalized",
    "required_level", "kind", "source", "confidence", "position"
  ) VALUES (
    '88888888-8888-4888-8888-888888888888',
    '77777777-7777-4777-8777-777777777777',
    'Node.js', 'nodejs', 'beginner', 'required', 'ai_inferred', 'medium', 0
  );

  -- An out-of-vocabulary level must be impossible at the storage layer, not
  -- merely unlikely: the eligibility comparison is a total order over exactly
  -- these three values and has no defined answer for a fourth.
  BEGIN
    EXECUTE $inner$
      INSERT INTO "ContributionRequestSkillRequirement" (
        "id", "contribution_request_id", "skill_name", "skill_name_normalized",
        "required_level", "kind", "source", "position"
      ) VALUES (
        '99999999-9999-4999-8999-999999999999',
        '33333333-3333-4333-8333-333333333333',
        'Rust', 'rust', 'expert', 'required', 'ai_inferred', 3
      )
    $inner$;
    RAISE EXCEPTION 'required_level accepted a level outside the platform vocabulary';
  EXCEPTION WHEN invalid_text_representation THEN
    NULL;
  END;

  -- Deleting the Request takes its skill requirements with it. Orphaned rows
  -- would be a bar with nothing to apply to.
  DELETE FROM "ContributionRequest"
  WHERE "id" = '77777777-7777-4777-8777-777777777777';

  IF EXISTS (
    SELECT 1 FROM "ContributionRequestSkillRequirement"
    WHERE "contribution_request_id" = '77777777-7777-4777-8777-777777777777'
  ) THEN
    RAISE EXCEPTION 'skill requirements survived deletion of their Contribution Request';
  END IF;

  -- Applications submitted before the gate existed must read as "no bar".
  IF (
    SELECT "column_default" FROM "information_schema"."columns"
    WHERE "table_name" = 'ApplicationRequirementSnapshot'
      AND "column_name" = 'skill_requirements'
  ) IS DISTINCT FROM '''[]''::jsonb' THEN
    RAISE EXCEPTION
      'ApplicationRequirementSnapshot.skill_requirements lost its empty default';
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- THE SNAPSHOT IS A COPY, NOT A REFERENCE
-- ═══════════════════════════════════════════════════════════════════════════
-- ADR 0015's freeze rule only holds if the Application's record of the bar
-- survives the source rows changing. A mocked suite cannot prove this — it
-- would be asserting that a stubbed return value equals itself. Here the source
-- rows are genuinely deleted and the snapshot is genuinely re-read.

INSERT INTO "User" (
  "id", "email", "password_hash", "first_name", "last_name",
  "role", "status", "created_at", "updated_at"
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'contributor@example.com', 'hash', 'Contributor', 'Example',
  'contributor', 'active', NOW(), NOW()
);

INSERT INTO "ApplicationRequirementSnapshot" (
  "id", "contribution_request_id", "source_request_updated_at",
  "requirements", "skill_requirements", "created_at"
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '33333333-3333-4333-8333-333333333333',
  NOW(),
  '[]'::jsonb,
  '[{"skillName": "React", "skillNameNormalized": "react", "requiredLevel": "advanced", "kind": "required", "position": 0}]'::jsonb,
  NOW()
);

INSERT INTO "Application" (
  "id", "contribution_request_id", "contributor_id",
  "requirement_snapshot_id", "status", "submitted_at", "created_at", "updated_at"
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '33333333-3333-4333-8333-333333333333',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'pending_owner_review', NOW(), NOW(), NOW()
);

-- The owner's set changes completely: React is gone, Rust is required instead.
DELETE FROM "ContributionRequestSkillRequirement"
WHERE "contribution_request_id" = '33333333-3333-4333-8333-333333333333';

INSERT INTO "ContributionRequestSkillRequirement" (
  "id", "contribution_request_id", "skill_name", "skill_name_normalized",
  "required_level", "kind", "source", "confidence", "position"
) VALUES (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '33333333-3333-4333-8333-333333333333',
  'Rust', 'rust', 'advanced', 'required', 'owner_override', NULL, 0
);

DO $$
DECLARE
  snapshot_skills JSONB;
BEGIN
  SELECT "skill_requirements" INTO snapshot_skills
  FROM "ApplicationRequirementSnapshot"
  WHERE "id" = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  IF snapshot_skills -> 0 ->> 'skillName' IS DISTINCT FROM 'React' THEN
    RAISE EXCEPTION
      'the Application snapshot followed a later edit to the Request: %',
      snapshot_skills;
  END IF;

  IF jsonb_array_length(snapshot_skills) <> 1 THEN
    RAISE EXCEPTION 'the Application snapshot changed size after a Request edit';
  END IF;
END;
$$;

SELECT 'contribution request skill requirement constraints hold' AS result;
