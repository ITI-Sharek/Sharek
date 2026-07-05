import { Injectable } from '@nestjs/common';
import { LanguageCode, UserRole } from '@prisma/client';

import { AuthSessionDto, AuthTokensDto, AuthUserDto } from '../dto/auth-session.dto';
import { toAuthUserDto } from '../mappers/auth-user.mapper';
import { RegisterRequest } from '../../presentation/http/requests/register.request';
import { LoginRequest } from '../../presentation/http/requests/login.request';
import { DatabaseService } from '../../../../shared/database/database.service';
import { ApplicationError } from '../../../../shared/errors/application.error';
import { PasswordHasher } from '../../infrastructure/security/password-hasher.service';
import { SessionTokenService } from '../../infrastructure/security/session-token.service';

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwordHasher: PasswordHasher,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  async register(
    input: RegisterRequest,
    context: RequestContext,
  ): Promise<AuthSessionDto> {
    const email = input.email.trim().toLowerCase();
    const existingUser = await this.database.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      throw new ApplicationError('Email is already registered', 'EMAIL_TAKEN', 409);
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.database.user.create({
      data: {
        email,
        password_hash: passwordHash,
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        role: input.role,
        status: 'active',
        preferred_language: input.preferredLanguage ?? LanguageCode.en,
      },
    });

    return {
      user: toAuthUserDto(user),
      tokens: await this.createSession(user.id, context),
    };
  }

  async login(input: LoginRequest, context: RequestContext): Promise<AuthSessionDto> {
    const email = input.email.trim().toLowerCase();
    const user = await this.database.user.findUnique({
      where: {
        email,
      },
    });

    if (!user || !(await this.passwordHasher.verify(input.password, user.password_hash))) {
      throw new ApplicationError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
    }

    if (user.status !== 'active') {
      throw new ApplicationError('Account is not active', 'ACCOUNT_NOT_ACTIVE', 403);
    }

    const updatedUser = await this.database.user.update({
      where: {
        id: user.id,
      },
      data: {
        last_login_at: new Date(),
      },
    });

    return {
      user: toAuthUserDto(updatedUser),
      tokens: await this.createSession(user.id, context),
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

    if (!session || session.user.status !== 'active') {
      throw new ApplicationError('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN', 401);
    }

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

  async getCurrentUser(userId: string): Promise<AuthUserDto> {
    const user = await this.database.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new ApplicationError('User was not found', 'USER_NOT_FOUND', 404);
    }

    return toAuthUserDto(user);
  }

  async assignRole(userId: string, role: UserRole): Promise<AuthUserDto> {
    const existingUser = await this.database.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!existingUser) {
      throw new ApplicationError('User was not found', 'USER_NOT_FOUND', 404);
    }

    const user = await this.database.user.update({
      where: {
        id: userId,
      },
      data: {
        role,
      },
    });

    return toAuthUserDto(user);
  }

  private async createSession(
    userId: string,
    context: RequestContext,
  ): Promise<AuthTokensDto> {
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
}
