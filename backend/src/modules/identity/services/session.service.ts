import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { ApplicationError } from '../../../shared/errors/application.error';
import { AuthTokensDto } from '../dto/auth-session.dto';
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
      },
      include: {
        user: true,
      },
    });

    if (!session) {
      await this.revokeOnReplay(tokenHash);
      throw this.invalidRefreshTokenError();
    }

    if (
      session.revoked_at !== null ||
      session.refresh_expires_at <= new Date() ||
      !this.canAuthenticate(session.user)
    ) {
      throw this.invalidRefreshTokenError();
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
        previous_refresh_token_hash: session.refresh_token_hash,
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

  /**
   * A token that only matches a session's previous rotated hash is a replay of
   * an already-used credential; the whole session is revoked so a stolen older
   * cookie cannot race the legitimate holder.
   */
  private async revokeOnReplay(tokenHash: string): Promise<void> {
    const replayedSession = await this.database.authSession.findFirst({
      where: {
        previous_refresh_token_hash: tokenHash,
        revoked_at: null,
      },
    });

    if (!replayedSession) {
      return;
    }

    await this.database.authSession.update({
      where: {
        id: replayedSession.id,
      },
      data: {
        revoked_at: new Date(),
      },
    });
  }

  private invalidRefreshTokenError(): ApplicationError {
    return new ApplicationError(
      'Invalid or expired refresh token',
      'INVALID_REFRESH_TOKEN',
      401,
    );
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

  canAuthenticate(user: { role: UserRole; status: string }): boolean {
    return (
      user.status === 'active' ||
      (user.role === UserRole.contributor && user.status === 'pending')
    );
  }
}
