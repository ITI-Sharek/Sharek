import { EligibilityGuidanceProcessorService } from './eligibility-guidance-processor.service';

const GUIDANCE_ID = 'dd111111-1111-4111-8111-111111111111';
const CONTRIBUTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const blockingSkills = [
  { skillName: 'react', requiredLevel: 'advanced', contributorLevel: 'beginner' },
];

describe('EligibilityGuidanceProcessorService', () => {
  const database = { eligibilityGuidance: { findUnique: jest.fn() } };
  const skills = { listApprovedSkillsForEligibility: jest.fn() };
  const ai = { requestSkillGapGuidance: jest.fn() };
  const guidance = { recordResult: jest.fn(), recordFailure: jest.fn() };
  const processor = new EligibilityGuidanceProcessorService(
    database as never,
    skills as never,
    ai as never,
    guidance as never,
  );

  const completed = () => ({
    kind: 'completed',
    missingSkills: [{ skillName: 'react' }],
    recommendedTechnologies: [],
    learningResources: [],
    practiceProjects: [],
    improvementPath: [
      { description: 'Add two React repositories.' },
      { description: 'Request re-analysis.' },
    ],
    sources: [],
    metadata: { model: 'openai/gpt-oss-120b' },
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    skills.listApprovedSkillsForEligibility.mockResolvedValue([]);
    database.eligibilityGuidance.findUnique.mockResolvedValue({
      id: GUIDANCE_ID,
      contributor_id: CONTRIBUTOR_ID,
      status: 'pending',
      blocking_skills: blockingSkills,
    });
  });

  it('turns each blocking skill into one requirement the contributor did not meet', async () => {
    // Reuses the existing guidance contract rather than forking it for this
    // trigger: a blocking skill *is* a requirement that was not met.
    ai.requestSkillGapGuidance.mockResolvedValue(completed());

    await processor.process(GUIDANCE_ID);

    const [sent] = ai.requestSkillGapGuidance.mock.calls[0];
    expect(sent.requirements).toEqual([
      {
        id: 'blocking:react',
        kind: 'required',
        position: 0,
        text: 'react at advanced level',
      },
    ]);
    expect(sent.allowedEvidenceIds).toContain('requirement:blocking:react');
  });

  it('records the narrative and recommendations on success', async () => {
    ai.requestSkillGapGuidance.mockResolvedValue(completed());

    await processor.process(GUIDANCE_ID);

    const [recorded] = guidance.recordResult.mock.calls[0];
    expect(recorded.narrative).toBe(
      'Add two React repositories.\nRequest re-analysis.',
    );
    expect(recorded.recommendations.missingSkills).toEqual([
      { skillName: 'react' },
    ]);
    expect(recorded.modelUsed).toBe('openai/gpt-oss-120b');
  });

  it.each(['no_assessable_evidence', 'system_limit'])(
    'records %s as a failure rather than an empty narrative',
    async (kind) => {
      // Both are honest non-answers. Storing either as `ready` would show the
      // contributor an empty guidance panel and call it help.
      ai.requestSkillGapGuidance.mockResolvedValue({ kind });

      await processor.process(GUIDANCE_ID);

      expect(guidance.recordFailure).toHaveBeenCalledWith(GUIDANCE_ID);
      expect(guidance.recordResult).not.toHaveBeenCalled();
    },
  );

  it('records a provider failure without throwing', async () => {
    // The worker would otherwise burn all three attempts on a service that is
    // down, while the contributor keeps seeing a row stuck on `pending`.
    ai.requestSkillGapGuidance.mockRejectedValue(new Error('unavailable'));

    await expect(processor.process(GUIDANCE_ID)).resolves.toBeUndefined();
    expect(guidance.recordFailure).toHaveBeenCalledWith(GUIDANCE_ID);
  });

  it.each(['ready', 'failed'])(
    'stands down for a row already marked %s',
    async (status) => {
      database.eligibilityGuidance.findUnique.mockResolvedValue({
        id: GUIDANCE_ID,
        contributor_id: CONTRIBUTOR_ID,
        status,
        blocking_skills: blockingSkills,
      });

      await processor.process(GUIDANCE_ID);

      expect(ai.requestSkillGapGuidance).not.toHaveBeenCalled();
    },
  );

  it('stands down for a row that no longer exists', async () => {
    database.eligibilityGuidance.findUnique.mockResolvedValue(null);

    await expect(processor.process(GUIDANCE_ID)).resolves.toBeUndefined();
    expect(ai.requestSkillGapGuidance).not.toHaveBeenCalled();
  });

  it('records no narrative when the improvement path is empty', async () => {
    ai.requestSkillGapGuidance.mockResolvedValue({
      ...completed(),
      improvementPath: [],
    });

    await processor.process(GUIDANCE_ID);

    expect(guidance.recordResult.mock.calls[0][0].narrative).toBeNull();
  });
});
