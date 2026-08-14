import { ContributionRequestStatus } from '@prisma/client';

import { RequirementInferenceProcessorService } from './requirement-inference-processor.service';

const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const QUEUED_AT = new Date('2026-08-14T12:00:00.000Z');

function inferredSkill(overrides: Record<string, unknown> = {}) {
  return {
    skillName: 'NestJS',
    requiredLevel: 'intermediate',
    kind: 'required',
    confidence: 'high',
    ...overrides,
  };
}

function providerResult(skills = [inferredSkill()]) {
  return {
    skills,
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    promptVersion: 'requirement-inference-v1',
    schemaVersion: 'requirement-inference-v1',
    serviceVersion: '0.1.0',
    latencyMs: 1200,
  };
}

describe('RequirementInferenceProcessorService', () => {
  const transaction = {
    $queryRaw: jest.fn(),
    contributionRequest: { update: jest.fn(), updateMany: jest.fn() },
    contributionRequestSkillRequirement: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    aiTraceLog: { create: jest.fn() },
  };
  const database = {
    contributionRequest: { findUnique: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const ai = { inferRequirementSkills: jest.fn() };
  const service = new RequirementInferenceProcessorService(
    database as never,
    ai as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    database.$transaction.mockImplementation(
      (handler: (tx: typeof transaction) => unknown) => handler(transaction),
    );
    transaction.contributionRequestSkillRequirement.findMany.mockResolvedValue([]);
    transaction.$queryRaw.mockResolvedValue([
      {
        id: REQUEST_ID,
        status: ContributionRequestStatus.draft,
        updated_at: QUEUED_AT,
      },
    ]);
  });

  const draftReturns = (overrides: Record<string, unknown> = {}): void => {
    database.contributionRequest.findUnique.mockResolvedValue({
      id: REQUEST_ID,
      status: ContributionRequestStatus.draft,
      title: 'Add a caching layer',
      description:
        'The discovery feed recomputes technology facets on every request.',
      technology_tags: ['NestJS'],
      difficulty: 'intermediate',
      updated_at: QUEUED_AT,
      requirements: [
        { kind: 'required', position: 0, text: 'Cache the facet query' },
      ],
      ...overrides,
    });
  };

  const createdRows = () =>
    transaction.contributionRequestSkillRequirement.createMany.mock.calls[0]?.[0]
      .data;

  describe('the override rule', () => {
    it('deletes only inferred rows, never an owner override', async () => {
      // ADR 0015: a correction a human already made must survive re-inference.
      // Enforced by the delete filter rather than by reading and diffing, so it
      // holds even when the model now proposes something different.
      draftReturns();
      ai.inferRequirementSkills.mockResolvedValue(providerResult());

      await service.process(REQUEST_ID, QUEUED_AT);

      expect(
        transaction.contributionRequestSkillRequirement.deleteMany,
      ).toHaveBeenCalledWith({
        where: {
          contribution_request_id: REQUEST_ID,
          source: 'ai_inferred',
        },
      });
    });

    it('drops an inferred skill the owner has already overridden', async () => {
      // One row per normalized name is all the unique index permits, and the
      // human's wins.
      transaction.contributionRequestSkillRequirement.findMany.mockResolvedValue([
        { skill_name_normalized: 'nestjs' },
      ]);
      draftReturns();
      ai.inferRequirementSkills.mockResolvedValue(
        providerResult([
          inferredSkill({ skillName: 'NestJS' }),
          inferredSkill({ skillName: 'Redis' }),
        ]),
      );

      await service.process(REQUEST_ID, QUEUED_AT);

      expect(createdRows()).toHaveLength(1);
      expect(createdRows()[0].skill_name).toBe('Redis');
    });

    it('positions inferred rows after the owner-curated ones', async () => {
      transaction.contributionRequestSkillRequirement.findMany.mockResolvedValue([
        { skill_name_normalized: 'react' },
        { skill_name_normalized: 'typescript' },
      ]);
      draftReturns();
      ai.inferRequirementSkills.mockResolvedValue(
        providerResult([inferredSkill({ skillName: 'Redis' })]),
      );

      await service.process(REQUEST_ID, QUEUED_AT);

      expect(createdRows()[0].position).toBe(2);
    });

    it('marks every written row as inferred, with its confidence', async () => {
      draftReturns();
      ai.inferRequirementSkills.mockResolvedValue(providerResult());

      await service.process(REQUEST_ID, QUEUED_AT);

      expect(createdRows()[0]).toMatchObject({
        source: 'ai_inferred',
        confidence: 'high',
        skill_name_normalized: 'nestjs',
      });
    });
  });

  describe('provider failure', () => {
    it('records a retriable status and touches no skill row', async () => {
      // A provider outage is not a statement about the Request. Whatever bar
      // already exists must survive it untouched.
      draftReturns();
      ai.inferRequirementSkills.mockRejectedValue(new Error('unavailable'));

      await service.process(REQUEST_ID, QUEUED_AT);

      expect(
        transaction.contributionRequestSkillRequirement.deleteMany,
      ).not.toHaveBeenCalled();
      expect(
        transaction.contributionRequestSkillRequirement.createMany,
      ).not.toHaveBeenCalled();
      expect(transaction.contributionRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ skill_inference_status: 'failed' }),
        }),
      );
    });

    it('does not throw, so the worker does not burn its retry budget', async () => {
      draftReturns();
      ai.inferRequirementSkills.mockRejectedValue(new Error('unavailable'));

      await expect(service.process(REQUEST_ID, QUEUED_AT)).resolves.toBeUndefined();
    });

    it('records the failure in the audit trail', async () => {
      draftReturns();
      ai.inferRequirementSkills.mockRejectedValue(new Error('unavailable'));

      await service.process(REQUEST_ID, QUEUED_AT);

      expect(transaction.aiTraceLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agent_type: 'skill_validation',
            trigger_entity_type: 'contribution_request',
            status: 'failure',
          }),
        }),
      );
    });
  });

  describe('the audit row', () => {
    it('carries counts and timings and no request content', async () => {
      // ADR 0002: the Request's text is already stored on the Request. Copying
      // it into an append-only AI log duplicates owner content into a table
      // with a different retention story and no way to correct it.
      draftReturns();
      ai.inferRequirementSkills.mockResolvedValue(providerResult());

      await service.process(REQUEST_ID, QUEUED_AT);

      const { data } = transaction.aiTraceLog.create.mock.calls[0][0];
      expect(data).toMatchObject({
        agent_type: 'skill_validation',
        trigger_entity_id: REQUEST_ID,
        status: 'success',
        model_used: 'openai/gpt-oss-120b',
        latency_ms: 1200,
        output_payload: { skillCount: 1 },
      });
      expect(data.input_payload).toBeUndefined();
      expect(JSON.stringify(data)).not.toContain('discovery feed');
      expect(JSON.stringify(data)).not.toContain('caching layer');
    });

    it('writes exactly one row per run', async () => {
      draftReturns();
      ai.inferRequirementSkills.mockResolvedValue(providerResult());

      await service.process(REQUEST_ID, QUEUED_AT);

      expect(transaction.aiTraceLog.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('standing down', () => {
    it.each([
      ContributionRequestStatus.published,
      ContributionRequestStatus.cancelled,
      ContributionRequestStatus.completed,
    ])('writes nothing for a %s Request', async (status) => {
      // The set freezes at publication. Inferring a bar for a frozen Request is
      // exactly the retroactive change ADR 0015 forbids.
      draftReturns({ status });

      await service.process(REQUEST_ID, QUEUED_AT);

      expect(ai.inferRequirementSkills).not.toHaveBeenCalled();
      expect(database.$transaction).not.toHaveBeenCalled();
    });

    it('writes nothing for a Request that no longer exists', async () => {
      database.contributionRequest.findUnique.mockResolvedValue(null);

      await service.process(REQUEST_ID, QUEUED_AT);

      expect(ai.inferRequirementSkills).not.toHaveBeenCalled();
    });

    it('stands down when the draft was edited after the job was queued', async () => {
      // A newer job is already in flight for the newer text. Writing this
      // result would replace rows inferred from what the owner currently sees
      // with rows inferred from what they replaced.
      draftReturns({ updated_at: new Date('2026-08-14T12:05:00.000Z') });

      await service.process(REQUEST_ID, QUEUED_AT);

      expect(ai.inferRequirementSkills).not.toHaveBeenCalled();
    });

    it('rechecks status and revision under the lock before persisting', async () => {
      // Publication can happen between reading the draft and opening this
      // transaction, and the freeze is the whole point.
      draftReturns();
      ai.inferRequirementSkills.mockResolvedValue(providerResult());
      transaction.$queryRaw.mockResolvedValue([
        {
          id: REQUEST_ID,
          status: ContributionRequestStatus.published,
          updated_at: QUEUED_AT,
        },
      ]);

      await service.process(REQUEST_ID, QUEUED_AT);

      expect(
        transaction.contributionRequestSkillRequirement.deleteMany,
      ).not.toHaveBeenCalled();
      expect(transaction.aiTraceLog.create).not.toHaveBeenCalled();
    });

    it('skips a draft too thin to infer anything useful', async () => {
      // Every wasted provider call is real money, and a one-line description
      // produces a bar the owner deletes anyway.
      draftReturns({ description: 'Fix it.', requirements: [], technology_tags: [] });

      await service.process(REQUEST_ID, QUEUED_AT);

      expect(ai.inferRequirementSkills).not.toHaveBeenCalled();
      expect(database.contributionRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { skill_inference_status: 'not_started' },
        }),
      );
    });
  });

  describe('hasEnoughContent', () => {
    it.each([
      ['a short description', { description: 'Fix it.' }],
      [
        'no requirements and no tags',
        { requirementTexts: [], technologyTags: [] },
      ],
    ])('is false for %s', (_case, overrides) => {
      expect(
        RequirementInferenceProcessorService.hasEnoughContent({
          description: 'A description long enough to carry a real requirement.',
          requirementTexts: ['Cache the facet query'],
          technologyTags: ['NestJS'],
          ...overrides,
        }),
      ).toBe(false);
    });

    it('is true for a draft with a real description and a tag', () => {
      expect(
        RequirementInferenceProcessorService.hasEnoughContent({
          description: 'A description long enough to carry a real requirement.',
          requirementTexts: [],
          technologyTags: ['NestJS'],
        }),
      ).toBe(true);
    });
  });
});
