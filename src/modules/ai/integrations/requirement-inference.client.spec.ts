import { ConfigService } from '@nestjs/config';

import { ApplicationError } from '../../../shared/errors/application.error';
import { RequirementInferenceInput } from '../dto/requirement-inference.dto';
import { RequirementInferenceClient } from './requirement-inference.client';

const config = new ConfigService({
  AI_SERVICE_URL: 'http://ai.test',
  AI_SERVICE_AUTH_TOKEN: 'service-secret',
});

const input: RequirementInferenceInput = {
  contributionRequestId: '33333333-3333-4333-8333-333333333333',
  title: 'Add a caching layer',
  description: 'The feed recomputes facets on every request.',
  requirementTexts: ['Cache the facet query'],
  technologyTags: ['NestJS'],
  difficulty: 'intermediate',
  contractVersion: 'requirement-inference-v1',
};

function skill(overrides: Record<string, unknown> = {}) {
  return {
    skillName: 'NestJS',
    requiredLevel: 'intermediate',
    kind: 'required',
    confidence: 'high',
    rationale: 'The Request asks for cache invalidation.',
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    skills: [skill()],
    metadata: {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      promptVersion: 'requirement-inference-v1',
      schemaVersion: 'requirement-inference-v1',
      serviceVersion: '0.1.0',
      latencyMs: 1200,
    },
    ...overrides,
  };
}

function respondWith(payload: unknown, ok = true): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('RequirementInferenceClient', () => {
  const client = new RequirementInferenceClient(config);
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const expectInvalid = async (payload: unknown): Promise<void> => {
    respondWith(payload);
    await expect(client.infer(input)).rejects.toMatchObject({
      code: 'AI_REQUIREMENT_INFERENCE_RESPONSE_INVALID',
      statusCode: 502,
    } satisfies Partial<ApplicationError>);
  };

  it('sends the bearer token and the request content, and nothing else', async () => {
    const fetchMock = respondWith(body());

    await client.infer(input);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ai.test/requirements/infer');
    expect(options.headers.authorization).toBe('Bearer service-secret');
    // The agent never sees contributor data (DEC-078). Asserted on the wire,
    // because the FastAPI schema forbidding extras is a promise made by a
    // separately deployed service.
    const sent = JSON.parse(options.body);
    expect(Object.keys(sent).sort()).toEqual([
      'contractVersion',
      'contributionRequestId',
      'description',
      'difficulty',
      'requirementTexts',
      'technologyTags',
      'title',
    ]);
  });

  it('returns a validated set', async () => {
    respondWith(body());

    const result = await client.infer(input);

    expect(result.skills).toEqual([
      {
        skillName: 'NestJS',
        requiredLevel: 'intermediate',
        kind: 'required',
        confidence: 'high',
      },
    ]);
    expect(result.model).toBe('openai/gpt-oss-120b');
    expect(result.latencyMs).toBe(1200);
  });

  it('drops the rationale rather than persisting model prose', async () => {
    // The rationale helps a human read the draft, but nothing consumes it and
    // storing free model text next to an authorization input invites someone to
    // start showing it as a justification for a refusal.
    respondWith(body());
    const result = await client.infer(input);
    expect(result.skills[0]).not.toHaveProperty('rationale');
  });

  describe('revalidating what the agent already promised', () => {
    // ADR 0015 makes these rows an authorization input, and the rule the
    // product rests on is that NestJS validates AI output and decides. A schema
    // on the far side of an HTTP call cannot be that check.

    it.each(['expert', 'novice', 'ADVANCED', '', 3, null])(
      'rejects the out-of-vocabulary level %p',
      async (requiredLevel) => {
        await expectInvalid(body({ skills: [skill({ requiredLevel })] }));
      },
    );

    it.each(['HIGH', 'very high', 0.9, 90, '90%', null])(
      'rejects the non-categorical confidence %p',
      async (confidence) => {
        // Rejected rather than coerced: mapping 0.9 to `high` would invent a
        // categorical judgement the agent never made.
        await expectInvalid(body({ skills: [skill({ confidence })] }));
      },
    );

    it.each(['mandatory', 'optional', '', null])(
      'rejects the unknown kind %p',
      async (kind) => {
        await expectInvalid(body({ skills: [skill({ kind })] }));
      },
    );

    it('rejects a set larger than the cap', async () => {
      await expectInvalid(
        body({ skills: Array.from({ length: 16 }, () => skill()) }),
      );
    });

    it('rejects two spellings of one skill', async () => {
      // Normalized with the same function the unique index is built on, so a
      // set that would violate it is refused before a transaction is opened
      // rather than surfacing as a P2002 inside the worker.
      await expectInvalid(
        body({
          skills: [skill({ skillName: 'Node.js' }), skill({ skillName: 'nodejs' })],
        }),
      );
    });

    it('rejects a skill name that normalizes to nothing', async () => {
      await expectInvalid(body({ skills: [skill({ skillName: '---' })] }));
    });

    it('fails the whole run rather than dropping one bad row', async () => {
      // A silently discarded skill is a bar the owner never sees and never
      // approves.
      await expectInvalid(
        body({ skills: [skill(), skill({ skillName: 'React', requiredLevel: 'expert' })] }),
      );
    });

    it.each([
      ['a non-object payload', []],
      ['a missing skills array', { metadata: body().metadata }],
      ['missing metadata', { skills: [skill()] }],
    ])('rejects %s', async (_case, payload) => {
      await expectInvalid(payload);
    });

    it('accepts an empty set, because a vague Request implies no bar', async () => {
      respondWith(body({ skills: [] }));
      const result = await client.infer(input);
      expect(result.skills).toEqual([]);
    });
  });

  it('maps a non-2xx response to a retriable service error', async () => {
    respondWith({}, false);
    await expect(client.infer(input)).rejects.toMatchObject({
      code: 'AI_REQUIREMENT_INFERENCE_SERVICE_ERROR',
      statusCode: 502,
    } satisfies Partial<ApplicationError>);
  });

  it('maps a transport failure to a retriable service error', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(client.infer(input)).rejects.toMatchObject({
      code: 'AI_REQUIREMENT_INFERENCE_SERVICE_UNAVAILABLE',
      statusCode: 502,
    } satisfies Partial<ApplicationError>);
  });
});
