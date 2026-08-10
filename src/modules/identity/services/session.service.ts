import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { ApplicationError } from '../../../shared/errors/application.error';
import { AuthTokensDto, AuthUserDto } from '../dto/auth-session.dto';
import { UpdateUserPreferencesRequest } from '../dto/update-user-preferences.request';
import { toAuthUserDto } from '../mappers/auth-user.mapper';
import { SessionTokenService } from '../security/session-token.service';
import { IdentityUsernameService } from './identity-username.service';

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly sessionTokenService: SessionTokenService,
    private readonly identityUsernameService: IdentityUsernameService,
  ) {}

  async create(userId: string, context: RequestContext): Promise<AuthTokensDto> {
    const tokens = this.sessionTokenService.generate();
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.database.authSession.create({
      data: {
        user_id: userId,
        access_token_hash: tokens.accessTokenHash,
        refresh_token_hash: tokens.refreshTokenHash,
        user_agent: context.userAgent,
        ip_address: context.ipAddress,
        expires_at: expiresAt,
        refresh_expires_at: refreshExpiresAt,
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
      refreshExpiresAt,
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    const tokenHash = this.sessionTokenService.hash(refreshToken);
    const session = await this.database.authSession.findFirst({
      where: {
        refresh_token_hash: tokenHash,
        revoked_at: null,
        refresh_expires_at: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!session || !this.canAuthenticate(session.user)) {
      throw new ApplicationError(
        'Invalid or expired refresh token',
        'INVALID_REFRESH_TOKEN',
        401,
      );
    }

    await this.identityUsernameService.ensureContributorUsernameForUser(session.user);

    const tokens = this.sessionTokenService.generate();
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await this.database.authSession.update({
      where: {
        id: session.id,
      },
      data: {
        access_token_hash: tokens.accessTokenHash,
        refresh_token_hash: tokens.refreshTokenHash,
        expires_at: expiresAt,
        refresh_expires_at: refreshExpiresAt,
      },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
      refreshExpiresAt,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.database.authSession.update({
      where: {
        id: sessionId,
      },
      data: {
        revoked_at: new Date(),
      },
    });
  }

  async updateCurrentUserPreferences(
    userId: string,
    input: UpdateUserPreferencesRequest | 'ar' | 'en',
  ): Promise<AuthUserDto> {
    const preferredLanguage =
      typeof input === 'string' ? input : input.preferredLanguage;
    if (preferredLanguage !== 'ar' && preferredLanguage !== 'en') {
      throw new ApplicationError(
        'Preferred language must be ar or en',
        'AUTH_PREFERRED_LANGUAGE_INVALID',
        400,
      );
    }

    const user = await this.database.user.update({
      where: { id: userId },
      data: { preferred_language: preferredLanguage },
    });
    const publicUser = await this.identityUsernameService.ensureContributorUsernameForUser(
      user,
    );
    return toAuthUserDto(publicUser);
  }

  canAuthenticate(user: { role: UserRole; status: string }): boolean {
    return (
      user.status === 'active' ||
      (user.role === UserRole.contributor && user.status === 'pending')
    );
  }
}
