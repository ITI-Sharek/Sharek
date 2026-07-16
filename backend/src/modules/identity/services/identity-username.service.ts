import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import {
  ConflictApplicationError,
  UnprocessableApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';
import { UsernameAvailabilityDto } from '../dto/username-availability.dto';
import {
  buildUsernameCandidates,
  isReservedUsername,
  isValidUsername,
  normalizeUsernameCandidate,
  USERNAME_MAX_LENGTH,
} from '../validators/username.validator';

const USERNAME_AVAILABILITY_SUFFIX_RETRIES = 20;

@Injectable()
export class IdentityUsernameService {
  constructor(private readonly database: DatabaseService) {}

  async checkAvailability(username: string): Promise<UsernameAvailabilityDto> {
    const candidate = username.trim();

    if (!isValidUsername(candidate)) {
      return {
        available: false,
        suggestion: null,
        reason: 'invalid_format',
      };
    }

    if (isReservedUsername(candidate)) {
      return {
        available: false,
        suggestion: null,
        reason: 'reserved',
      };
    }

    const existingUser = await this.database.user.findUnique({
      where: {
        username: candidate,
      },
    });

    if (existingUser) {
      return {
        available: false,
        suggestion: await this.findAvailableUsernameSuggestion(candidate),
        reason: 'taken',
      };
    }

    return {
      available: true,
      suggestion: null,
      reason: null,
    };
  }

  async assertAvailable(username: string): Promise<void> {
    const availability = await this.checkAvailability(username);

    if (availability.available) {
      return;
    }

    if (availability.reason === 'taken') {
      throw new ConflictApplicationError(
        'Username is already taken',
        'USERNAME_TAKEN',
      );
    }

    if (availability.reason === 'reserved') {
      throw new UnprocessableApplicationError(
        'Username is reserved',
        'USERNAME_RESERVED',
      );
    }

    throw new UnprocessableApplicationError(
      'Username must be 3-30 characters and use lowercase letters, numbers, hyphen, or underscore',
      'USERNAME_INVALID',
    );
  }

  async findAvailableUsernameSuggestion(username: string): Promise<string | null> {
    const base = normalizeUsernameCandidate(username);

    if (base.length < 3) {
      return null;
    }

    for (let suffix = 1; suffix <= USERNAME_AVAILABILITY_SUFFIX_RETRIES; suffix += 1) {
      const suffixText = `-${suffix}`;
      const candidate = `${base.slice(
        0,
        USERNAME_MAX_LENGTH - suffixText.length,
      )}${suffixText}`;

      if (!isValidUsername(candidate) || isReservedUsername(candidate)) {
        continue;
      }

      const existingUser = await this.database.user.findUnique({
        where: {
          username: candidate,
        },
      });

      if (!existingUser) {
        return candidate;
      }
    }

    return null;
  }

  async getAvailableUsernameOrNull(username?: string): Promise<string | null> {
    if (!username) {
      return null;
    }

    const candidate = normalizeUsernameCandidate(username);
    const availability = await this.checkAvailability(candidate);

    if (availability.available) {
      return candidate;
    }

    return availability.reason === 'taken' ? availability.suggestion : null;
  }

  async ensureContributorUsername(userId: string): Promise<User> {
    const user = await this.getUserById(userId);

    return this.ensureContributorUsernameForUser(user);
  }

  async getUserById(userId: string): Promise<User> {
    const user = await this.database.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new NotFoundApplicationError('User was not found', 'USER_NOT_FOUND');
    }

    return user;
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
