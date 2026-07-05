import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';

import { hashToken } from '../../../../shared/auth/token-hash';
import { DatabaseService } from '../../../../shared/database/database.service';
import { ApplicationError } from '../../../../shared/errors/application.error';
import { GitHubTokenEncryptionService } from '../../infrastructure/security/github-token-encryption.service';
import { GitHubAccountDto, GitHubOAuthStartDto } from '../dto/github-account.dto';
import { toGitHubAccountDto } from '../mappers/github-account.mapper';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

interface GitHubTokenPayload {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

interface GitHubProfilePayload {
  githubId: string;
  username: string;
  avatarUrl?: string;
  profileUrl?: string;
  rawProfileData: Prisma.InputJsonObject;
}

@Injectable()
export class GitHubOAuthService {
  private readonly logger = new Logger(GitHubOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
    private readonly tokenEncryption: GitHubTokenEncryptionService,
  ) {}

  async startOAuth(userId: string): Promise<GitHubOAuthStartDto> {
    const clientId = this.getRequiredConfig('GITHUB_CLIENT_ID');
    const callbackUrl = this.getRequiredConfig('GITHUB_OAUTH_CALLBACK_URL');
    const state = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);

    await this.database.gitHubOAuthState.create({
      data: {
        user_id: userId,
        state_hash: hashToken(state),
        expires_at: expiresAt,
      },
    });
    this.logger.debug(
      `GitHub OAuth state created: hashPrefix=${this.getStateHashPrefix(state)} expiresAt=${expiresAt.toISOString()}`,
    );

    const authorizationUrl = new URL(GITHUB_AUTHORIZE_URL);
    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('redirect_uri', callbackUrl);
    authorizationUrl.searchParams.set('scope', 'read:user user:email public_repo');
    authorizationUrl.searchParams.set('state', state);

    return {
      authorizationUrl: authorizationUrl.toString(),
      state,
      expiresAt,
    };
  }

  async connectWithCallback(code: string, state: string): Promise<GitHubAccountDto> {
    const normalizedCode = code?.trim();
    const normalizedState = state?.trim();

    if (!normalizedCode || !normalizedState) {
      throw new ApplicationError('GitHub code and state are required', 'GITHUB_OAUTH_INVALID_CALLBACK');
    }

    const stateHash = hashToken(normalizedState);
    const storedState = await this.database.gitHubOAuthState.findFirst({
      where: {
        state_hash: stateHash,
        consumed_at: null,
        expires_at: {
          gt: new Date(),
        },
      },
    });

    if (!storedState) {
      await this.logInvalidState(stateHash);
      throw new ApplicationError('Invalid or expired GitHub OAuth state', 'GITHUB_OAUTH_INVALID_STATE', 401);
    }

    const token = await this.exchangeCodeForToken(normalizedCode);
    const profile = await this.fetchProfile(token.accessToken);
    const encryptedAccessToken = this.tokenEncryption.encrypt(token.accessToken);
    const encryptedRefreshToken = token.refreshToken
      ? this.tokenEncryption.encrypt(token.refreshToken)
      : null;

    const linkedAccount = await this.database.gitHubAccount.findUnique({
      where: {
        github_id: profile.githubId,
      },
    });

    if (linkedAccount && linkedAccount.user_id !== storedState.user_id) {
      throw new ApplicationError('GitHub account is already linked to another user', 'GITHUB_ACCOUNT_TAKEN', 409);
    }

    await this.database.gitHubOAuthState.update({
      where: {
        id: storedState.id,
      },
      data: {
        consumed_at: new Date(),
      },
    });

    const account = await this.database.gitHubAccount.upsert({
      where: {
        user_id: storedState.user_id,
      },
      create: {
        user_id: storedState.user_id,
        github_id: profile.githubId,
        username: profile.username,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        avatar_url: profile.avatarUrl,
        profile_url: profile.profileUrl,
        raw_profile_data: profile.rawProfileData,
        token_expires_at: token.expiresAt,
        connected_at: new Date(),
        last_synced_at: new Date(),
      },
      update: {
        github_id: profile.githubId,
        username: profile.username,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        avatar_url: profile.avatarUrl,
        profile_url: profile.profileUrl,
        raw_profile_data: profile.rawProfileData,
        token_expires_at: token.expiresAt,
        last_synced_at: new Date(),
      },
    });

    return toGitHubAccountDto(account);
  }

  async getAccount(userId: string): Promise<GitHubAccountDto> {
    const account = await this.database.gitHubAccount.findUnique({
      where: {
        user_id: userId,
      },
    });

    if (!account) {
      throw new ApplicationError('GitHub account is not connected', 'GITHUB_ACCOUNT_NOT_CONNECTED', 404);
    }

    return toGitHubAccountDto(account);
  }

  async disconnect(userId: string): Promise<void> {
    await this.database.gitHubAccount.deleteMany({
      where: {
        user_id: userId,
      },
    });
  }

  private async exchangeCodeForToken(code: string): Promise<GitHubTokenPayload> {
    const clientId = this.getRequiredConfig('GITHUB_CLIENT_ID');
    const clientSecret = this.getRequiredConfig('GITHUB_CLIENT_SECRET');
    const callbackUrl = this.getRequiredConfig('GITHUB_OAUTH_CALLBACK_URL');
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl,
      }),
    });

    const payload = (await response.json()) as Record<string, unknown>;

    if (!response.ok || typeof payload.access_token !== 'string') {
      throw new ApplicationError('GitHub token exchange failed', 'GITHUB_TOKEN_EXCHANGE_FAILED', 502);
    }

    return {
      accessToken: payload.access_token,
      refreshToken:
        typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined,
      expiresAt:
        typeof payload.expires_in === 'number'
          ? new Date(Date.now() + payload.expires_in * 1000)
          : undefined,
    };
  }

  private async fetchProfile(accessToken: string): Promise<GitHubProfilePayload> {
    const response = await fetch(GITHUB_USER_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    const payload = (await response.json()) as Record<string, unknown>;

    if (!response.ok || typeof payload.id !== 'number' || typeof payload.login !== 'string') {
      throw new ApplicationError('GitHub profile fetch failed', 'GITHUB_PROFILE_FETCH_FAILED', 502);
    }

    return {
      githubId: String(payload.id),
      username: payload.login,
      avatarUrl:
        typeof payload.avatar_url === 'string' ? payload.avatar_url : undefined,
      profileUrl:
        typeof payload.html_url === 'string' ? payload.html_url : undefined,
      rawProfileData: {
        id: payload.id,
        login: payload.login,
        avatar_url:
          typeof payload.avatar_url === 'string' ? payload.avatar_url : null,
        html_url: typeof payload.html_url === 'string' ? payload.html_url : null,
      },
    };
  }

  private getRequiredConfig(key: string): string {
    const value = this.config.get<string>(key);

    if (!value) {
      throw new ApplicationError(`${key} is not configured`, 'GITHUB_OAUTH_NOT_CONFIGURED', 500);
    }

    return value;
  }

  private async logInvalidState(stateHash: string): Promise<void> {
    const matchingState = await this.database.gitHubOAuthState.findFirst({
      where: {
        state_hash: stateHash,
      },
      select: {
        id: true,
        consumed_at: true,
        expires_at: true,
      },
    });

    if (!matchingState) {
      this.logger.warn(
        `GitHub OAuth callback rejected: state was not found hashPrefix=${stateHash.slice(0, 12)}`,
      );
      return;
    }

    this.logger.warn(
      `GitHub OAuth callback rejected: state id=${matchingState.id} consumed=${Boolean(
        matchingState.consumed_at,
      )} expiresAt=${matchingState.expires_at.toISOString()} hashPrefix=${stateHash.slice(0, 12)}`,
    );
  }

  private getStateHashPrefix(state: string): string {
    return hashToken(state).slice(0, 12);
  }
}
