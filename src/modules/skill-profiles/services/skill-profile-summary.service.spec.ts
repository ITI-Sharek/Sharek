import { SkillProfileStatus } from '@prisma/client';

import { SkillProfileSummaryService } from './skill-profile-summary.service';

describe('SkillProfileSummaryService', () => {
  it('uses approved skills only for eligibility reads', async () => {
    const database = {
      skillProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'skill-1',
            skill_name: 'TypeScript',
            skill_key: 'typescript',
            proficiency_level: 'advanced',
            confidence_score: 0.9,
            evidence_summary: 'Authored TypeScript services',
            evidence_sources: { evidenceIds: ['github:owner/repo'] },
          },
        ]),
      },
    };
    const service = new SkillProfileSummaryService(database as never);

    await expect(
      service.listApprovedSkillsForEligibility('user-1'),
    ).resolves.toEqual([
      {
        skillProfileId: 'skill-1',
        name: 'TypeScript',
        skillKey: 'typescript',
        proficiencyLevel: 'advanced',
        confidence: 0.9,
        evidenceSummary: 'Authored TypeScript services',
        evidenceSources: {
          evidenceIds: ['github:owner/repo'],
          limitations: [],
        },
      },
    ]);
    expect(database.skillProfile.findMany).toHaveBeenCalledWith({
      where: {
        user_id: 'user-1',
        status: SkillProfileStatus.approved,
      },
      orderBy: {
        created_at: 'asc',
      },
    });
  });

  it('transactionally snapshots only approved evidence with current recorded repository authorization', async () => {
    const transaction = {
      skillProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'skill-1',
            skill_name: 'TypeScript',
            skill_key: 'typescript',
            proficiency_level: 'advanced',
            confidence_score: 0.9,
            evidence_summary: 'Authored TypeScript services',
            evidence_sources: { evidenceIds: ['opaque-evidence-1'] },
            generation: {
              id: 'generation-1',
              user_id: 'user-1',
              selected_repositories: [
                { repositoryId: '101', fullName: 'owner/repo' },
              ],
              github_app_installation_link_id: 'link-1',
              consented_at: new Date('2026-07-01T00:00:00.000Z'),
              authorization_verified_at: new Date('2026-07-01T00:00:00.000Z'),
            },
          },
          {
            id: 'legacy-skill',
            skill_name: 'Legacy',
            skill_key: 'legacy',
            proficiency_level: 'beginner',
            confidence_score: 0.5,
            evidence_summary: null,
            evidence_sources: null,
            generation: null,
          },
        ]),
      },
    };
    const github = {
      lockRepositorySelectionAuthorization: jest.fn().mockResolvedValue(true),
    };
    const service = new SkillProfileSummaryService(
      {} as never,
      github as never,
    );

    await expect(
      service.listAuthorizedSkillsForApplicationSnapshot(
        'user-1',
        transaction as never,
      ),
    ).resolves.toEqual([
      expect.objectContaining({ skillProfileId: 'skill-1' }),
    ]);
    expect(github.lockRepositorySelectionAuthorization).toHaveBeenCalledWith({
      userId: 'user-1',
      installationLinkId: 'link-1',
      repositoryIds: ['101'],
      transaction,
    });
  });

  it('excludes evidence when its repository authorization was revoked', async () => {
    const transaction = {
      skillProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'skill-1',
            generation: {
              id: 'generation-1',
              user_id: 'user-1',
              selected_repositories: [
                { repositoryId: '101', fullName: 'owner/repo' },
              ],
              github_app_installation_link_id: 'link-1',
              consented_at: new Date(),
              authorization_verified_at: new Date(),
            },
          },
        ]),
      },
    };
    const github = {
      lockRepositorySelectionAuthorization: jest.fn().mockResolvedValue(false),
    };
    const service = new SkillProfileSummaryService(
      {} as never,
      github as never,
    );

    await expect(
      service.listAuthorizedSkillsForApplicationSnapshot(
        'user-1',
        transaction as never,
      ),
    ).resolves.toEqual([]);
  });

  it('omits private evidence summaries from other-user profile projections', async () => {
    const database = {
      skillProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            skill_name: 'TypeScript',
            proficiency_level: 'advanced',
            confidence_score: 0.9,
            status: SkillProfileStatus.approved,
            evidence_summary: 'private-owner/private-repo details',
          },
        ]),
      },
    };
    const service = new SkillProfileSummaryService(database as never);
    await expect(
      service.listSkillsForProfile('user-1', { includeGenerated: false }),
    ).resolves.toEqual([
      expect.objectContaining({
        name: 'TypeScript',
        evidenceSummary: null,
      }),
    ]);
  });
});
