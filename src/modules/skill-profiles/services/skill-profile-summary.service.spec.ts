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
