import { GitHubAccount } from '@prisma/client';

import { GitHubAccountDto } from '../dto/github-account.dto';

export function toGitHubAccountDto(account: GitHubAccount): GitHubAccountDto {
  return {
    id: account.id,
    githubId: account.github_id,
    username: account.username,
    avatarUrl: account.avatar_url,
    profileUrl: account.profile_url,
    ingestionStatus: account.ingestion_status,
    connectedAt: account.connected_at,
    lastSyncedAt: account.last_synced_at,
  };
}
