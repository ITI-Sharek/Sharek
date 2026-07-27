import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { ApplicationError } from '../../../shared/errors/application.error';
import { GitHubAppApiClient } from '../integrations/github-app-api.client';

@Injectable()
export class GitHubAppWebhookService {
  constructor(
    private readonly database: DatabaseService,
    private readonly apiClient: GitHubAppApiClient,
    private readonly config: ConfigService,
  ) {}

  async process(
    deliveryId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<{ accepted: true; duplicate: boolean }> {
    const action = typeof payload.action === 'string' ? payload.action : null;
    const providerInstallationId = this.installationId(payload);
    const existing = await this.database.gitHubWebhookDelivery.findUnique({
      where: { delivery_id: deliveryId },
    });
    if (existing?.status === 'processed' || existing?.status === 'ignored' || existing?.status === 'received') {
      return { accepted: true, duplicate: true };
    }

    if (existing) {
      await this.database.gitHubWebhookDelivery.update({
        where: { delivery_id: deliveryId },
        data: { status: 'received', retry_count: { increment: 1 }, safe_error_code: null },
      });
    } else {
      try {
        await this.database.gitHubWebhookDelivery.create({
          data: {
            delivery_id: deliveryId,
            event,
            action,
            provider_installation_id: providerInstallationId,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return { accepted: true, duplicate: true };
        }
        throw error;
      }
    }

    try {
      const processed = await this.applyEvent(event, action, payload);
      await this.database.gitHubWebhookDelivery.update({
        where: { delivery_id: deliveryId },
        data: {
          status: processed ? 'processed' : 'ignored',
          processed_at: new Date(),
        },
      });
      return { accepted: true, duplicate: false };
    } catch (error) {
      await this.database.gitHubWebhookDelivery.update({
        where: { delivery_id: deliveryId },
        data: {
          status: 'failed',
          safe_error_code:
            error instanceof ApplicationError
              ? error.code
              : 'GITHUB_APP_WEBHOOK_PROCESSING_FAILED',
        },
      });
      throw error;
    }
  }

  private async applyEvent(
    event: string,
    action: string | null,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    if (event === 'github_app_authorization' && action === 'revoked') {
      const sender = this.object(payload.sender);
      const githubUserId = this.id(sender.id);
      if (!githubUserId) return false;
      await this.database.gitHubAppInstallationLink.updateMany({
        where: { github_user_id: githubUserId, status: { not: 'disconnected' } },
        data: {
          status: 'revoked',
          revoked_at: new Date(),
          encrypted_user_token: null,
          encrypted_refresh_token: null,
        },
      });
      return true;
    }

    if (event === 'installation') {
      const installationId = this.installationId(payload);
      if (!installationId) return false;
      if (action === 'deleted' || action === 'suspend') {
        const status = action === 'deleted' ? 'deleted' : 'suspended';
        const now = new Date();
        await this.database.gitHubAppInstallation.updateMany({
          where: { installation_id: installationId },
          data: {
            status,
            ...(action === 'deleted' ? { deleted_at: now } : { suspended_at: now }),
          },
        });
        return true;
      }
      if (action === 'created' || action === 'unsuspend') {
        const verified = await this.apiClient.getInstallation(installationId);
        this.assertVerifiedInstallation(verified);
        await this.database.gitHubAppInstallation.upsert({
          where: { installation_id: installationId },
          create: {
            installation_id: installationId,
            account_id: String(verified.account.id),
            account_login: verified.account.login,
            account_type: verified.account.type.toLowerCase() as 'user' | 'organization',
            repository_selection: 'selected',
            permissions: verified.permissions,
            status: 'active',
            installed_at: new Date(verified.created_at),
            last_verified_at: new Date(),
          },
          update: {
            status: 'active',
            suspended_at: null,
            deleted_at: null,
            last_verified_at: new Date(),
          },
        });
        return true;
      }
    }

    if (event === 'installation_repositories') {
      const installationId = this.installationId(payload);
      if (!installationId) return false;
      const installation = await this.database.gitHubAppInstallation.findUnique({
        where: { installation_id: installationId },
      });
      if (!installation) return false;
      const now = new Date();
      const token = await this.apiClient.createInstallationToken(installationId);
      const current = await this.apiClient.listInstallationRepositories(token.token);
      await this.database.$transaction(async (transaction) => {
        const currentIds = current.map((repository) => String(repository.id));
        await transaction.gitHubAppRepository.updateMany({
          where: {
            installation_id: installation.id,
            removed_at: null,
            ...(currentIds.length > 0
              ? { github_repository_id: { notIn: currentIds } }
              : {}),
          },
          data: { removed_at: now, last_verified_at: now },
        });
        for (const repository of current) {
          await transaction.gitHubAppRepository.upsert({
            where: {
              installation_id_github_repository_id: {
                installation_id: installation.id,
                github_repository_id: String(repository.id),
              },
            },
            create: {
              installation_id: installation.id,
              github_repository_id: String(repository.id),
              full_name: repository.full_name!,
              visibility: repository.visibility ?? (repository.private ? 'private' : 'public'),
              default_branch: repository.default_branch ?? null,
              last_verified_at: now,
            },
            update: {
              full_name: repository.full_name!,
              visibility: repository.visibility ?? (repository.private ? 'private' : 'public'),
              default_branch: repository.default_branch ?? null,
              removed_at: null,
              last_verified_at: now,
            },
          });
        }
      });
      return true;
    }
    return false;
  }

  private assertVerifiedInstallation(installation: {
    app_id: number;
    repository_selection: string;
    permissions: Record<string, string>;
  }): void {
    if (
      String(installation.app_id) !== this.config.get<string>('GITHUB_APP_ID') ||
      installation.repository_selection !== 'selected' ||
      installation.permissions.metadata !== 'read' ||
      installation.permissions.contents !== 'read'
    ) {
      throw new ApplicationError(
        'GitHub App installation could not be verified',
        'GITHUB_APP_INSTALLATION_NOT_VERIFIED',
        403,
      );
    }
  }

  private installationId(payload: Record<string, unknown>): string | null {
    return this.id(this.object(payload.installation).id);
  }

  private object(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private id(value: unknown): string | null {
    return typeof value === 'number' || typeof value === 'string'
      ? String(value)
      : null;
  }
}
