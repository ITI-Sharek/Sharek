import { ConfigService } from '@nestjs/config';

import { GitHubAppWebhookService } from './github-app-webhook.service';

describe('GitHubAppWebhookService', () => {
  function createService() {
    const delivery = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };
    const transaction = {
      gitHubAppRepository: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const database = {
      gitHubWebhookDelivery: delivery,
      gitHubAppInstallationLink: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      gitHubAppInstallation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ id: 'installation-internal' }),
      },
      $transaction: jest.fn(
        (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const apiClient = {
      getInstallation: jest.fn().mockResolvedValue({
        id: 987,
        app_id: 123456,
        account: { id: 77, login: 'sharek-org', type: 'Organization' },
        repository_selection: 'selected',
        permissions: { metadata: 'read', contents: 'read' },
        suspended_at: null,
        created_at: '2026-07-01T00:00:00Z',
      }),
      createInstallationToken: jest.fn().mockResolvedValue({ token: 'ephemeral' }),
      listInstallationRepositories: jest.fn().mockResolvedValue([
        {
          id: 123,
          full_name: 'sharek-org/current',
          private: true,
          default_branch: 'main',
        },
      ]),
    };
    return {
      service: new GitHubAppWebhookService(
        database as never,
        apiClient as never,
        new ConfigService({ GITHUB_APP_ID: '123456' }),
      ),
      database,
      transaction,
      apiClient,
    };
  }

  it('deduplicates already processed delivery IDs without state changes', async () => {
    const { service, database } = createService();
    database.gitHubWebhookDelivery.findUnique.mockResolvedValue({
      status: 'processed',
    });
    await expect(
      service.process('delivery-1', 'installation', {
        action: 'deleted',
        installation: { id: 987 },
      }),
    ).resolves.toEqual({ accepted: true, duplicate: true });
    expect(database.gitHubAppInstallation.updateMany).not.toHaveBeenCalled();
  });

  it('revokes only links for the provider member within the receive boundary', async () => {
    const { service, database } = createService();
    const receivedAt = Date.now();
    await service.process('delivery-2', 'github_app_authorization', {
      action: 'revoked',
      sender: { id: 42 },
    });
    expect(database.gitHubAppInstallationLink.updateMany).toHaveBeenCalledWith({
      where: { github_user_id: '42', status: { not: 'disconnected' } },
      data: expect.objectContaining({
        status: 'revoked',
        encrypted_user_token: null,
        encrypted_refresh_token: null,
      }),
    });
    const revokedAt = database.gitHubAppInstallationLink.updateMany.mock.calls[0][0]
      .data.revoked_at as Date;
    expect(revokedAt.getTime() - receivedAt).toBeLessThan(5 * 60 * 1000);
  });

  it.each([
    ['suspend', 'suspended'],
    ['deleted', 'deleted'],
  ])('reconciles installation %s', async (action, status) => {
    const { service, database } = createService();
    await service.process(`delivery-${action}`, 'installation', {
      action,
      installation: { id: 987 },
    });
    expect(database.gitHubAppInstallation.updateMany).toHaveBeenCalledWith({
      where: { installation_id: '987' },
      data: expect.objectContaining({ status }),
    });
  });

  it('re-verifies created/unsuspended installations before activation', async () => {
    const { service, database, apiClient } = createService();
    await service.process('delivery-unsuspend', 'installation', {
      action: 'unsuspend',
      installation: { id: 987 },
    });
    expect(apiClient.getInstallation).toHaveBeenCalledWith('987');
    expect(database.gitHubAppInstallation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ status: 'active' }) }),
    );
  });

  it('handles added/removed and out-of-order repository events by refreshing current state', async () => {
    const { service, transaction, apiClient } = createService();
    await service.process('delivery-repos', 'installation_repositories', {
      action: 'removed',
      installation: { id: 987 },
      repositories_removed: [{ id: 999, full_name: 'stale/removed' }],
    });
    expect(apiClient.createInstallationToken).toHaveBeenCalledWith('987');
    expect(apiClient.listInstallationRepositories).toHaveBeenCalledWith('ephemeral');
    expect(transaction.gitHubAppRepository.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        installation_id: 'installation-internal',
        github_repository_id: { notIn: ['123'] },
      }),
      data: expect.objectContaining({ removed_at: expect.any(Date) }),
    });
    expect(transaction.gitHubAppRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ github_repository_id: '123' }),
      }),
    );
  });

  it('does not reactivate a stale callback when live installation verification fails', async () => {
    const { service, database, apiClient } = createService();
    apiClient.getInstallation.mockRejectedValueOnce(
      Object.assign(new Error('deleted'), { code: 'GITHUB_APP_PROVIDER_UNAVAILABLE' }),
    );
    await expect(
      service.process('delivery-stale', 'installation', {
        action: 'created',
        installation: { id: 987 },
      }),
    ).rejects.toMatchObject({ code: 'GITHUB_APP_PROVIDER_UNAVAILABLE' });
    expect(database.gitHubAppInstallation.upsert).not.toHaveBeenCalled();
    expect(database.gitHubWebhookDelivery.update).toHaveBeenLastCalledWith({
      where: { delivery_id: 'delivery-stale' },
      data: {
        status: 'failed',
        safe_error_code: 'GITHUB_APP_WEBHOOK_PROCESSING_FAILED',
      },
    });
  });
});
