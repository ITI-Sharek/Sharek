import { Injectable } from '@nestjs/common';
import {
  AuthProvider,
  LanguageCode,
  Prisma,
  User,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';

import { hashToken } from '../../../../shared/auth/token-hash';
import { DatabaseService } from '../../../../shared/database/database.service';
import { ApplicationError } from '../../../../shared/errors/application.error';
import { GitHubOAuthService } from '../../../github/application/use-cases/github-oauth.service';

import { SessionTokenService } from '../../infrastructure/security/session-token.service';
import { AuthSessionDto, AuthTokensDto } from '../dto/auth-session.dto';
import {
  SocialAuthCallbackInput,
  SocialAuthRole,
  SocialAuthStartDto,
} from '../dto/social-auth.dto';
import { toAuthUserDto } from '../mappers/auth-user.mapper';
import { IdentityUsernameService } from './identity-username.service';

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SOCIAL_AUTH_STATE_TTL_MS = 10 * 60 * 1000;

interface ProviderIdentity {
  provider: AuthProvider;
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
  profileUrl?: string;
  rawProfileData: Prisma.InputJsonObject;
}

@Injectable()
export class SocialAuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly gitHubOAuthService: GitHubOAuthService,
    private readonly sessionTokenService: SessionTokenService,
    private readonly identityUsernameService: IdentityUsernameService,
  ) {}

  async start(
    provider: AuthProvider,
    role: SocialAuthRole,
  ): Promise<SocialAuthStartDto> {
    this.assertSupportedProvider(provider);
    this.assertSupportedRole(role);

    const state = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SOCIAL_AUTH_STATE_TTL_MS);

    await this.database.authOAuthState.create({
      data: {
        provider,
        state_hash: hashToken(state),
        requested_role: role,
        expires_at: expiresAt,
      },
    });

    return {
      provider,
      role,
      state,
      expiresAt,
      authorizationUrl: this.getAuthorizationUrl(provider, role, state),
    };
  }

  startGitHub(role: SocialAuthRole): Promise<SocialAuthStartDto> {
    return this.start(AuthProvider.github, role);
  }

  completeGitHub(
    input: Omit<SocialAuthCallbackInput, 'provider'>,
  ): Promise<AuthSessionDto> {
    return this.complete({
      ...input,
      provider: AuthProvider.github,
    });
  }

  async complete(input: SocialAuthCallbackInput): Promise<AuthSessionDto> {
    this.assertSupportedProvider(input.provider);

    const code = input.code?.trim();
    const state = input.state?.trim();

    if (!code || !state) {
      throw new ApplicationError(
        'OAuth code and state are required',
        'SOCIAL_AUTH_INVALID_CALLBACK',
      );
    }

    const storedState = await this.database.authOAuthState.findFirst({
      where: {
        provider: input.provider,
        state_hash: hashToken(state),
        consumed_at: null,
        expires_at: {
          gt: new Date(),
        },
      },
    });

    if (!storedState) {
      throw new ApplicationError(
        'Invalid or expired OAuth state',
        'SOCIAL_AUTH_INVALID_STATE',
        401,
      );
    }

    const identity = await this.exchangeIdentity(input.provider, code);
    await this.database.authOAuthState.update({
      where: {
        id: storedState.id,
      },
      data: {
        consumed_at: new Date(),
      },
    });

    const user = await this.activatePendingUserIfEmailVerified(
      await this.resolveUser(identity, storedState.requested_role),
      identity,
    );

    if (user.status !== UserStatus.active) {
      throw new ApplicationError('Account is not active', 'ACCOUNT_NOT_ACTIVE', 403);
    }

    await this.assertProviderCanLinkToUser(identity, user.id);

    await this.upsertProviderAccount(identity, user.id);

    const updatedUser = await this.database.user.update({
      where: {
        id: user.id,
      },
      data: {
        avatar_url: user.avatar_url ?? identity.avatarUrl,
        last_login_at: new Date(),
      },
    });

    return {
      user: toAuthUserDto(updatedUser),
      tokens: await this.createSession(user.id, input.context),
    };
  }

  private getAuthorizationUrl(
    provider: AuthProvider,
    role: SocialAuthRole,
    state: string,
  ): string {


    return this.gitHubOAuthService.getSocialAuthorizationUrl(state);
  }

  private async exchangeIdentity(
    provider: AuthProvider,
    code: string,
  ): Promise<ProviderIdentity> {


    return this.gitHubOAuthService.exchangeCodeForSocialIdentity(code);
  }

  private async resolveUser(
    identity: ProviderIdentity,
    requestedRole: UserRole,
  ): Promise<User> {
    const providerAccount = await this.database.authProviderAccount.findUnique({
      where: {
        provider_provider_account_id: {
          provider: identity.provider,
          provider_account_id: identity.providerUserId,
        },
      },
      include: {
        user: true,
      },
    });

    if (providerAccount) {
      return providerAccount.user;
    }

    if (identity.provider === AuthProvider.github) {
      const linkedUserId = await this.gitHubOAuthService.findLinkedUserId(
        identity.providerUserId,
      );

      if (linkedUserId) {
        const linkedUser = await this.database.user.findUnique({
          where: {
            id: linkedUserId,
          },
        });

        if (linkedUser) {
          return linkedUser;
        }
      }
    }

    const existingUser = await this.database.user.findUnique({
      where: {
        email: identity.email,
      },
    });

    if (existingUser) {
      return existingUser;
    }

    const name = this.getNameParts(identity);
    const username = await this.getSocialSignupUsername(identity);

    return this.database.user.create({
      data: {
        email: identity.email,
        username,
        password_hash: null,
        first_name: name.firstName,
        last_name: name.lastName,
        avatar_url: identity.avatarUrl,
        role: requestedRole,
        status: UserStatus.active,
        preferred_language: LanguageCode.en,
      },
    });
  }

  private getSocialSignupUsername(identity: ProviderIdentity): Promise<string | null> {
    if (identity.provider !== AuthProvider.github) {
      return Promise.resolve(null);
    }

    return this.identityUsernameService.getAvailableUsernameOrNull(
      identity.username,
    );
  }

  private async activatePendingUserIfEmailVerified(
    user: User,
    identity: ProviderIdentity,
  ): Promise<User> {
    if (user.status !== UserStatus.pending || !identity.emailVerified) {
      return user;
    }

    return this.database.user.update({
      where: {
        id: user.id,
      },
      data: {
        status: UserStatus.active,
      },
    });
  }

  private async assertProviderCanLinkToUser(
    identity: ProviderIdentity,
    userId: string,
  ): Promise<void> {
    const existingAccount = await this.database.authProviderAccount.findUnique({
      where: {
        provider_user_id: {
          provider: identity.provider,
          user_id: userId,
        },
      },
    });

    if (
      existingAccount &&
      existingAccount.provider_account_id !== identity.providerUserId
    ) {
      throw new ApplicationError(
        'User already has a different account for this auth provider',
        'AUTH_PROVIDER_ACCOUNT_ALREADY_LINKED',
        409,
      );
    }
  }

  private async upsertProviderAccount(
    identity: ProviderIdentity,
    userId: string,
  ): Promise<void> {
    await this.database.authProviderAccount.upsert({
      where: {
        provider_provider_account_id: {
          provider: identity.provider,
          provider_account_id: identity.providerUserId,
        },
      },
      create: {
        user_id: userId,
        provider: identity.provider,
        provider_account_id: identity.providerUserId,
        email: identity.email,
        email_verified: identity.emailVerified,
        username: identity.username,
        avatar_url: identity.avatarUrl,
        profile_url: identity.profileUrl,
        raw_profile_data: identity.rawProfileData as Prisma.InputJsonObject,
        last_login_at: new Date(),
      },
      update: {
        email: identity.email,
        email_verified: identity.emailVerified,
        username: identity.username,
        avatar_url: identity.avatarUrl,
        profile_url: identity.profileUrl,
        raw_profile_data: identity.rawProfileData as Prisma.InputJsonObject,
        last_login_at: new Date(),
      },
    });
  }

  private getNameParts(identity: ProviderIdentity): {
    firstName: string;
    lastName: string;
  } {
    if (identity.firstName || identity.lastName) {
      return {
        firstName: identity.firstName ?? identity.username ?? 'Sharek',
        lastName: identity.lastName ?? 'User',
      };
    }

    const source =
      identity.displayName ?? identity.username ?? identity.email.split('@')[0];
    const parts = source
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    return {
      firstName: parts[0] ?? 'Sharek',
      lastName: parts.slice(1).join(' ') || 'User',
    };
  }

  private async createSession(
    userId: string,
    context: { userAgent?: string; ipAddress?: string },
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

  private assertSupportedProvider(provider: AuthProvider): void {
    if (provider !== AuthProvider.github) {
      throw new ApplicationError(
        'Unsupported auth provider',
        'SOCIAL_AUTH_PROVIDER_UNSUPPORTED',
      );
    }
  }

  private assertSupportedRole(role: UserRole): asserts role is SocialAuthRole {
    if (role !== UserRole.owner && role !== UserRole.contributor) {
      throw new ApplicationError(
        'Social auth can only create owner or contributor accounts',
        'SOCIAL_AUTH_ROLE_UNSUPPORTED',
      );
    }
  }
}
