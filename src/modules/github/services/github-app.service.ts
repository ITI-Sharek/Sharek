import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GitHubAppAccountType,
  GitHubAppInstallation,
  GitHubAppInstallationLink,
  GitHubAppInstallationStatus,
  GitHubAppLinkFlowType,
  GitHubAppRepositorySelection,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

import { DatabaseService } from '../../../shared/database/database.service';
import { ApplicationError } from '../../../shared/errors/application.error';
import { IdentityAccountStatusService } from '../../identity/services/identity-account-status.service';
import {
  GitHubAppConnectionStartDto,
  GitHubAppConnectionAttemptDto,
  GitHubAppInstallationCandidateDto,
  GitHubAppInstallationLinkDto,
  GitHubAppRepositoryPageDto,
} from '../dto/github-app-installation.dto';
import { GitHubAppApiClient } from '../integrations/github-app-api.client';
import {
  GitHubAppInstallationPayload,
  GitHubAppRepositoryPayload,
  toGitHubAppInstallationLinkDto,
  toGitHubAppRepositoryDto,
} from '../mappers/github-app.mapper';
import { GitHubTokenEncryptionService } from '../security/github-token-encryption.service';

const LINK_STATE_TTL_MS = 10 * 60 * 1000;
const PENDING_CREDENTIAL_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;

type LinkWithInstallation = GitHubAppInstallationLink & {
  installation: GitHubAppInstallation;
};

@Injectable()
export class GitHubAppService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly apiClient: GitHubAppApiClient,
    private readonly tokenEncryption: GitHubTokenEncryptionService,
    @Inject(forwardRef(() => IdentityAccountStatusService))
    private readonly identityAccountStatus: IdentityAccountStatusService,
  ) {}

  async startConnection(
    userId: string,
    flowType: GitHubAppLinkFlowType = 'install_and_authorize',
    installationLinkId?: string,
  ): Promise<GitHubAppConnectionStartDto> {
    await this.requireMatchingGitHubIdentity(userId);
    const installationUrl = this.required('GITHUB_APP_INSTALLATION_URL');
    let targetInstallationId: string | undefined;
    if (flowType === 'authorize_existing_installation') {
      if (!installationLinkId) throw this.stateError();
      const link = await this.database.gitHubAppInstallationLink.findFirst({
        where: { id: installationLinkId, user_id: userId },
        select: { installation_id: true },
      });
      if (!link) throw this.accessError();
      targetInstallationId = link.installation_id;
    }

    const state = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + LINK_STATE_TTL_MS);
    await this.database.gitHubAppLinkState.create({
      data: {
        user_id: userId,
        flow_type: flowType,
        target_installation_id: targetInstallationId,
        state_hash: this.hashState(state),
        expires_at: expiresAt,
      },
    });

    const url = new URL(installationUrl);
    url.searchParams.set('state', state);
    return { installationUrl: url.toString(), expiresAt };
  }

  async processBrowserCallback(code: string, state: string): Promise<string> {
    if (!code?.trim() || !state?.trim()) throw this.stateError();
    const stateHash = this.hashState(state);
    const attempt = await this.database.gitHubAppLinkState.findUnique({
      where: { state_hash: stateHash },
    });
    if (!attempt || attempt.status !== 'issued' || attempt.expires_at <= new Date()) {
      throw this.stateError();
    }

    const consumed = await this.database.gitHubAppLinkState.updateMany({
      where: { id: attempt.id, status: 'issued', callback_consumed_at: null },
      data: { callback_consumed_at: new Date() },
    });
    if (consumed.count !== 1) throw this.stateError();

    try {
      const token = await this.apiClient.exchangeUserCode(code);
      const user = await this.apiClient.getAuthenticatedUser(token.access_token);
      await this.requireMatchingGitHubIdentity(attempt.user_id, String(user.id));
      const installations = await this.apiClient.listUserInstallations(
        token.access_token,
      );
      const pendingExpiresAt = new Date(Date.now() + PENDING_CREDENTIAL_TTL_MS);
      await this.database.gitHubAppLinkState.update({
        where: { id: attempt.id },
        data: {
          status: 'callback_processed',
          verified_github_user_id: String(user.id),
          verified_github_login: user.login,
          accessible_installation_candidates: installations.map((item) => ({
            installationId: String(item.id),
            accountLogin: item.account.login,
            accountType: item.account.type,
          })),
          encrypted_pending_user_token: this.tokenEncryption.encrypt(
            token.access_token,
          ),
          pending_user_token_expires_at: new Date(
            Date.now() + token.expires_in * 1000,
          ),
          encrypted_pending_refresh_token: this.tokenEncryption.encrypt(
            token.refresh_token,
          ),
          pending_refresh_token_expires_at: new Date(
            Date.now() + token.refresh_token_expires_in * 1000,
          ),
          expires_at: pendingExpiresAt,
        },
      });
      return attempt.id;
    } catch (error) {
      await this.database.gitHubAppLinkState.update({
        where: { id: attempt.id },
        data: { status: 'rejected', failure_code: this.safeErrorCode(error) },
      });
      throw error;
    }
  }

  async completeConnection(
    userId: string,
    attemptId: string,
    providerInstallationId: string,
  ): Promise<GitHubAppInstallationLinkDto> {
    const attempt = await this.database.gitHubAppLinkState.findFirst({
      where: {
        id: attemptId,
        user_id: userId,
        status: 'callback_processed',
        completion_consumed_at: null,
        expires_at: { gt: new Date() },
      },
    });
    if (!attempt?.encrypted_pending_user_token || !attempt.verified_github_user_id) {
      throw this.stateError();
    }
    await this.requireMatchingGitHubIdentity(
      userId,
      attempt.verified_github_user_id,
    );

    const candidates = this.readCandidateIds(
      attempt.accessible_installation_candidates,
    );
    if (!candidates.has(providerInstallationId)) throw this.accessError();
    if (attempt.target_installation_id) {
      const target = await this.database.gitHubAppInstallation.findUnique({
        where: { id: attempt.target_installation_id },
        select: { installation_id: true },
      });
      if (!target || target.installation_id !== providerInstallationId) {
        throw this.accessError();
      }
    }
    const userToken = this.tokenEncryption.decrypt(
      attempt.encrypted_pending_user_token,
    );
    const liveInstallations = await this.apiClient.listUserInstallations(userToken);
    if (!liveInstallations.some((item) => String(item.id) === providerInstallationId)) {
      throw this.accessError();
    }
    const providerInstallation = await this.apiClient.getInstallation(
      providerInstallationId,
    );
    this.assertInstallation(providerInstallation);
    const repositories = await this.apiClient.listUserInstallationRepositories(
      userToken,
      providerInstallationId,
    );
    const verifiedAt = new Date();

    const link = await this.database.$transaction(async (transaction) => {
      const installation = await transaction.gitHubAppInstallation.upsert({
        where: { installation_id: providerInstallationId },
        create: this.installationCreateData(providerInstallation, verifiedAt),
        update: this.installationUpdateData(providerInstallation, verifiedAt),
      });
      await this.reconcileRepositories(
        transaction,
        installation.id,
        repositories,
        verifiedAt,
      );
      const savedLink = await transaction.gitHubAppInstallationLink.upsert({
        where: {
          installation_id_user_id: {
            installation_id: installation.id,
            user_id: userId,
          },
        },
        create: {
          installation_id: installation.id,
          user_id: userId,
          github_user_id: attempt.verified_github_user_id!,
          github_login: attempt.verified_github_login ?? '',
          encrypted_user_token: attempt.encrypted_pending_user_token,
          user_token_expires_at: attempt.pending_user_token_expires_at,
          encrypted_refresh_token: attempt.encrypted_pending_refresh_token,
          refresh_token_expires_at: attempt.pending_refresh_token_expires_at,
          status: 'active',
          last_verified_at: verifiedAt,
        },
        update: {
          github_user_id: attempt.verified_github_user_id!,
          github_login: attempt.verified_github_login ?? '',
          encrypted_user_token: attempt.encrypted_pending_user_token,
          user_token_expires_at: attempt.pending_user_token_expires_at,
          encrypted_refresh_token: attempt.encrypted_pending_refresh_token,
          refresh_token_expires_at: attempt.pending_refresh_token_expires_at,
          status: 'active',
          last_verified_at: verifiedAt,
          disconnected_at: null,
          revoked_at: null,
        },
        include: { installation: true },
      });
      const completed = await transaction.gitHubAppLinkState.updateMany({
        where: {
          id: attempt.id,
          user_id: userId,
          status: 'callback_processed',
          completion_consumed_at: null,
        },
        data: {
          status: 'completed',
          completion_consumed_at: verifiedAt,
          encrypted_pending_user_token: null,
          encrypted_pending_refresh_token: null,
        },
      });
      if (completed.count !== 1) throw this.stateError();
      return savedLink;
    });

    return this.presentLink(link);
  }

  async getConnectionAttempt(
    userId: string,
    attemptId: string,
  ): Promise<GitHubAppConnectionAttemptDto> {
    const attempt = await this.database.gitHubAppLinkState.findFirst({
      where: {
        id: attemptId,
        user_id: userId,
        status: 'callback_processed',
        completion_consumed_at: null,
        expires_at: { gt: new Date() },
      },
      select: {
        id: true,
        expires_at: true,
        target_installation_id: true,
        accessible_installation_candidates: true,
      },
    });
    if (!attempt) throw this.stateError();

    let candidates = this.readCandidates(
      attempt.accessible_installation_candidates,
    );
    if (attempt.target_installation_id) {
      const target = await this.database.gitHubAppInstallation.findUnique({
        where: { id: attempt.target_installation_id },
        select: { installation_id: true },
      });
      if (!target) throw this.stateError();
      candidates = candidates.filter(
        (candidate) =>
          candidate.providerInstallationId === target.installation_id,
      );
    }

    return {
      attemptId: attempt.id,
      expiresAt: attempt.expires_at,
      candidates,
    };
  }

  async listInstallationLinks(userId: string): Promise<GitHubAppInstallationLinkDto[]> {
    const links = await this.database.gitHubAppInstallationLink.findMany({
      where: { user_id: userId },
      include: {
        installation: {
          include: {
            repositories: {
              where: { removed_at: null },
              orderBy: { full_name: 'asc' },
            },
          },
        },
      },
      orderBy: { linked_at: 'desc' },
    });
    return links.map((link) => this.presentLink(link));
  }

  async listSelectedRepositories(
    userId: string,
    installationLinkId: string,
    page: number,
    perPage: number,
  ): Promise<GitHubAppRepositoryPageDto> {
    const { link, userToken } = await this.verifyMemberAccess(
      userId,
      installationLinkId,
    );
    const repositories = await this.apiClient.listUserInstallationRepositories(
      userToken,
      link.installation.installation_id,
    );
    const verifiedAt = new Date();
    await this.database.$transaction((transaction) =>
      this.reconcileRepositories(
        transaction,
        link.installation_id,
        repositories,
        verifiedAt,
      ),
    );
    const offset = (page - 1) * perPage;
    const items = await this.database.gitHubAppRepository.findMany({
      where: { installation_id: link.installation_id, removed_at: null },
      orderBy: { full_name: 'asc' },
      skip: offset,
      take: perPage + 1,
    });
    return {
      items: items.slice(0, perPage).map(toGitHubAppRepositoryDto),
      page,
      perPage,
      hasNextPage: items.length > perPage,
      verifiedAt,
    };
  }

  async verifyRepositorySelection(
    userId: string,
    installationLinkId: string,
    repositoryIds: string[],
  ) {
    await this.listSelectedRepositories(userId, installationLinkId, 1, 100);
    const link = await this.database.gitHubAppInstallationLink.findFirst({
      where: { id: installationLinkId, user_id: userId, status: 'active' },
      include: { installation: true },
    });
    if (!link) throw this.accessError();
    const repositories = await this.database.gitHubAppRepository.findMany({
      where: {
        installation_id: link.installation_id,
        github_repository_id: { in: repositoryIds },
        removed_at: null,
      },
    });
    if (repositories.length !== new Set(repositoryIds).size) {
      throw new ApplicationError(
        'A selected GitHub repository is no longer available',
        'GITHUB_APP_REPOSITORY_NOT_SELECTED',
        403,
      );
    }
    return {
      installationLinkId: link.id,
      providerInstallationId: link.installation.installation_id,
      githubLogin: link.github_login,
      verifiedAt: link.last_verified_at ?? new Date(),
      repositories: repositories.map(toGitHubAppRepositoryDto),
    };
  }

  async findSelectedRepositoryAccess(
    userId: string,
    repositoryReference: string,
  ): Promise<{ installationLinkId: string; repositoryId: string } | null> {
    const normalizedReference = repositoryReference
      .trim()
      .replace(/^https?:\/\/(?:www\.)?github\.com\//i, '')
      .replace(/\.git\/?$/i, '')
      .replace(/\/$/, '')
      .toLowerCase();
    const link = await this.database.gitHubAppInstallationLink.findFirst({
      where: {
        user_id: userId,
        status: 'active',
        installation: {
          status: 'active',
          repositories: {
            some: {
              full_name: { equals: normalizedReference, mode: 'insensitive' },
              removed_at: null,
            },
          },
        },
      },
      include: {
        installation: {
          include: {
            repositories: {
              where: {
                full_name: { equals: normalizedReference, mode: 'insensitive' },
                removed_at: null,
              },
              take: 1,
            },
          },
        },
      },
    });
    const repository = link?.installation.repositories[0];
    if (!link || !repository) return null;

    await this.verifyRepositorySelection(userId, link.id, [
      repository.github_repository_id,
    ]);
    return {
      installationLinkId: link.id,
      repositoryId: repository.github_repository_id,
    };
  }

  async verifySelectedRepositoryControl(
    userId: string,
    repositoryId: string,
  ): Promise<boolean> {
    const link = await this.database.gitHubAppInstallationLink.findFirst({
      where: {
        user_id: userId,
        status: 'active',
        installation: {
          status: 'active',
          repositories: {
            some: {
              github_repository_id: repositoryId,
              removed_at: null,
            },
          },
        },
      },
      select: { id: true },
    });
    if (!link) return false;

    await this.verifyRepositorySelection(userId, link.id, [repositoryId]);
    return true;
  }

  async lockRepositorySelectionAuthorization(input: {
    userId: string;
    installationLinkId: string;
    repositoryIds: string[];
    transaction: Prisma.TransactionClient;
  }): Promise<boolean> {
    const repositoryIds = [...new Set(input.repositoryIds)];
    if (repositoryIds.length === 0) return false;
    const links = await input.transaction.$queryRaw<
      Array<{ installation_id: string }>
    >(Prisma.sql`
      SELECT link."installation_id"
      FROM "GitHubAppInstallationLink" AS link
      INNER JOIN "GitHubAppInstallation" AS installation
        ON installation."id" = link."installation_id"
      WHERE link."id" = ${input.installationLinkId}::uuid
        AND link."user_id" = ${input.userId}::uuid
        AND link."status"::text = 'active'
        AND installation."status"::text = 'active'
        AND installation."repository_selection"::text = 'selected'
      FOR SHARE OF link, installation
    `);
    const link = links[0];
    if (!link) return false;
    const repositories = await input.transaction.$queryRaw<
      Array<{ github_repository_id: string }>
    >(Prisma.sql`
      SELECT "github_repository_id"
      FROM "GitHubAppRepository"
      WHERE "installation_id" = ${link.installation_id}::uuid
        AND "github_repository_id" IN (${Prisma.join(repositoryIds)})
        AND "removed_at" IS NULL
      FOR SHARE
    `);
    return repositories.length === repositoryIds.length;
  }

  async disconnect(userId: string, installationLinkId: string) {
    const result = await this.database.gitHubAppInstallationLink.updateMany({
      where: { id: installationLinkId, user_id: userId, status: { not: 'disconnected' } },
      data: {
        status: 'disconnected',
        disconnected_at: new Date(),
        encrypted_user_token: null,
        encrypted_refresh_token: null,
      },
    });
    if (result.count !== 1) throw this.accessError();
    return {
      success: true,
      manageUrl: `https://github.com/settings/installations`,
    };
  }

  private async verifyMemberAccess(userId: string, installationLinkId: string) {
    let link = await this.database.gitHubAppInstallationLink.findFirst({
      where: { id: installationLinkId, user_id: userId, status: 'active' },
      include: { installation: true },
    });
    if (!link || link.installation.status !== 'active') throw this.accessError();
    await this.requireMatchingGitHubIdentity(userId, link.github_user_id);
    const providerInstallationId = link.installation.installation_id;

    let userToken: string;
    if (
      link.encrypted_user_token &&
      link.user_token_expires_at &&
      link.user_token_expires_at.getTime() > Date.now() + TOKEN_REFRESH_SKEW_MS
    ) {
      userToken = this.tokenEncryption.decrypt(link.encrypted_user_token);
    } else {
      if (
        !link.encrypted_refresh_token ||
        !link.refresh_token_expires_at ||
        link.refresh_token_expires_at <= new Date()
      ) {
        await this.requireReauthorization(link.id);
        throw this.accessError();
      }
      try {
        const refreshed = await this.apiClient.refreshUserToken(
          this.tokenEncryption.decrypt(link.encrypted_refresh_token),
        );
        userToken = refreshed.access_token;
        link = await this.database.gitHubAppInstallationLink.update({
          where: { id: link.id },
          data: {
            encrypted_user_token: this.tokenEncryption.encrypt(refreshed.access_token),
            user_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000),
            encrypted_refresh_token: this.tokenEncryption.encrypt(refreshed.refresh_token),
            refresh_token_expires_at: new Date(
              Date.now() + refreshed.refresh_token_expires_in * 1000,
            ),
          },
          include: { installation: true },
        });
      } catch {
        await this.requireReauthorization(link.id);
        throw this.accessError();
      }
    }

    const installations = await this.apiClient.listUserInstallations(userToken);
    if (
      !installations.some(
        (item) => String(item.id) === providerInstallationId,
      )
    ) {
      await this.requireReauthorization(link.id);
      throw this.accessError();
    }
    const verifiedAt = new Date();
    link = await this.database.gitHubAppInstallationLink.update({
      where: { id: link.id },
      data: { last_verified_at: verifiedAt },
      include: { installation: true },
    });
    return { link, userToken };
  }

  private async reconcileRepositories(
    transaction: Prisma.TransactionClient,
    installationId: string,
    repositories: GitHubAppRepositoryPayload[],
    verifiedAt: Date,
  ): Promise<void> {
    const activeIds = repositories.map((item) => String(item.id));
    await transaction.gitHubAppRepository.updateMany({
      where: {
        installation_id: installationId,
        removed_at: null,
        ...(activeIds.length > 0
          ? { github_repository_id: { notIn: activeIds } }
          : {}),
      },
      data: { removed_at: verifiedAt, last_verified_at: verifiedAt },
    });
    for (const repository of repositories) {
      await transaction.gitHubAppRepository.upsert({
        where: {
          installation_id_github_repository_id: {
            installation_id: installationId,
            github_repository_id: String(repository.id),
          },
        },
        create: {
          installation_id: installationId,
          github_repository_id: String(repository.id),
          full_name: repository.full_name,
          visibility: repository.visibility ?? (repository.private ? 'private' : 'public'),
          default_branch: repository.default_branch ?? null,
          last_verified_at: verifiedAt,
        },
        update: {
          full_name: repository.full_name,
          visibility: repository.visibility ?? (repository.private ? 'private' : 'public'),
          default_branch: repository.default_branch ?? null,
          last_verified_at: verifiedAt,
          removed_at: null,
        },
      });
    }
  }

  private installationCreateData(payload: GitHubAppInstallationPayload, now: Date) {
    return {
      installation_id: String(payload.id),
      ...this.installationUpdateData(payload, now),
      installed_at: new Date(payload.created_at),
    };
  }

  private installationUpdateData(payload: GitHubAppInstallationPayload, now: Date) {
    return {
      account_id: String(payload.account.id),
      account_login: payload.account.login,
      account_type: payload.account.type.toLowerCase() as GitHubAppAccountType,
      repository_selection: payload.repository_selection as GitHubAppRepositorySelection,
      permissions: payload.permissions,
      status: (payload.suspended_at ? 'suspended' : 'active') as GitHubAppInstallationStatus,
      last_verified_at: now,
      suspended_at: payload.suspended_at ? new Date(payload.suspended_at) : null,
      deleted_at: null,
    };
  }

  private assertInstallation(payload: GitHubAppInstallationPayload): void {
    const appId = this.required('GITHUB_APP_ID');
    const hasRequiredReadPermissions =
      payload.permissions.metadata === 'read' &&
      payload.permissions.contents === 'read';
    if (
      String(payload.app_id) !== appId ||
      payload.repository_selection !== 'selected' ||
      !hasRequiredReadPermissions ||
      !['User', 'Organization'].includes(payload.account.type)
    ) {
      throw new ApplicationError(
        'GitHub App installation could not be verified',
        'GITHUB_APP_INSTALLATION_NOT_VERIFIED',
        403,
      );
    }
  }

  private async requireMatchingGitHubIdentity(
    userId: string,
    authorizedGitHubUserId?: string,
  ): Promise<{ providerAccountId: string; username: string | null }> {
    const identity =
      await this.identityAccountStatus.getGitHubIdentityForUser(userId);
    if (!identity) {
      throw new ApplicationError(
        'Connect the GitHub account used to sign in before linking repositories',
        'GITHUB_APP_IDENTITY_REQUIRED',
        409,
      );
    }
    if (
      authorizedGitHubUserId &&
      identity.providerAccountId !== authorizedGitHubUserId
    ) {
      throw new ApplicationError(
        'Use the same GitHub account for Sharek sign-in and repository access',
        'GITHUB_APP_ACCOUNT_MISMATCH',
        409,
      );
    }
    return identity;
  }

  private presentLink(link: LinkWithInstallation): GitHubAppInstallationLinkDto {
    return toGitHubAppInstallationLinkDto(
      link,
      this.config.get<string>('GITHUB_APP_SLUG'),
    );
  }

  private readCandidateIds(value: unknown): Set<string> {
    return new Set(
      this.readCandidates(value).map(
        (candidate) => candidate.providerInstallationId,
      ),
    );
  }

  private readCandidates(value: unknown): GitHubAppInstallationCandidateDto[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const candidate = item as Record<string, unknown>;
      const providerInstallationId = candidate.installationId;
      const accountLogin = candidate.accountLogin;
      const accountType =
        typeof candidate.accountType === 'string'
          ? candidate.accountType.toLowerCase()
          : '';
      if (
        typeof providerInstallationId !== 'string' ||
        !/^\d+$/.test(providerInstallationId) ||
        typeof accountLogin !== 'string' ||
        accountLogin.length === 0 ||
        (accountType !== 'user' && accountType !== 'organization')
      ) {
        return [];
      }
      return [
        {
          providerInstallationId,
          accountLogin,
          accountType,
        } as GitHubAppInstallationCandidateDto,
      ];
    });
  }

  private requireReauthorization(linkId: string): Promise<unknown> {
    return this.database.gitHubAppInstallationLink.update({
      where: { id: linkId },
      data: {
        status: 'reauthorization_required',
        encrypted_user_token: null,
        encrypted_refresh_token: null,
      },
    });
  }

  private hashState(state: string): string {
    return createHash('sha256').update(state).digest('hex');
  }

  private stateError(): ApplicationError {
    return new ApplicationError(
      'GitHub App connection state is invalid or expired',
      'GITHUB_APP_STATE_INVALID',
      400,
    );
  }

  private accessError(): ApplicationError {
    return new ApplicationError(
      'GitHub App installation access could not be verified',
      'GITHUB_APP_INSTALLATION_ACCESS_NOT_VERIFIED',
      403,
    );
  }

  private safeErrorCode(error: unknown): string {
    return error instanceof ApplicationError
      ? error.code
      : 'GITHUB_APP_PROVIDER_UNAVAILABLE';
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
