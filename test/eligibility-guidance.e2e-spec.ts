import { SkillProfileProficiencyLevel } from '@prisma/client';

import { EligibilityGuidanceProcessorService } from '../src/modules/skill-guidance/services/eligibility-guidance-processor.service';
import { EligibilityGuidanceService } from '../src/modules/skill-guidance/services/eligibility-guidance.service';

const CONTRIBUTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CONTRIBUTOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EVALUATION_ID = 'e1111111-1111-4111-8111-111111111111';
const GUIDANCE_ID = 'dd111111-1111-4111-8111-111111111111';
const { advanced, beginner } = SkillProfileProficiencyLevel;

const contributor = {
  id: CONTRIBUTOR_ID,
  email: 'contributor@example.com',
  role: 'contributor' as const,
  status: 'active' as const,
};

const blockingSkills = [
  { skillName: 'react', requiredLevel: advanced, contributorLevel: beginner },
];

/**
 * Block -> request -> poll -> guidance appears, through the real service and
 * the real processor against an in-memory store.
 *
 * The store is a plain object rather than jest mocks because the property under
 * test is temporal: the row must be *readable and useful* between the request
 * and the provider answering. A per-call mock cannot express "the same row,
 * later".
 */
describe('Eligibility guidance end to end', () => {
  let rows: Array<Record<string, unknown>>;

  const database = {
    eligibilityEvaluation: {
      findFirst: jest.fn(({ where }) =>
        Promise.resolve(
          where.id === EVALUATION_ID && where.contributor_id === CONTRIBUTOR_ID
            ? {
                id: EVALUATION_ID,
                outcome: 'blocked',
                blocking_skills: blockingSkills,
              }
            : null,
        ),
      ),
    },
    eligibilityGuidance: {
      create: jest.fn(({ data }) => {
        const row = {
          id: GUIDANCE_ID,
          narrative: null,
          recommendations: null,
          model_used: null,
          created_at: new Date('2026-08-14T12:00:00.000Z'),
          updated_at: new Date('2026-08-14T12:00:00.000Z'),
          ...data,
        };
        rows.push(row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(({ where }) =>
        Promise.resolve(
          rows.find(
            (row) =>
              (where.id === undefined || row.id === where.id) &&
              row.contributor_id === where.contributor_id &&
              (where.status?.in === undefined ||
                where.status.in.includes(row.status)),
          ) ?? null,
        ),
      ),
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(rows.find((row) => row.id === where.id) ?? null),
      ),
      findMany: jest.fn(({ where }) =>
        Promise.resolve(
          rows.filter((row) => row.contributor_id === where.contributor_id),
        ),
      ),
      updateMany: jest.fn(({ where, data }) => {
        let count = 0;
        for (const row of rows) {
          if (row.id !== where.id) continue;
          if (where.status !== undefined && row.status !== where.status) continue;
          Object.assign(row, data);
          count += 1;
        }
        return Promise.resolve({ count });
      }),
    },
  };
  const queue = { enqueueGeneration: jest.fn() };
  const skills = { listApprovedSkillsForEligibility: jest.fn() };
  const ai = { requestSkillGapGuidance: jest.fn() };

  const service = new EligibilityGuidanceService(
    database as never,
    queue as never,
  );
  const processor = new EligibilityGuidanceProcessorService(
    database as never,
    skills as never,
    ai as never,
    service,
  );

  beforeEach(() => {
    rows = [];
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    skills.listApprovedSkillsForEligibility.mockResolvedValue([]);
  });

  const providerReturns = (): void => {
    ai.requestSkillGapGuidance.mockResolvedValue({
      kind: 'completed',
      missingSkills: [{ skillName: 'react' }],
      recommendedTechnologies: [],
      learningResources: [],
      practiceProjects: [],
      improvementPath: [
        { description: 'Add two React repositories to your GitHub selection.' },
        { description: 'Request re-analysis and wait for admin approval.' },
      ],
      sources: [],
      metadata: { model: 'stub-v1' },
    });
  };

  it('gives the contributor a usable answer before the provider has replied', async () => {
    providerReturns();

    const requested = await service.request(contributor, EVALUATION_ID);

    // The narrative has not been generated yet, and the answer is still useful:
    // the contributor knows exactly which skill blocked them and at what level.
    expect(requested.status).toBe('pending');
    expect(requested.narrative).toBeNull();
    expect(requested.blockingSkills).toEqual(blockingSkills);
    expect(ai.requestSkillGapGuidance).not.toHaveBeenCalled();
  });

  it('completes the poll cycle once the worker runs', async () => {
    providerReturns();
    const requested = await service.request(contributor, EVALUATION_ID);

    const whilePending = await service.getForActor(contributor, requested.id);
    expect(whilePending.status).toBe('pending');

    await processor.process(requested.id);

    const afterward = await service.getForActor(contributor, requested.id);
    expect(afterward.status).toBe('ready');
    expect(afterward.narrative).toContain('Add two React repositories');
    // The reason is still there alongside the narrative, not replaced by it.
    expect(afterward.blockingSkills).toEqual(blockingSkills);
  });

  it('keeps the deterministic reason visible when generation fails', async () => {
    // The criterion that matters most: a contributor is never told only "you
    // are blocked" with no explanation.
    ai.requestSkillGapGuidance.mockRejectedValue(new Error('provider down'));
    const requested = await service.request(contributor, EVALUATION_ID);

    await processor.process(requested.id);

    const afterward = await service.getForActor(contributor, requested.id);
    expect(afterward.status).toBe('failed');
    expect(afterward.narrative).toBeNull();
    expect(afterward.blockingSkills).toEqual(blockingSkills);
  });

  it('lets the contributor retry after a failure but not while one is in flight', async () => {
    ai.requestSkillGapGuidance.mockRejectedValue(new Error('provider down'));
    const first = await service.request(contributor, EVALUATION_ID);

    // While pending, a second request returns the same row rather than queuing
    // another provider call for the same gap.
    const duplicate = await service.request(contributor, EVALUATION_ID);
    expect(duplicate.id).toBe(first.id);
    expect(queue.enqueueGeneration).toHaveBeenCalledTimes(1);

    await processor.process(first.id);

    // After it fails, a retry is allowed.
    database.eligibilityGuidance.create.mockImplementationOnce(({ data }) => {
      const row = {
        id: 'dd222222-2222-4222-8222-222222222222',
        narrative: null,
        recommendations: null,
        model_used: null,
        created_at: new Date('2026-08-14T12:05:00.000Z'),
        updated_at: new Date('2026-08-14T12:05:00.000Z'),
        ...data,
      };
      rows.push(row);
      return Promise.resolve(row);
    });
    const retry = await service.request(contributor, EVALUATION_ID);
    expect(retry.id).not.toBe(first.id);
    expect(queue.enqueueGeneration).toHaveBeenCalledTimes(2);
  });

  it('shows one contributor nothing of another contributor guidance', async () => {
    providerReturns();
    const requested = await service.request(contributor, EVALUATION_ID);
    await processor.process(requested.id);

    const other = { ...contributor, id: OTHER_CONTRIBUTOR_ID };

    await expect(
      service.getForActor(other, requested.id),
    ).rejects.toMatchObject({ code: 'ELIGIBILITY_GUIDANCE_NOT_FOUND' });
    await expect(
      service.request(other, EVALUATION_ID),
    ).rejects.toMatchObject({ code: 'ELIGIBILITY_GUIDANCE_NOT_FOUND' });
    await expect(service.listForActor(other, {})).resolves.toMatchObject({
      items: [],
    });
  });

  it('lists the contributor own history', async () => {
    providerReturns();
    await service.request(contributor, EVALUATION_ID);

    const page = await service.listForActor(contributor, {});

    expect(page.items).toHaveLength(1);
    expect(page.items[0].eligibilityEvaluationId).toBe(EVALUATION_ID);
    expect(page.pageInfo.hasNextPage).toBe(false);
  });
});
