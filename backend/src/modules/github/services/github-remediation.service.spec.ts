import { Prisma } from '@prisma/client';

import { GitHubRemediationService } from './github-remediation.service';

describe('GitHubRemediationService', () => {
  const now = new Date('2026-07-19T12:00:00Z');

  function createService() {
    const database = {
      gitHubAccount: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      skillProfileGeneration: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      gitHubRemediationAudit: {
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    return {
      database,
      service: new GitHubRemediationService(database as never),
    };
  }

  it('flags null-scope and broad-scope accounts but not narrow public_repo grants', async () => {
    const { database, service } = createService();
    database.gitHubAccount.findMany
      .mockResolvedValueOnce([
        { id: 'legacy-null', token_scope: null },
        { id: 'legacy-broad', token_scope: 'read:user user:email repo' },
        { id: 'narrow', token_scope: 'read:user user:email public_repo' },
      ])
      .mockResolvedValueOnce([]);
    database.gitHubAccount.updateMany.mockResolvedValue({ count: 2 });

    const results = await service.remediate(now);

    expect(database.gitHubAccount.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['legacy-null', 'legacy-broad'] },
        requires_reauthorization: false,
      },
      data: {
        requires_reauthorization: true,
        reauthorization_required_at: now,
      },
    });
    expect(results[0]).toEqual({
      action: 'flag_legacy_accounts',
      result: 'success',
      affectedCount: 2,
    });
  });

  it('quarantines unquarantined snapshots for flagged accounts only', async () => {
    const { database, service } = createService();
    database.gitHubAccount.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ user_id: 'user-1' }, { user_id: 'user-2' }]);
    database.skillProfileGeneration.updateMany.mockResolvedValue({ count: 3 });

    const results = await service.remediate(now);

    expect(database.skillProfileGeneration.updateMany).toHaveBeenCalledWith({
      where: {
        user_id: { in: ['user-1', 'user-2'] },
        evidence_quarantined_at: null,
        NOT: {
          evidence_snapshot: {
            equals: Prisma.DbNull,
          },
        },
      },
      data: {
        evidence_quarantined_at: now,
      },
    });
    expect(results[1]).toEqual({
      action: 'quarantine_evidence_snapshots',
      result: 'success',
      affectedCount: 3,
    });
  });

  it('is idempotent when nothing is left to remediate', async () => {
    const { database, service } = createService();
    database.gitHubAccount.findMany
      .mockResolvedValueOnce([
        { id: 'narrow', token_scope: 'read:user user:email public_repo' },
      ])
      .mockResolvedValueOnce([]);

    const results = await service.remediate(now);

    expect(database.gitHubAccount.updateMany).not.toHaveBeenCalled();
    expect(database.skillProfileGeneration.updateMany).not.toHaveBeenCalled();
    expect(results.map((step) => step.affectedCount)).toEqual([0, 0, 0]);
  });

  it('purges quarantined snapshots and legacy tokens without touching fresh accounts', async () => {
    const { database, service } = createService();
    database.skillProfileGeneration.updateMany.mockResolvedValue({ count: 4 });
    database.gitHubAccount.updateMany.mockResolvedValue({ count: 2 });

    const results = await service.purge(now);

    expect(database.skillProfileGeneration.updateMany).toHaveBeenCalledWith({
      where: {
        evidence_quarantined_at: { not: null },
        evidence_purged_at: null,
      },
      data: {
        evidence_snapshot: Prisma.DbNull,
        evidence_purged_at: now,
      },
    });
    expect(database.gitHubAccount.updateMany).toHaveBeenCalledWith({
      where: {
        requires_reauthorization: true,
        legacy_token_purged_at: null,
      },
      data: {
        access_token: '',
        refresh_token: null,
        token_expires_at: null,
        legacy_token_purged_at: now,
      },
    });
    expect(results[0].affectedCount).toBe(4);
    expect(results[1].affectedCount).toBe(2);
  });

  it('deletes audit rows older than the 90-day retention window', async () => {
    const { database, service } = createService();
    database.gitHubRemediationAudit.deleteMany.mockResolvedValue({ count: 5 });

    const results = await service.purge(now);

    expect(database.gitHubRemediationAudit.deleteMany).toHaveBeenCalledWith({
      where: {
        created_at: {
          lt: new Date('2026-04-20T12:00:00Z'),
        },
      },
    });
    expect(results[2].affectedCount).toBe(5);
  });

  it('writes audit rows containing only non-sensitive fields', async () => {
    const { database, service } = createService();

    await service.remediate(now);

    for (const call of database.gitHubRemediationAudit.create.mock.calls) {
      const data = call[0].data as Record<string, unknown>;

      expect(Object.keys(data).sort()).toEqual([
        'action',
        'affected_count',
        'completed_at',
        'result',
        'started_at',
      ]);
    }
  });

  it('records a failed step without exposing error details and keeps going', async () => {
    const { database, service } = createService();
    database.gitHubAccount.findMany
      .mockRejectedValueOnce(
        new Error('token ghp_secret for owner/private-repo leaked'),
      )
      .mockResolvedValueOnce([]);

    const results = await service.remediate(now);

    expect(results[0]).toEqual({
      action: 'flag_legacy_accounts',
      result: 'failed',
      affectedCount: 0,
    });
    expect(results[1].result).toBe('success');

    const auditPayloads = JSON.stringify(
      database.gitHubRemediationAudit.create.mock.calls,
    );
    expect(auditPayloads).not.toContain('ghp_secret');
    expect(auditPayloads).not.toContain('private-repo');
  });
});
