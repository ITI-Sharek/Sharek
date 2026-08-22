import { Injectable } from '@nestjs/common';
import {
  AuthProvider,
  LanguageCode,
  Prisma,
  SocialAuthIntent as PrismaSocialAuthIntent,
  User,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';

import { hashToken } from '../../../shared/auth/token-hash';
import { DatabaseService } from '../../../shared/database/database.service';
import { ApplicationError } from '../../../shared/errors/application.error';
import { GitHubOAuthService } from '../../github/services/github-oauth.service';
import { GitHubAccountDto } from '../../github/dto/github-account.dto';
import { GoogleOAuthService } from './google-oauth.service';

import { AuthSessionDto } from '../dto/auth-session.dto';
import {
  SocialAuthCallbackInput,
  SocialAuthIntent,
  SocialAuthRole,
  SocialAuthStartDto,
} from '../dto/social-auth.dto';
import { toAuthUserDto } from '../auth-user.mapper';
import { IdentityUsernameService } from './identity-username.service';
import { SessionService } from './session.service';

const GOOGLE_AUTH_PROVIDER = 'google' as AuthProvider;
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
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly sessionService: SessionService,
    private readonly identityUsernameService: IdentityUsernameService,
  ) {}

  async start(
    provider: AuthProvider,
    role: SocialAuthRole,
    intent: SocialAuthIntent,
  ): Promise<SocialAuthStartDto> {
    this.assertSupportedProvider(provider);
    this.assertSupportedRole(role);
    this.assertSupportedIntent(intent);

    const state = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SOCIAL_AUTH_STATE_TTL_MS);

    await this.database.authOAuthState.create({
      data: {
        provider,
        state_hash: hashToken(state),
        requested_role: role,
        requested_intent: intent,
        expires_at: expiresAt,
      },
    });

    return {
      provider,
      intent,
      role,
      state,
      expiresAt,
      authorizationUrl: this.getAuthorizationUrl(provider, role, state),
    };
  }

  startGitHub(
    role: SocialAuthRole,
    intent: SocialAuthIntent,
  ): Promise<SocialAuthStartDto> {
    return this.start(AuthProvider.github, role, intent);
  }

  completeGitHub(
    input: Omit<SocialAuthCallbackInput, 'provider'>,
  ): Promise<AuthSessionDto> {
    return this.complete({
      ...input,
      provider: AuthProvider.github,
    });
  }

  startGoogle(
    role: SocialAuthRole,
    intent: SocialAuthIntent,
  ): Promise<SocialAuthStartDto> {
    return this.start(GOOGLE_AUTH_PROVIDER, role, intent);
  }

  completeGoogle(
    input: Omit<SocialAuthCallbackInput, 'provider'>,
  ): Promise<AuthSessionDto> {
    return this.complete({
      ...input,
      provider: GOOGLE_AUTH_PROVIDER,
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
      await this.resolveUser(
        identity,
        storedState.requested_role,
        storedState.requested_intent,
      ),
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
      tokens: await this.sessionService.create(user.id, input.context),
    };
  }

  async connectGitHubAccount(input: {
    userId: string;
    code: string;
    state: string;
  }): Promise<GitHubAccountDto> {
    const account = await this.gitHubOAuthService.connectWithCallback(
      input.code,
      input.state,
      {
        expectedUserId: input.userId,
        assertCanLink: (githubId) =>
          this.assertGitHubIdentityCanLinkToUser(githubId, input.userId),
      },
    );

    await this.replaceGitHubProviderAccount(input.userId, account);
    return account;
  }

  async disconnectGitHubAccount(userId: string): Promise<void> {
    await this.assertGitHubDisconnectKeepsLoginAvailable(userId);
    await this.gitHubOAuthService.disconnect(userId);
    await this.database.authProviderAccount.deleteMany({
      where: {
        provider: AuthProvider.github,
        user_id: userId,
      },
    });
  }

  private getAuthorizationUrl(
    provider: AuthProvider,
    role: SocialAuthRole,
    state: string,
  ): string {
    if (provider === GOOGLE_AUTH_PROVIDER) {
      return this.googleOAuthService.getSocialAuthorizationUrl(state);
    }
    return this.gitHubOAuthService.getSocialAuthorizationUrl(state);
  }

  private async exchangeIdentity(
    provider: AuthProvider,
    code: string,
  ): Promise<ProviderIdentity> {
    if (provider === GOOGLE_AUTH_PROVIDER) {
      return this.googleOAuthService.exchangeCodeForSocialIdentity(code);
    }
    return this.gitHubOAuthService.exchangeCodeForSocialIdentity(code);
  }

  private async resolveUser(
    identity: ProviderIdentity,
    requestedRole: UserRole,
    intent: SocialAuthIntent,
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
      if (identity.provider === AuthProvider.github) {
        await this.assertGitHubIdentityMatchesConnectedAccount(
          identity.providerUserId,
          providerAccount.user.id,
        );
      }

      this.assertIntentAllowsExistingUser(intent);

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
          this.assertIntentAllowsExistingUser(intent);
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
      this.assertIntentAllowsExistingUser(intent);

      if (identity.provider === AuthProvider.github) {
        throw new ApplicationError(
          'A Sharek account with this email already exists. Sign in to that account and connect this GitHub account explicitly.',
          'GITHUB_SIGN_IN_EMAIL_CONFLICT',
          409,
        );
      }

      return existingUser;
    }

    this.assertIntentAllowsNewUser(intent);

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

  private async assertGitHubIdentityMatchesConnectedAccount(
    providerUserId: string,
    userId: string,
  ): Promise<void> {
    const connectedGitHubId =
      await this.gitHubOAuthService.findLinkedGitHubIdForUser(userId);

    if (connectedGitHubId && connectedGitHubId !== providerUserId) {
      throw new ApplicationError(
        'This Sharek account is connected to a different GitHub account',
        'GITHUB_AUTH_ACCOUNT_MISMATCH',
        409,
      );
    }
  }

  private async assertGitHubIdentityCanLinkToUser(
    providerUserId: string,
    userId: string,
  ): Promise<void> {
    const existingAccount = await this.database.authProviderAccount.findUnique({
      where: {
        provider_provider_account_id: {
          provider: AuthProvider.github,
          provider_account_id: providerUserId,
        },
      },
    });

    if (existingAccount && existingAccount.user_id !== userId) {
      throw new ApplicationError(
        'GitHub account is already linked to another user',
        'GITHUB_ACCOUNT_TAKEN',
        409,
      );
    }
  }

  private async replaceGitHubProviderAccount(
    userId: string,
    account: GitHubAccountDto,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await transaction.authProviderAccount.deleteMany({
        where: {
          provider: AuthProvider.github,
          user_id: userId,
          provider_account_id: {
            not: account.githubId,
          },
        },
      });
      await transaction.authProviderAccount.upsert({
        where: {
          provider_provider_account_id: {
            provider: AuthProvider.github,
            provider_account_id: account.githubId,
          },
        },
        create: {
          user_id: userId,
          provider: AuthProvider.github,
          provider_account_id: account.githubId,
          email: null,
          email_verified: false,
          username: account.username,
          avatar_url: account.avatarUrl,
          profile_url: account.profileUrl,
          last_login_at: new Date(),
        },
        update: {
          username: account.username,
          avatar_url: account.avatarUrl,
          profile_url: account.profileUrl,
          last_login_at: new Date(),
        },
      });
    });
  }

  private async assertGitHubDisconnectKeepsLoginAvailable(
    userId: string,
  ): Promise<void> {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: {
        password_hash: true,
        authProviderAccounts: {
          where: {
            provider: {
              not: AuthProvider.github,
            },
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new ApplicationError('User was not found', 'USER_NOT_FOUND', 404);
    }

    if (!user.password_hash && user.authProviderAccounts.length === 0) {
      throw new ApplicationError(
        'Add a password or another sign-in provider before disconnecting GitHub',
        'GITHUB_DISCONNECT_WOULD_LOCK_ACCOUNT',
        409,
      );
    }
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

  private assertIntentAllowsExistingUser(intent: SocialAuthIntent): void {
    if (intent === PrismaSocialAuthIntent.register) {
      throw new ApplicationError(
        'A Sharek account is already linked to this provider. Sign in instead.',
        'SOCIAL_AUTH_ACCOUNT_ALREADY_EXISTS',
        409,
      );
    }
  }

  private assertIntentAllowsNewUser(intent: SocialAuthIntent): void {
    if (intent === PrismaSocialAuthIntent.login) {
      throw new ApplicationError(
        'No Sharek account is linked to this provider. Create an account first.',
        'SOCIAL_AUTH_ACCOUNT_NOT_FOUND',
        404,
      );
    }
  }

  private assertSupportedIntent(
    intent: SocialAuthIntent,
  ): asserts intent is SocialAuthIntent {
    if (
      intent !== PrismaSocialAuthIntent.login &&
      intent !== PrismaSocialAuthIntent.register
    ) {
      throw new ApplicationError(
        'Unsupported social auth intent',
        'SOCIAL_AUTH_INTENT_UNSUPPORTED',
      );
    }
  }

  private assertSupportedProvider(provider: AuthProvider): void {
    if (provider !== AuthProvider.github && provider !== GOOGLE_AUTH_PROVIDER) {
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
