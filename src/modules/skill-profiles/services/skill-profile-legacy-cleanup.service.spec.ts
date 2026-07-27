import { Prisma } from '@prisma/client';

import { SkillProfileLegacyCleanupService } from './skill-profile-legacy-cleanup.service';

describe('SkillProfileLegacyCleanupService', () => {
  const dueAt = new Date('2026-08-26T12:00:00.000Z');

  function createService(alreadyCompleted = false) {
    const operations: unknown[] = [];
    const database = {
      gitHubEvidenceCutover: {
        findUnique: jest.fn().mockResolvedValue({
          legacy_evidence_cleanup_due_at: dueAt,
          legacy_evidence_cleaned_at: alreadyCompleted ? dueAt : null,
        }),
        update: jest.fn((input) => {
          operations.push(input);
          return Promise.resolve({});
        }),
      },
      skillProfileGeneration: {
        findMany: jest.fn().mockResolvedValue([{ id: 'legacy-generation' }]),
        update: jest.fn((input) => {
          operations.push(input);
          return Promise.resolve({});
        }),
      },
      skillProfile: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'approved-skill', status: 'approved' },
          { id: 'pending-skill', status: 'pending' },
        ]),
        update: jest.fn((input) => {
          operations.push(input);
          return Promise.resolve({});
        }),
      },
      skillProfileReviewDecision: { updateMany: jest.fn() },
      $transaction: jest.fn((items: unknown[]) => Promise.all(items)),
    };
    return {
      service: new SkillProfileLegacyCleanupService(database as never),
      database,
      operations,
    };
  }

  it('fails closed by replacing all legacy/unknown private JSON', async () => {
    const { service, database } = createService();
    await expect(service.cleanup(dueAt)).resolves.toEqual({
      cleanedGenerations: 1,
      cleanedSkills: 2,
      alreadyCompleted: false,
    });
    expect(database.skillProfileGeneration.update).toHaveBeenCalledWith({
      where: { id: 'legacy-generation' },
      data: {
        selected_repositories: [
          { attribution: 'legacy-github-evidence-redacted' },
        ],
        evidence_snapshot: {
          version: 'legacy-private-evidence-redacted-v1',
          redactedAt: dueAt.toISOString(),
        },
      },
    });
    expect(database.skillProfile.update).toHaveBeenCalledWith({
      where: { id: 'approved-skill' },
      data: {
        evidence_summary: null,
        evidence_sources: { attribution: 'reviewed-github-evidence' },
      },
    });
    expect(database.skillProfile.update).toHaveBeenCalledWith({
      where: { id: 'pending-skill' },
      data: {
        evidence_summary: null,
        evidence_sources: Prisma.DbNull,
      },
    });
    expect(database.skillProfileReviewDecision.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing on an idempotent rerun and preserves decisions', async () => {
    const { service, database } = createService(true);
    await expect(service.cleanup(dueAt)).resolves.toEqual({
      cleanedGenerations: 0,
      cleanedSkills: 0,
      alreadyCompleted: true,
    });
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(database.skillProfileReviewDecision.updateMany).not.toHaveBeenCalled();
  });

  it('rejects cleanup immediately before the deadline', async () => {
    const { service } = createService();
    await expect(
      service.cleanup(new Date('2026-08-26T11:59:59.999Z')),
    ).rejects.toMatchObject({ code: 'GITHUB_EVIDENCE_CLEANUP_NOT_DUE' });
  });
});
