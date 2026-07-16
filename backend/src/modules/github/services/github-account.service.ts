import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../shared/database/database.service';
import { ApplicationError } from '../../../shared/errors/application.error';
import { GitHubTokenEncryptionService } from '../security/github-token-encryption.service';

export interface GitHubAccountStatusDto {
  connected: boolean;
  username: string | null;
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
      },
    });

    return {
      connected: Boolean(account),
      username: account?.username ?? null,
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
