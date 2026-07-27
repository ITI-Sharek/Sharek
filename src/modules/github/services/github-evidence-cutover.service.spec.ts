import { ConfigService } from '@nestjs/config';

import { GitHubEvidenceCutoverService } from './github-evidence-cutover.service';

describe('GitHubEvidenceCutoverService', () => {
  const originalFetch = global.fetch;

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('purges every local credential despite partial provider revocation failure', async () => {
    const now = new Date('2026-07-27T12:00:00.000Z');
    const state = {
      id: 'github-evidence',
      cutover_at: now,
      legacy_credentials_purged_at: null,
      provider_revocation_succeeded_count: 0,
      provider_revocation_failed_count: 0,
      legacy_evidence_cleanup_due_at: new Date('2026-08-26T12:00:00.000Z'),
    };
    const transaction = {
      gitHubEvidenceCutover: { upsert: jest.fn().mockResolvedValue(state) },
    };
    const database = {
      $transaction: jest.fn(
        (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
      gitHubEvidenceCutover: {
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...state, ...data }),
        ),
      },
      gitHubAccount: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'account-1', access_token: 'encrypted-1' },
          { id: 'account-2', access_token: 'encrypted-2' },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      authProviderAccount: { updateMany: jest.fn(), deleteMany: jest.fn() },
    };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    const service = new GitHubEvidenceCutoverService(
      database as never,
      new ConfigService({ GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' }),
      { decrypt: jest.fn((value: string) => `plain-${value}`) } as never,
    );

    await expect(service.execute('release-operator', now)).resolves.toMatchObject({
      providerRevocationSucceededCount: 1,
      providerRevocationFailedCount: 1,
      manualRevocationRequiredCount: 1,
    });
    expect(database.gitHubAccount.update).toHaveBeenCalledTimes(2);
    expect(transaction.gitHubEvidenceCutover.upsert).toHaveBeenCalledWith({
      where: { id: 'github-evidence' },
      create: expect.objectContaining({
        id: 'github-evidence',
        cutover_at: now,
        executed_by: 'release-operator',
      }),
      update: {},
    });
    expect(database.gitHubAccount.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ access_token: null, refresh_token: null }),
      }),
    );
    expect(database.authProviderAccount.updateMany).not.toHaveBeenCalled();
    expect(database.authProviderAccount.deleteMany).not.toHaveBeenCalled();
  });

  it('is idempotent after credential purge', async () => {
    const existingState = {
      cutover_at: new Date(),
      legacy_credentials_purged_at: new Date(),
      provider_revocation_succeeded_count: 3,
      provider_revocation_failed_count: 0,
      legacy_evidence_cleanup_due_at: new Date(),
    };
    const transaction = {
      gitHubEvidenceCutover: {
        upsert: jest.fn().mockResolvedValue(existingState),
      },
    };
    const database = {
      $transaction: jest.fn(
        (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
      gitHubEvidenceCutover: {
      },
      gitHubAccount: { findMany: jest.fn() },
    };
    const service = new GitHubEvidenceCutoverService(
      database as never,
      new ConfigService({}),
      {} as never,
    );
    await service.execute('operator');
    expect(database.gitHubAccount.findMany).not.toHaveBeenCalled();
  });
});
