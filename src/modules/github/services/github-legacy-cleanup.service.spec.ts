import { Prisma } from '@prisma/client';

import { GitHubLegacyCleanupService } from './github-legacy-cleanup.service';

describe('GitHubLegacyCleanupService', () => {
  const dueAt = new Date('2026-08-26T12:00:00.000Z');

  function createService(options: { cleaned?: number; due?: Date | null } = {}) {
    const database = {
      gitHubEvidenceCutover: {
        findUnique: jest.fn().mockResolvedValue({
          legacy_evidence_cleanup_due_at:
            options.due === undefined ? dueAt : options.due,
        }),
      },
      gitHubAccount: {
        updateMany: jest.fn().mockResolvedValue({ count: options.cleaned ?? 2 }),
      },
    };
    return {
      service: new GitHubLegacyCleanupService(database as never),
      database,
    };
  }

  it('rejects execution before the authoritative cleanup deadline', async () => {
    const { service, database } = createService();
    await expect(
      service.cleanupRawProfiles(new Date('2026-08-26T11:59:59.999Z')),
    ).rejects.toMatchObject({ code: 'GITHUB_EVIDENCE_CLEANUP_NOT_DUE' });
    expect(database.gitHubAccount.updateMany).not.toHaveBeenCalled();
  });

  it('purges every raw/unknown profile JSON value at the exact deadline', async () => {
    const { service, database } = createService();
    await expect(service.cleanupRawProfiles(dueAt)).resolves.toEqual({
      cleanedAccounts: 2,
    });
    expect(database.gitHubAccount.updateMany).toHaveBeenCalledWith({
      where: { raw_profile_data: { not: Prisma.DbNull } },
      data: { raw_profile_data: Prisma.DbNull },
    });
  });

  it('is safe to rerun after all raw profiles are already absent', async () => {
    const { service } = createService({ cleaned: 0 });
    await expect(service.cleanupRawProfiles(dueAt)).resolves.toEqual({
      cleanedAccounts: 0,
    });
  });

  it('requires the database-owned cutover clock', async () => {
    const { service } = createService({ due: null });
    await expect(service.cleanupRawProfiles(dueAt)).rejects.toMatchObject({
      code: 'GITHUB_EVIDENCE_CUTOVER_REQUIRED',
    });
  });
});
