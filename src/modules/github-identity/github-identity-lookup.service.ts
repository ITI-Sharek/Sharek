import { Injectable } from '@nestjs/common';
import { AuthProvider } from '@prisma/client';

import { DatabaseService } from '../../shared/database/database.service';

export interface GitHubIdentity {
  providerAccountId: string;
  username: string | null;
}

@Injectable()
export class GitHubIdentityLookupService {
  constructor(private readonly database: DatabaseService) {}

  async getGitHubIdentityForUser(userId: string): Promise<GitHubIdentity | null> {
    const account = await this.database.authProviderAccount.findUnique({
      where: {
        provider_user_id: {
          provider: AuthProvider.github,
          user_id: userId,
        },
      },
      select: {
        provider_account_id: true,
        username: true,
      },
    });

    return account
      ? {
          providerAccountId: account.provider_account_id,
          username: account.username,
        }
      : null;
  }
}
