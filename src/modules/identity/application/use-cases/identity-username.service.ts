import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';

import { DatabaseService } from '../../../../shared/database/database.service';
import {
  ConflictApplicationError,
  NotFoundApplicationError,
  UnprocessableApplicationError,
} from '../../../../shared/errors/application.error';
import { buildUsernameCandidates } from '../../domain/username/username.policy';

@Injectable()
export class IdentityUsernameService {
  constructor(private readonly database: DatabaseService) {}

  async ensureContributorUsername(userId: string): Promise<User> {
    const user = await this.database.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new NotFoundApplicationError('User was not found', 'USER_NOT_FOUND');
    }

    return this.ensureContributorUsernameForUser(user);
  }

  async ensureContributorUsernameForUser(user: User): Promise<User> {
    if (user.role !== 'contributor' || user.username) {
      return user;
    }

    const candidates = buildUsernameCandidates({
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
    });

    if (candidates.length === 0) {
      throw new UnprocessableApplicationError(
        'Contributor profile source data cannot produce a valid username',
        'INVALID_PROFILE_SOURCE',
      );
    }

    for (const candidate of candidates) {
      const currentUser = await this.database.user.findUnique({
        where: {
          id: user.id,
        },
      });

      if (!currentUser) {
        throw new NotFoundApplicationError('User was not found', 'USER_NOT_FOUND');
      }

      if (currentUser.username) {
        return currentUser;
      }

      try {
        return await this.database.user.update({
          where: {
            id: user.id,
          },
          data: {
            username: candidate,
          },
        });
      } catch (error) {
        if (this.isUniqueConstraintError(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictApplicationError(
      'Could not assign a unique contributor username',
      'USERNAME_CONFLICT',
    );
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
