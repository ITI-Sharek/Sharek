import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { DatabaseService } from '../../../../shared/database/database.service';
import {
  ContributorProfileRepository,
  ContributorProfileWithUser,
} from '../../application/ports/contributor-profile.repository';

@Injectable()
export class PrismaContributorProfileRepository
  implements ContributorProfileRepository
{
  constructor(private readonly database: DatabaseService) {}

  findByUserId(userId: string): Promise<ContributorProfileWithUser | null> {
    return this.database.contributorProfile.findUnique({
      where: {
        user_id: userId,
      },
      include: {
        user: true,
      },
    });
  }

  findByUsername(username: string): Promise<ContributorProfileWithUser | null> {
    return this.database.contributorProfile.findFirst({
      where: {
        user: {
          username,
        },
      },
      include: {
        user: true,
      },
    });
  }

  async createForUser(userId: string): Promise<ContributorProfileWithUser> {
    try {
      return await this.database.contributorProfile.create({
        data: {
          user_id: userId,
        },
        include: {
          user: true,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const existing = await this.findByUserId(userId);
        if (existing) {
          return existing;
        }
      }

      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002') ||
      (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002')
    );
  }
}
