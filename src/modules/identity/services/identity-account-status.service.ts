import { Injectable } from '@nestjs/common';
import { AuthProvider, UserRole, UserStatus } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import {
  ConflictApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';

export interface ContributorActivationResultDto {
  userId: string;
  activated: boolean;
  status: 'pending' | 'active' | 'suspended' | 'deactivated';
}

@Injectable()
export class IdentityAccountStatusService {
  constructor(private readonly database: DatabaseService) {}

  async getGitHubIdentityForUser(
    userId: string,
  ): Promise<{ providerAccountId: string; username: string | null } | null> {
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

  async activateContributorAfterSkillApproval(
    userId: string,
  ): Promise<ContributorActivationResultDto> {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundApplicationError(
        'Contributor account was not found',
        'CONTRIBUTOR_ACCOUNT_NOT_FOUND',
      );
    }

    if (user.role !== UserRole.contributor) {
      throw new ConflictApplicationError(
        'Only contributor accounts can be activated by skill review',
        'CONTRIBUTOR_ACCOUNT_ROLE_INVALID',
        { role: user.role },
      );
    }

    if (user.status !== UserStatus.pending) {
      return {
        userId: user.id,
        activated: false,
        status: user.status,
      };
    }

    const updateResult = await this.database.user.updateMany({
      where: {
        id: user.id,
        status: UserStatus.pending,
      },
      data: {
        status: UserStatus.active,
      },
    });

    if (updateResult.count !== 1) {
      return {
        userId: user.id,
        activated: false,
        status: UserStatus.pending,
      };
    }

    const updatedUser = await this.database.user.findUniqueOrThrow({
      where: {
        id: user.id,
      },
      select: {
        id: true,
        status: true,
      },
    });

    return {
      userId: updatedUser.id,
      activated: true,
      status: updatedUser.status,
    };
  }
}
