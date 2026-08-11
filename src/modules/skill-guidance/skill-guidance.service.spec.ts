import { SkillGapGuidanceService } from './skill-guidance.service';

describe('SkillGapGuidanceService', () => {
  const actor = {
    id: 'contributor-1',
    email: 'contributor@example.com',
    role: 'contributor' as const,
    status: 'active' as const,
  };

  it('builds guidance from a published request and approved skills without tier gating', async () => {
    const requestContext = {
      id: 'request-1',
      requirements: [
        {
          id: 'requirement-1',
          kind: 'required' as const,
          position: 0,
          text: 'Build a scheduled data pipeline with Apache Airflow',
        },
      ],
    };
    const taskContext = {
      getPublishedRequest: jest.fn().mockResolvedValue(requestContext),
    };
    const skills = {
      listApprovedSkillsForEligibility: jest.fn().mockResolvedValue([
        {
          skillProfileId: 'skill-1',
          name: 'Python',
          skillKey: 'python',
          proficiencyLevel: 'advanced',
          confidence: 0.96,
          evidenceSummary: 'Reviewed Python work',
          evidenceSources: null,
        },
      ]),
    };
    const ai = {
      requestSkillGapGuidance: jest.fn().mockResolvedValue({
        kind: 'completed',
        missingSkills: [],
        recommendedTechnologies: [],
        learningResources: [],
        practiceProjects: [],
        improvementPath: [],
        sources: [],
        metadata: {
          provider: 'fixture',
          model: 'fixture',
          promptVersion: 'skill-gap-guidance-v1',
          schemaVersion: 'skill-gap-guidance-v1',
          serviceVersion: 'test',
        },
      }),
    };
    const service = new SkillGapGuidanceService(
      taskContext as never,
      skills as never,
      ai as never,
    );

    await service.generate(actor, 'request-1');

    expect(ai.requestSkillGapGuidance).toHaveBeenCalledWith(
      expect.objectContaining({
        requirements: [
          {
            id: 'requirement-1',
            kind: 'required',
            position: 0,
            text: 'Build a scheduled data pipeline with Apache Airflow',
          },
        ],
        approvedSkills: [
          expect.objectContaining({
            evidenceId: 'skill:skill-1',
            name: 'Python',
            proficiency: 'advanced',
          }),
        ],
        allowedEvidenceIds: ['requirement:requirement-1', 'skill:skill-1'],
        contractVersion: 'skill-gap-guidance-v1',
      }),
    );
  });

  it('rejects non-contributor or inactive callers before reading evidence', async () => {
    const taskContext = { getPublishedRequest: jest.fn() };
    const skills = { listApprovedSkillsForEligibility: jest.fn() };
    const ai = { requestSkillGapGuidance: jest.fn() };
    const service = new SkillGapGuidanceService(
      taskContext as never,
      skills as never,
      ai as never,
    );

    await expect(
      service.generate(
        {
          ...actor,
          role: 'owner',
        },
        'request-1',
      ),
    ).rejects.toMatchObject({ code: 'SKILL_GAP_GUIDANCE_FORBIDDEN' });
    expect(taskContext.getPublishedRequest).not.toHaveBeenCalled();
  });
});
