-- Proves the raw partial unique index this migration adds outside
-- schema.prisma (Prisma cannot express a WHERE clause on an index):
--
--   CREATE UNIQUE INDEX "assignment_call_participation_one_active_per_user"
--     ON "AssignmentCallParticipation" ("user_id") WHERE "active";
--
-- This is the only thing that makes "one active Assignment Call per user,
-- platform-wide" (COMMUNICATION.md rule 8) a Postgres guarantee rather than
-- an application-level race -- no mocked jest suite can prove a real unique
-- constraint holds under a genuine second insert.

\set ON_ERROR_STOP on

-- The index must actually exist, scoped to WHERE active -- not just any
-- unique index on user_id, and not a full (non-partial) one either.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE indexname = 'assignment_call_participation_one_active_per_user'
      AND tablename = 'AssignmentCallParticipation'
      AND indexdef ILIKE '%WHERE%active%'
  ) THEN
    RAISE EXCEPTION 'assignment_call_participation_one_active_per_user index is missing or not partial';
  END IF;
END;
$$;

-- Minimal chain: User -> Project -> ContributionRequest -> Application ->
-- OwnerDecision -> Assignment -> AssignmentConversation -> AssignmentCall,
-- so two real AssignmentCall rows exist to attach participations to.
INSERT INTO "User" ("id", "email", "first_name", "last_name", "role", "status")
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner@example.test', 'Owen', 'Owner', 'owner', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'contributor@example.test', 'Cara', 'Contributor', 'contributor', 'active');

INSERT INTO "Project" ("id", "owner_id", "title", "slug", "slug_normalized", "github_repo_url")
VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Test Project', 'test-project', 'test-project',
  'https://github.com/example/test-project'
);

INSERT INTO "ContributionRequest" ("id", "project_id", "owner_id", "title", "description", "status")
VALUES (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Test Request', 'A request used only to anchor an Assignment.', 'assigned'
);

INSERT INTO "Application" ("id", "contribution_request_id", "contributor_id", "status", "submitted_at")
VALUES (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'accepted', NOW()
);

INSERT INTO "OwnerDecision" (
  "id", "application_id", "contribution_request_id", "owner_id",
  "decision_type", "idempotency_key", "command_fingerprint"
) VALUES (
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'accepted', 'owner-decision-key-1', repeat('a', 64)
);

INSERT INTO "Assignment" (
  "id", "contribution_request_id", "application_id", "owner_decision_id",
  "contributor_id", "agreed_delivery_duration_days", "agreed_delivery_due_at"
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  5, NOW() + INTERVAL '5 days'
);

INSERT INTO "AssignmentConversation" ("id", "assignment_id")
VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');

-- Two distinct AssignmentCall rows between the same pair of users -- the
-- scenario a real "start a second call while already on one" race produces.
INSERT INTO "AssignmentCall" ("id", "conversation_id", "caller_id", "callee_id", "idempotency_key")
VALUES
  (
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'call-key-1'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'call-key-2'
  );

DO $$
BEGIN
  -- The owner's first active participation, on the first call, must succeed.
  INSERT INTO "AssignmentCallParticipation" ("id", "call_id", "user_id", "role", "active")
  VALUES (
    '55555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'caller', true
  );

  -- A second active participation for the SAME user on a DIFFERENT call must
  -- violate the partial unique index -- this is the "one active call per
  -- user, platform-wide" guarantee itself.
  BEGIN
    INSERT INTO "AssignmentCallParticipation" ("id", "call_id", "user_id", "role", "active")
    VALUES (
      '66666666-6666-4666-8666-666666666666',
      '44444444-4444-4444-8444-444444444444',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'caller', true
    );
    RAISE EXCEPTION 'a second active participation for the same user was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- The callee gets their own independent active participation on the same
  -- first call, without conflict -- the index is scoped per user, not per call.
  INSERT INTO "AssignmentCallParticipation" ("id", "call_id", "user_id", "role", "active")
  VALUES (
    '77777777-7777-4777-8777-777777777777',
    '33333333-3333-4333-8333-333333333333',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'callee', true
  );

  -- The callee is also blocked from a second concurrent active call.
  BEGIN
    INSERT INTO "AssignmentCallParticipation" ("id", "call_id", "user_id", "role", "active")
    VALUES (
      '88888888-8888-4888-8888-888888888888',
      '44444444-4444-4444-8444-444444444444',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'callee', true
    );
    RAISE EXCEPTION 'a second active participation for the callee was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END;
$$;

-- The rejected inserts left no trace: only the two original rows exist, both
-- still active, and no row was ever created for the second call.
DO $$
DECLARE
  active_count INTEGER;
  second_call_rows INTEGER;
BEGIN
  SELECT count(*) INTO active_count
  FROM "AssignmentCallParticipation"
  WHERE "active" = true;
  IF active_count <> 2 THEN
    RAISE EXCEPTION 'expected exactly 2 active participations to remain, found %', active_count;
  END IF;

  SELECT count(*) INTO second_call_rows
  FROM "AssignmentCallParticipation"
  WHERE "call_id" = '44444444-4444-4444-8444-444444444444';
  IF second_call_rows <> 0 THEN
    RAISE EXCEPTION 'the second call unexpectedly gained a participation row (found %)', second_call_rows;
  END IF;
END;
$$;

-- Ending the first call (deactivating both participations) is what actually
-- frees each user to start or join a new one -- the same transition
-- AssignmentCallsService.end / the ring-timeout sweep perform.
UPDATE "AssignmentCallParticipation"
SET "active" = false, "left_at" = NOW()
WHERE "call_id" = '33333333-3333-4333-8333-333333333333';

INSERT INTO "AssignmentCallParticipation" ("id", "call_id", "user_id", "role", "active")
VALUES (
  '99999999-9999-4999-8999-999999999999',
  '44444444-4444-4444-8444-444444444444',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'caller', true
);

SELECT 'assignment_call_participation_one_active_per_user holds' AS result;
