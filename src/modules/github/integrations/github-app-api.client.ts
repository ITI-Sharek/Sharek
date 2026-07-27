import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApplicationError } from '../../../shared/errors/application.error';
import {
  GitHubAppInstallationPayload,
  GitHubAppInstallationTokenPayload,
  GitHubAppRepositoryPayload,
  GitHubAppUserPayload,
  GitHubAppUserTokenPayload,
} from '../mappers/github-app.mapper';
import { GitHubAppCredentialsService } from '../security/github-app-credentials.service';

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_READ_ATTEMPTS = 3;

export interface GitHubAppRepositoryPagePayload {
  repositories: GitHubAppRepositoryPayload[];
  hasNextPage: boolean;
}

@Injectable()
export class GitHubAppApiClient {
  constructor(
    private readonly config: ConfigService,
    private readonly credentials: GitHubAppCredentialsService,
  ) {}

  exchangeUserCode(code: string): Promise<GitHubAppUserTokenPayload> {
    return this.exchangeToken({ code });
  }

  refreshUserToken(refreshToken: string): Promise<GitHubAppUserTokenPayload> {
    return this.exchangeToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  getAuthenticatedUser(userToken: string): Promise<GitHubAppUserPayload> {
    return this.readJson<GitHubAppUserPayload>('/user', userToken);
  }

  async listUserInstallations(
    userToken: string,
  ): Promise<GitHubAppInstallationPayload[]> {
    const installations: GitHubAppInstallationPayload[] = [];
    for (let page = 1; ; page += 1) {
      const payload = await this.readJson<unknown>(
        `/user/installations?page=${page}&per_page=100`,
        userToken,
      );
      const pageItems = this.readArrayProperty<GitHubAppInstallationPayload>(
        payload,
        'installations',
      );
      installations.push(...pageItems);
      if (pageItems.length < 100) return installations;
    }
  }

  async listUserInstallationRepositories(
    userToken: string,
    providerInstallationId: string,
  ): Promise<GitHubAppRepositoryPayload[]> {
    const repositories: GitHubAppRepositoryPayload[] = [];
    for (let page = 1; ; page += 1) {
      const payload = await this.readJson<unknown>(
        `/user/installations/${encodeURIComponent(providerInstallationId)}/repositories?page=${page}&per_page=100`,
        userToken,
      );
      const pageItems = this.readArrayProperty<GitHubAppRepositoryPayload>(
        payload,
        'repositories',
      );
      repositories.push(...pageItems);
      if (pageItems.length < 100) return repositories;
    }
  }

  getInstallation(
    providerInstallationId: string,
  ): Promise<GitHubAppInstallationPayload> {
    return this.readJson<GitHubAppInstallationPayload>(
      `/app/installations/${encodeURIComponent(providerInstallationId)}`,
      this.credentials.createAppJwt(),
    );
  }

  async createInstallationToken(
    providerInstallationId: string,
  ): Promise<GitHubAppInstallationTokenPayload> {
    const response = await this.request(
      `/app/installations/${encodeURIComponent(providerInstallationId)}/access_tokens`,
      {
        method: 'POST',
        token: this.credentials.createAppJwt(),
        retry: false,
      },
    );
    const payload = await this.parseJson<GitHubAppInstallationTokenPayload>(response);
    if (!payload.token || !this.isValidDate(payload.expires_at)) {
      throw this.invalidPayload();
    }
    return payload;
  }

  async listInstallationRepositoryPage(
    installationToken: string,
    page: number,
    perPage: number,
  ): Promise<GitHubAppRepositoryPagePayload> {
    const response = await this.request(
      `/installation/repositories?page=${page}&per_page=${perPage}`,
      { method: 'GET', token: installationToken, retry: true },
    );
    const payload = await this.parseJson<unknown>(response);
    const repositories = this.readArrayProperty<GitHubAppRepositoryPayload>(
      payload,
      'repositories',
    );
    return {
      repositories,
      hasNextPage:
        this.hasNextLink(response.headers.get('link')) || repositories.length === perPage,
    };
  }

  async listInstallationRepositories(
    installationToken: string,
  ): Promise<GitHubAppRepositoryPayload[]> {
    const repositories: GitHubAppRepositoryPayload[] = [];
    for (let page = 1; ; page += 1) {
      const result = await this.listInstallationRepositoryPage(
        installationToken,
        page,
        100,
      );
      repositories.push(...result.repositories);
      if (!result.hasNextPage) return repositories;
    }
  }

  private async exchangeToken(
    input: Record<string, string>,
  ): Promise<GitHubAppUserTokenPayload> {
    const response = await this.fetchWithTimeout(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.required('GITHUB_APP_CLIENT_ID'),
        client_secret: this.required('GITHUB_APP_CLIENT_SECRET'),
        ...input,
      }),
    });
    if (!response.ok) throw this.providerError(response.status);
    const payload = await this.parseJson<GitHubAppUserTokenPayload>(response);
    if (
      !payload.access_token ||
      !payload.refresh_token ||
      !Number.isFinite(payload.expires_in) ||
      !Number.isFinite(payload.refresh_token_expires_in)
    ) {
      throw this.invalidPayload();
    }
    return payload;
  }

  private async readJson<T>(path: string, token: string): Promise<T> {
    const response = await this.request(path, {
      method: 'GET',
      token,
      retry: true,
    });
    return this.parseJson<T>(response);
  }

  private async request(
    path: string,
    options: { method: 'GET' | 'POST'; token: string; retry: boolean },
  ): Promise<Response> {
    const attempts = options.retry ? MAX_READ_ATTEMPTS : 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(`${GITHUB_API_URL}${path}`, {
          method: options.method,
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${options.token}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });
        if (response.ok) return response;
        if (!this.isRetryableStatus(response.status) || attempt === attempts) {
          throw this.providerError(response.status);
        }
        await this.delay(this.retryDelayMs(response, attempt));
      } catch (error) {
        lastError = error;
        if (
          (error instanceof ApplicationError &&
            error.code !== 'GITHUB_APP_PROVIDER_UNAVAILABLE') ||
          attempt === attempts
        ) {
          throw error;
        }
        await this.delay(100 * 2 ** (attempt - 1));
      }
    }

    throw lastError ?? this.providerError(502);
  }

  private fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, {
      ...init,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    }).catch(() => {
      throw new ApplicationError(
        'GitHub App provider request timed out',
        'GITHUB_APP_PROVIDER_UNAVAILABLE',
        503,
      );
    });
  }

  private async parseJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      throw this.invalidPayload();
    }
  }

  private readArrayProperty<T>(payload: unknown, property: string): T[] {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !Array.isArray((payload as Record<string, unknown>)[property])
    ) {
      throw this.invalidPayload();
    }
    return (payload as Record<string, unknown>)[property] as T[];
  }

  private providerError(status: number): ApplicationError {
    const statusCode = status === 401 || status === 403 ? 403 : status === 404 ? 404 : 503;
    return new ApplicationError(
      'GitHub App provider request failed',
      status === 401 || status === 403
        ? 'GITHUB_APP_INSTALLATION_ACCESS_NOT_VERIFIED'
        : 'GITHUB_APP_PROVIDER_UNAVAILABLE',
      statusCode,
    );
  }

  private invalidPayload(): ApplicationError {
    return new ApplicationError(
      'GitHub App provider response was invalid',
      'GITHUB_APP_PROVIDER_INVALID_RESPONSE',
      502,
    );
  }

  private isRetryableStatus(status: number): boolean {
    return status === 429 || status >= 500;
  }

  private retryDelayMs(response: Response, attempt: number): number {
    const retryAfter = Number(response.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter >= 0) {
      return Math.min(retryAfter * 1000, 2_000);
    }
    const resetAt = Number(response.headers.get('x-ratelimit-reset')) * 1000;
    if (Number.isFinite(resetAt) && resetAt > Date.now()) {
      return Math.min(resetAt - Date.now(), 2_000);
    }
    return Math.min(100 * 2 ** (attempt - 1) + Math.floor(Math.random() * 50), 2_000);
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private hasNextLink(link: string | null): boolean {
    return link?.split(',').some((part) => part.includes('rel="next"')) ?? false;
  }

  private isValidDate(value: string): boolean {
    return typeof value === 'string' && Number.isFinite(Date.parse(value));
  }

  private required(name: string): string {
    const value = this.config.get<string>(name)?.trim();
    if (!value) {
      throw new ApplicationError(
        'GitHub App is not configured',
        'GITHUB_APP_NOT_CONFIGURED',
        503,
      );
    }
    return value;
  }
}
