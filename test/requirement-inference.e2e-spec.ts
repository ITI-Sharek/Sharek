import { ConfigService } from '@nestjs/config';
import {
  ContributionRequestSkillRequirementSource,
  ContributionRequestStatus,
} from '@prisma/client';

import { RequirementInferenceClient } from '../src/modules/ai/integrations/requirement-inference.client';
import { AiService } from '../src/modules/ai/ai.service';
import { RequirementInferenceProcessorService } from '../src/modules/contribution-tasks/services/requirement-inference-processor.service';

const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const QUEUED_AT = new Date('2026-08-14T12:00:00.000Z');

/**
 * Draft -> infer -> override -> publish, through the real client and the real
 * processor against a stubbed AI service.
 *
 * The client is the piece that turns a JSON body into rows an authorization
 * decision will later read, so exercising it with a real HTTP payload — rather
 * than a hand-built result object — is what proves the two halves of the
 * contract actually meet. The provider is stubbed at `fetch`, the same shape
 * `scripts/advisory-fit-provider-stub.mjs` serves on `/requirements/infer`.
 */
describe('Requirement inference end to end', () => {
  const config = new ConfigService({
    AI_SERVICE_URL: 'http://ai.test',
    AI_SERVICE_AUTH_TOKEN: 'service-secret',
  });
  const originalFetch = global.fetch;

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

  const ai = new AiService(
    {} as never,
    undefined,
    undefined,
    undefined,
    new RequirementInferenceClient(config),
  );
  const processor = new RequirementInferenceProcessorService(
    database as never,
    ai,
  );

  /** What the local stub serves on `/requirements/infer`. */
  const stubbedProviderResponse = (
    skills: Array<Record<string, unknown>>,
  ): void => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        skills,
        metadata: {
          provider: 'local-stub',
          model: 'stub-v1',
          promptVersion: 'requirement-inference-v1',
          schemaVersion: 'requirement-inference-v1',
          serviceVersion: 'stub',
          latencyMs: 5,
        },
      }),
    }) as unknown as typeof fetch;
  };

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
    database.contributionRequest.findUnique.mockResolvedValue({
      id: REQUEST_ID,
      status: ContributionRequestStatus.draft,
      title: 'Add a caching layer to the discovery feed',
      description:
        'The feed recomputes technology facets on every request. Add a cache.',
      technology_tags: ['NestJS', 'Redis'],
      difficulty: 'intermediate',
      updated_at: QUEUED_AT,
      requirements: [
        { kind: 'required', position: 0, text: 'Cache the facet query' },
      ],
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const written = () =>
    transaction.contributionRequestSkillRequirement.createMany.mock.calls[0]?.[0]
      .data ?? [];

  it('turns a stubbed provider response into inferred rows', async () => {
    stubbedProviderResponse([
      {
        skillName: 'NestJS',
        requiredLevel: 'intermediate',
        kind: 'required',
        confidence: 'high',
        rationale: 'Stubbed inference from the technology tag NestJS.',
      },
      {
        skillName: 'Redis',
        requiredLevel: 'beginner',
        kind: 'preferred',
        confidence: 'medium',
        rationale: 'Stubbed inference from the technology tag Redis.',
      },
    ]);

    await processor.process(REQUEST_ID, QUEUED_AT);

    expect(written()).toHaveLength(2);
    expect(written()[0]).toMatchObject({
      skill_name: 'NestJS',
      skill_name_normalized: 'nestjs',
      required_level: 'intermediate',
      kind: 'required',
      source: ContributionRequestSkillRequirementSource.ai_inferred,
      confidence: 'high',
    });
    // At least one `required` row, which is what makes the draft publishable.
    expect(written().some((row: { kind: string }) => row.kind === 'required')).toBe(
      true,
    );
  });

  it('sends the Request content and no contributor data over the wire', async () => {
    stubbedProviderResponse([
      {
        skillName: 'NestJS',
        requiredLevel: 'intermediate',
        kind: 'required',
        confidence: 'high',
        rationale: 'Stubbed.',
      },
    ]);

    await processor.process(REQUEST_ID, QUEUED_AT);

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const sent = JSON.parse(options.body);
    expect(sent.technologyTags).toEqual(['NestJS', 'Redis']);
    expect(sent.requirementTexts).toEqual(['Cache the facet query']);
    expect(JSON.stringify(sent).toLowerCase()).not.toContain('contributor');
  });

  it('keeps an owner override through a later inference run', async () => {
    // The override path end to end: the owner corrected NestJS, the model still
    // proposes it, and the human's row is the one that survives (ADR 0015).
    transaction.contributionRequestSkillRequirement.findMany.mockResolvedValue([
      { skill_name_normalized: 'nestjs' },
    ]);
    stubbedProviderResponse([
      {
        skillName: 'NestJS',
        requiredLevel: 'beginner',
        kind: 'preferred',
        confidence: 'low',
        rationale: 'Stubbed.',
      },
      {
        skillName: 'Redis',
        requiredLevel: 'intermediate',
        kind: 'required',
        confidence: 'high',
        rationale: 'Stubbed.',
      },
    ]);

    await processor.process(REQUEST_ID, QUEUED_AT);

    expect(
      transaction.contributionRequestSkillRequirement.deleteMany,
    ).toHaveBeenCalledWith({
      where: {
        contribution_request_id: REQUEST_ID,
        source: ContributionRequestSkillRequirementSource.ai_inferred,
      },
    });
    expect(written().map((row: { skill_name: string }) => row.skill_name)).toEqual(
      ['Redis'],
    );
  });

  it('leaves the draft editable and retriable when the provider is down', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    await processor.process(REQUEST_ID, QUEUED_AT);

    expect(
      transaction.contributionRequestSkillRequirement.deleteMany,
    ).not.toHaveBeenCalled();
    expect(transaction.contributionRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: ContributionRequestStatus.draft }),
        data: expect.objectContaining({ skill_inference_status: 'failed' }),
      }),
    );
  });

  it('persists nothing when the stub returns an out-of-vocabulary level', async () => {
    // The realistic bad answer: a confident reply in a scale the platform does
    // not have. NestJS refuses it rather than coercing or dropping the row.
    stubbedProviderResponse([
      {
        skillName: 'NestJS',
        requiredLevel: 'expert',
        kind: 'required',
        confidence: 'high',
        rationale: 'Stubbed.',
      },
    ]);

    await processor.process(REQUEST_ID, QUEUED_AT);

    expect(
      transaction.contributionRequestSkillRequirement.createMany,
    ).not.toHaveBeenCalled();
    expect(transaction.contributionRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ skill_inference_status: 'failed' }),
      }),
    );
  });
});
