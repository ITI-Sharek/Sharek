import { SkillProfileStatus } from '@prisma/client';

import { SkillProfileSummaryService } from '../src/modules/skill-profiles/services/skill-profile-summary.service';
import { presentSkillProfileGeneration } from '../src/modules/skill-profiles/utils/skill-profile-generation.mapper';

describe('Private GitHub evidence audience projections', () => {
  const privateName = 'private-owner/private-repo';

  it('keeps owner generation detail bounded while public output removes private evidence', async () => {
    const logSink: string[] = [];
    const generation = presentSkillProfileGeneration({
      id: 'generation-1',
      user_id: 'user-1',
      status: 'pending_review',
      selected_repositories: [{ repositoryId: '123', fullName: privateName }],
      evidence_snapshot: { rawReadme: 'private content' },
      fraud_signals: [],
      evidence_quality: 'strong',
      failure_reason: null,
      provider: 'openai',
      model: 'model',
      prompt_version: 'v1',
      schema_version: 'v1',
      service_version: 'v1',
      selected_repository_count: 1,
      snapshotted_repository_count: 1,
      github_app_installation_link_id: 'link-1',
      provider_installation_id: '987',
      consent_version: 'github-skill-analysis-v1',
      consented_at: new Date(),
      authorization_verified_at: new Date(),
      authorization_failure_code: null,
      retry_of_generation_id: null,
      created_at: new Date(),
      updated_at: new Date(),
      completed_at: new Date(),
      skillProfiles: [
        {
          id: 'skill-1',
          user_id: 'user-1',
          generation_id: 'generation-1',
          skill_name: 'TypeScript',
          skill_key: 'typescript',
          proficiency_level: 'advanced',
          confidence_score: 0.9,
          evidence_summary: `Evidence from ${privateName}`,
          evidence_sources: { evidenceIds: ['github-evidence:opaque'] },
          status: 'pending',
          reviewed_by: null,
          admin_notes: null,
          original_proficiency: null,
          reviewed_at: null,
          superseded_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    expect(generation.selectedRepositories).toEqual([
      { repositoryId: '123', fullName: privateName },
    ]);
    expect(generation).not.toHaveProperty('evidenceSnapshot');
    logSink.push(JSON.stringify({ generationId: generation.generationId }));
    expect(logSink.join(' ')).not.toContain(privateName);

    const database = {
      skillProfile: {
        findMany: jest.fn().mockResolvedValue([
          {
            skill_name: 'TypeScript',
            proficiency_level: 'advanced',
            confidence_score: 0.9,
            status: SkillProfileStatus.approved,
            evidence_summary: `Evidence from ${privateName}`,
          },
        ]),
      },
    };
    const summary = new SkillProfileSummaryService(database as never);
    const publicProjection = await summary.listSkillsForProfile('user-1', {
      includeGenerated: false,
    });
    expect(JSON.stringify(publicProjection)).not.toContain(privateName);
    expect(publicProjection[0].evidenceSummary).toBeNull();
  });

  it('uses approved-only database predicates for eligibility', async () => {
    const database = {
      skillProfile: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const summary = new SkillProfileSummaryService(database as never);
    await summary.listApprovedSkillsForEligibility('user-1');
    expect(database.skillProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'user-1', status: SkillProfileStatus.approved },
      }),
    );
  });
});
