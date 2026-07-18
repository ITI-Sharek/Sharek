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

import { UsernameSuggestionService } from './username-suggestion.service';

const USERNAME_AVAILABILITY_SUFFIX_RETRIES = 20;

@Injectable()
export class IdentityUsernameService {
  constructor(
    private readonly database: DatabaseService,
    private readonly suggestionService: UsernameSuggestionService,
  ) {}

  async checkAvailability(username: string): Promise<UsernameAvailabilityDto> {
    const candidate = username.trim();

    if (!isValidUsername(candidate)) {
      return {
        available: false,
        reason: 'invalid_format',
      };
    }

    if (isReservedUsername(candidate)) {
      return {
        available: false,
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
        reason: 'taken',
      };
    }

    return {
      available: true,
      reason: null,
    };
  }

  async assertAvailable(username: string): Promise<void> {
    const availability = await this.checkAvailability(username);

    if (availability.available) {
      return;
    }

    if (availability.reason === 'taken') {
      const suggestions = await this.suggestionService.generateSuggestions(username, 3);
      throw new ConflictApplicationError(
        'Username is already taken',
        'USERNAME_TAKEN',
        { suggestions }
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


  async getAvailableUsernameOrNull(username?: string): Promise<string | null> {
    if (!username) {
      return null;
    }

    const candidate = normalizeUsernameCandidate(username);
    const availability = await this.checkAvailability(candidate);

    if (availability.available) {
      return candidate;
    }

    return null;
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
