-- Minimum graph needed to attach a skill requirement to a Contribution Request:
-- an owner, a project, and a draft Request. Every value is fixed so the
-- assertions below can name rows rather than discover them.

INSERT INTO "User" (
  "id", "email", "password_hash", "first_name", "last_name",
  "role", "status", "created_at", "updated_at"
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'owner@example.com', 'hash', 'Owner', 'Example',
  'owner', 'active', NOW(), NOW()
);

INSERT INTO "Project" (
  "id", "owner_id", "title", "slug", "slug_normalized", "description",
  "github_repo_url", "status", "created_at", "updated_at"
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'Gate Fixture Project', 'gate-fixture-project', 'gate-fixture-project',
  'A project used by the skill-requirement migration harness.',
  'https://github.com/example/gate-fixture', 'published', NOW(), NOW()
);

INSERT INTO "ContributionRequest" (
  "id", "project_id", "owner_id", "title", "description",
  "technology_tags", "status", "max_applicants", "created_at", "updated_at"
) VALUES (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'Ship the eligibility gate',
  'A Contribution Request used by the skill-requirement migration harness.',
  '[]'::jsonb, 'draft', 1, NOW(), NOW()
);
