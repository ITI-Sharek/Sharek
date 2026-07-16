export interface GitHubAccountDto {
  id: string;
  githubId: string;
  username: string;
  avatarUrl: string | null;
  profileUrl: string | null;
  ingestionStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
  connectedAt: Date;
  lastSyncedAt: Date | null;
}

export interface GitHubOAuthStartDto {
  authorizationUrl: string;
  state: string;
  expiresAt: Date;
}
