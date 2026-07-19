import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../shared/database/database.service';
import { ApplicationError } from '../../../shared/errors/application.error';
import { GitHubTokenEncryptionService } from '../security/github-token-encryption.service';

export interface GitHubAccountStatusDto {
  connected: boolean;
  username: string | null;
  requiresReauthorization: boolean;
}

// A scope is broad when the legacy `repo` grant appears as its own token; the
// narrow `public_repo` grant must not match. Null means the grant predates
// scope tracking and cannot be proven narrow.
export function isBroadOrUnknownScope(tokenScope: string | null): boolean {
  if (tokenScope === null) {
    return true;
  }

  return tokenScope
    .split(/[\s,]+/)
    .filter(Boolean)
    .includes('repo');
}

@Injectable()
export class GitHubAccountService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tokenEncryption: GitHubTokenEncryptionService,
  ) {}

  async getStatusForUser(userId: string): Promise<GitHubAccountStatusDto> {
    const account = await this.database.gitHubAccount.findUnique({
      where: {
        user_id: userId,
      },
      select: {
        username: true,
        requires_reauthorization: true,
      },
    });

    return {
      connected: Boolean(account),
      username: account?.username ?? null,
      requiresReauthorization: account?.requires_reauthorization ?? false,
    };
  }

  async getAccessToken(userId: string): Promise<string> {
    const account = await this.database.gitHubAccount.findUnique({
      where: { user_id: userId },
    });

    if (!account) {
      throw new ApplicationError(
        'GitHub account is not connected',
        'GITHUB_ACCOUNT_NOT_CONNECTED',
        404,
      );
    }

    if (
      account.requires_reauthorization ||
      isBroadOrUnknownScope(account.token_scope)
    ) {
      throw new ApplicationError(
        'GitHub evidence access requires reauthorization with narrow consent',
        'GITHUB_REAUTHORIZATION_REQUIRED',
        403,
      );
    }

    return this.tokenEncryption.decrypt(account.access_token);
  }

  async getConnectedUsername(userId: string): Promise<string> {
    const account = await this.database.gitHubAccount.findUnique({
      where: { user_id: userId },
      select: { username: true },
    });

    if (!account) {
      throw new ApplicationError(
        'GitHub account is not connected',
        'GITHUB_ACCOUNT_NOT_CONNECTED',
        404,
      );
    }

    return account.username;
  }

  async markRepositoryImportPrepared(userId: string): Promise<void> {
    await this.database.gitHubAccount.update({
      where: { user_id: userId },
      data: {
        ingestion_status: 'pending',
        last_synced_at: new Date(),
      },
    });
  }
}
