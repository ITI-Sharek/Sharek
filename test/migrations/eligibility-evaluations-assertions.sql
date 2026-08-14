-- The CHECK is the whole reason this file exists: Prisma cannot express it, so
-- no schema-derived test can prove it, and the mocked jest suites never touch
-- real DDL. A row that belongs to neither a Request nor a Proposal — or to both
-- — is a refusal nobody can attribute, which defeats the point of an
-- append-only evaluation log.

\set ON_ERROR_STOP on

INSERT INTO "User" (
  "id", "email", "password_hash", "first_name", "last_name",
  "role", "status", "created_at", "updated_at"
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'contributor@example.com', 'hash', 'Contributor', 'Example',
  'contributor', 'active', NOW(), NOW()
);

-- A Request-scoped evaluation inserts normally.
INSERT INTO "EligibilityEvaluation" (
  "id", "contributor_id", "contribution_request_id", "outcome",
  "blocking_skills", "requirement_snapshot_version", "evaluated_at"
) VALUES (
  'e1111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '33333333-3333-4333-8333-333333333333',
  'blocked',
  '[{"skillName": "react", "requiredLevel": "advanced", "contributorLevel": "beginner"}]'::jsonb,
  1, NOW()
);

DO $$
BEGIN
  -- Neither target.
  BEGIN
    INSERT INTO "EligibilityEvaluation" (
      "id", "contributor_id", "outcome", "blocking_skills",
      "requirement_snapshot_version", "evaluated_at"
    ) VALUES (
      'e2222222-2222-4222-8222-222222222222',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'blocked', '[]'::jsonb, 1, NOW()
    );
    RAISE EXCEPTION 'an evaluation with no target was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Both targets.
  INSERT INTO "ContributionProposal" (
    "id", "project_id", "proposer_id", "status", "disclosure_version",
    "disclosure_acknowledged_at", "created_at", "updated_at"
  ) VALUES (
    'f1111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'pending', 'v1', NOW(), NOW(), NOW()
  );
  BEGIN
    INSERT INTO "EligibilityEvaluation" (
      "id", "contributor_id", "contribution_request_id",
      "contribution_proposal_id", "outcome", "blocking_skills",
      "requirement_snapshot_version", "evaluated_at"
    ) VALUES (
      'e3333333-3333-4333-8333-333333333333',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '33333333-3333-4333-8333-333333333333',
      'f1111111-1111-4111-8111-111111111111',
      'blocked', '[]'::jsonb, 1, NOW()
    );
    RAISE EXCEPTION 'an evaluation with two targets was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- A Proposal-scoped evaluation is valid, so the P0-B04 path is already
  -- storable and does not need a second migration.
  INSERT INTO "EligibilityEvaluation" (
    "id", "contributor_id", "contribution_proposal_id", "outcome",
    "blocking_skills", "requirement_snapshot_version", "evaluated_at"
  ) VALUES (
    'e4444444-4444-4444-8444-444444444444',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'f1111111-1111-4111-8111-111111111111',
    'eligible', '[]'::jsonb, 1, NOW()
  );

  -- An outcome outside the vocabulary must be impossible at the storage layer.
  -- There is deliberately no third value: a provider outage is a retriable
  -- error, never an outcome recorded against a contributor.
  BEGIN
    EXECUTE $inner$
      INSERT INTO "EligibilityEvaluation" (
        "id", "contributor_id", "contribution_request_id", "outcome",
        "blocking_skills", "requirement_snapshot_version", "evaluated_at"
      ) VALUES (
        'e5555555-5555-4555-8555-555555555555',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '33333333-3333-4333-8333-333333333333',
        'unavailable', '[]'::jsonb, 1, NOW()
      )
    $inner$;
    RAISE EXCEPTION 'outcome accepted a value outside the vocabulary';
  EXCEPTION WHEN invalid_text_representation THEN
    NULL;
  END;

  -- The evaluation must not be deletable as a side effect of removing the
  -- contributor: it is the record of why they were refused.
  BEGIN
    DELETE FROM "User" WHERE "id" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    RAISE EXCEPTION 'deleting a contributor silently discarded their evaluations';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END;
$$;

SELECT 'eligibility evaluation constraints hold' AS result;
