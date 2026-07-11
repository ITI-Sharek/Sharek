import { Injectable } from '@nestjs/common';

import { ContributorProfileGitHubStatusDto } from '../../../contributor-profiles/application/dto/contributor-profile.dto';
import { DatabaseService } from '../../../../shared/database/database.service';

@Injectable()
export class GitHubProfileStatusReaderService {
  constructor(private readonly database: DatabaseService) {}

  async getStatusForUser(userId: string): Promise<ContributorProfileGitHubStatusDto> {
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
}
