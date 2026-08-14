-- An AiMatchResult row as it existed while `notification_sent` was still on the
-- table, so the drop can be asserted against real data rather than an empty
-- table.

INSERT INTO "User" (id, email, password_hash, first_name, last_name, role, status)
VALUES
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'match-owner@example.test', 'x', 'Match', 'Owner', 'owner', 'active'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 'match-contributor@example.test', 'x', 'Match', 'Contributor', 'contributor', 'active');

INSERT INTO "Project" (id, owner_id, title, slug, slug_normalized, github_repo_url, status, created_at, updated_at)
VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
        'Match Project', 'match-project', 'match-project', 'https://github.com/example/match', 'published',
        '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z');

INSERT INTO "ContributionRequest" (id, project_id, owner_id, title, description, status, published_at, created_at, updated_at)
VALUES ('ffffffff-ffff-4fff-8fff-fffffffffff1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
        'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'Match Request', 'Description', 'published',
        '2026-07-02T00:00:00Z', '2026-07-02T00:00:00Z', '2026-07-02T00:00:00Z');

INSERT INTO "AiMatchResult" (id, contribution_request_id, contributor_id, match_score, rank, notification_sent)
VALUES ('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1', 'ffffffff-ffff-4fff-8fff-fffffffffff1',
        'dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 0.75, 1, true);
