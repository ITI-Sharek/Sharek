INSERT INTO "User" (
  "id", "email", "first_name", "last_name", "role", "status", "preferred_language"
) VALUES (
  '10000000-0000-4000-8000-000000000001',
  'notification-migration@example.com',
  'Migration',
  'Recipient',
  'contributor',
  'active',
  'en'
);

INSERT INTO "Notification" (
  "id", "user_id", "type", "title", "message", "metadata", "is_read", "read_at"
) VALUES
(
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'application_status',
  'Application accepted',
  'Your Application was accepted.',
  '{"action":"accepted","applicationId":"30000000-0000-4000-8000-000000000001","contributionRequestId":"40000000-0000-4000-8000-000000000001"}'::jsonb,
  false,
  NULL
),
(
  '20000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'proposal_status',
  'Legacy malformed proposal',
  'A retained legacy body.',
  '{"action":"unknown"}'::jsonb,
  false,
  NULL
),
(
  '20000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  'skill_review',
  'Skill profile approved',
  'Your TypeScript skill was approved.',
  '{"skillProfileId":"50000000-0000-4000-8000-000000000001","skillName":"TypeScript","approved":true,"activated":true}'::jsonb,
  true,
  '2026-08-08T10:00:00.000Z'
),
(
  '20000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001',
  'application_status',
  'New Application received',
  'A contributor submitted an Application.',
  '{"action":"submitted","applicationId":"30000000-0000-4000-8000-000000000002","contributionRequestId":"40000000-0000-4000-8000-000000000002"}'::jsonb,
  false,
  NULL
),
(
  '20000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000001',
  'application_status',
  'Application withdrawn',
  'A contributor withdrew an Application.',
  '{"action":"withdrawn","applicationId":"30000000-0000-4000-8000-000000000003","contributionRequestId":"40000000-0000-4000-8000-000000000003"}'::jsonb,
  false,
  NULL
),
(
  '20000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000001',
  'application_status',
  'Application declined by owner',
  'The owner declined an Application.',
  '{"action":"declined_by_owner","applicationId":"30000000-0000-4000-8000-000000000004","contributionRequestId":"40000000-0000-4000-8000-000000000004"}'::jsonb,
  false,
  NULL
),
(
  '20000000-0000-4000-8000-000000000007',
  '10000000-0000-4000-8000-000000000001',
  'application_status',
  'Another contributor was selected',
  'Another contributor was selected.',
  '{"action":"not_selected","applicationId":"30000000-0000-4000-8000-000000000005","contributionRequestId":"40000000-0000-4000-8000-000000000005"}'::jsonb,
  false,
  NULL
),
(
  '20000000-0000-4000-8000-000000000008',
  '10000000-0000-4000-8000-000000000001',
  'application_status',
  'Application awaiting review',
  'An Application is awaiting review.',
  '{"action":"owner_review_reminder","applicationId":"30000000-0000-4000-8000-000000000006","contributionRequestId":"40000000-0000-4000-8000-000000000006"}'::jsonb,
  false,
  NULL
),
(
  '20000000-0000-4000-8000-000000000009',
  '10000000-0000-4000-8000-000000000001',
  'application_status',
  'Application review window expired',
  'The Application review window expired.',
  '{"action":"expired","applicationId":"30000000-0000-4000-8000-000000000007","contributionRequestId":"40000000-0000-4000-8000-000000000007"}'::jsonb,
  false,
  NULL
),
(
  '20000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  'proposal_status',
  'Proposal revision requested',
  'The owner requested a revision.',
  '{"action":"revision_requested","proposalId":"60000000-0000-4000-8000-000000000001","projectId":"70000000-0000-4000-8000-000000000001","revisionRequestSequence":2}'::jsonb,
  false,
  NULL
),
(
  '20000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000001',
  'proposal_status',
  'Proposal accepted',
  'The owner accepted a Proposal.',
  '{"action":"accepted","proposalId":"60000000-0000-4000-8000-000000000002","projectId":"70000000-0000-4000-8000-000000000002","resultingContributionRequestId":"40000000-0000-4000-8000-000000000008"}'::jsonb,
  false,
  NULL
),
(
  '20000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000001',
  'proposal_status',
  'Proposal declined',
  'The owner declined a Proposal.',
  '{"action":"declined","proposalId":"60000000-0000-4000-8000-000000000003","projectId":"70000000-0000-4000-8000-000000000003"}'::jsonb,
  false,
  NULL
),
(
  '20000000-0000-4000-8000-000000000013',
  '10000000-0000-4000-8000-000000000001',
  'skill_review',
  'Skill approved',
  'Your Python skill was approved.',
  '{"skillProfileId":"50000000-0000-4000-8000-000000000002","skillName":"Python","approved":true,"activated":false}'::jsonb,
  false,
  NULL
),
(
  '20000000-0000-4000-8000-000000000014',
  '10000000-0000-4000-8000-000000000001',
  'skill_review',
  'Skill review update',
  'Your Go skill was not approved.',
  '{"skillProfileId":"50000000-0000-4000-8000-000000000003","skillName":"Go","approved":false,"activated":false}'::jsonb,
  false,
  NULL
);
