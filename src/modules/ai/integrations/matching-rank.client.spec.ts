import { ConfigService } from '@nestjs/config';

import { ApplicationError } from '../../../shared/errors/application.error';
import { MatchingRankClient } from './matching-rank.client';
import type { MatchingRankInput } from '../dto/matching-rank.dto';

describe('MatchingRankClient', () => {
  const config = {
    get: (key: string, fallback: unknown) =>
      key === 'AI_SERVICE_AUTH_TOKEN' ? 'service-secret' : fallback,
  } as unknown as ConfigService;

  const client = new MatchingRankClient(config);

  const input: MatchingRankInput = {
    matchingRequestId: 'shortlist-2',
    approvedSkills: [{ name: 'NestJS', proficiency: 'advanced' }],
    candidates: [
      {
        requestId: 'request-1',
        title: 'One',
        projectName: 'Share-k',
        technologyTags: ['NestJS'],
        requirementTexts: ['Tested services.'],
        matchedSkills: [{ name: 'NestJS', proficiency: 'advanced' }],
        confidence: 'HIGH',
        deterministicRank: 1,
      },
      {
        requestId: 'request-2',
        title: 'Two',
        projectName: 'Share-k',
        technologyTags: ['PostgreSQL'],
        requirementTexts: ['Query tuning.'],
        matchedSkills: [],
        confidence: 'LOW',
        deterministicRank: 2,
      },
    ],
    contractVersion: 'matching-rank-v1',
  };

  const metadata = {
    provider: 'groq',
    model: 'test-model',
    promptVersion: 'matching-rank-v1',
    schemaVersion: 'matching-rank-v1',
    serviceVersion: '0.1.0',
    latencyMs: 42,
  };

  function respond(body: unknown, ok = true) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      json: async () => body,
    }) as unknown as typeof fetch;
  }

  afterEach(() => jest.restoreAllMocks());

  it('returns the agent order when it is a clean permutation', async () => {
    respond({
      matches: [
        { requestId: 'request-2', whyThisMatches: 'Closer fit.' },
        { requestId: 'request-1', whyThisMatches: 'Also relevant.' },
      ],
      metadata,
    });

    const result = await client.rank(input);

    expect(result.matches.map((m) => m.requestId)).toEqual([
      'request-2',
      'request-1',
    ]);
    expect(result.provider).toBe('groq');
  });

  it('sends the bearer token', async () => {
    respond({
      matches: [
        { requestId: 'request-1', whyThisMatches: 'a' },
        { requestId: 'request-2', whyThisMatches: 'b' },
      ],
      metadata,
    });

    await client.rank(input);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.authorization).toBe('Bearer service-secret');
  });

  describe('rejects anything that is not a permutation of what it sent', () => {
    it.each([
      [
        'an added request the exclusions rejected',
        [
          { requestId: 'request-1', whyThisMatches: 'a' },
          { requestId: 'request-2', whyThisMatches: 'b' },
          { requestId: 'request-99', whyThisMatches: 'invented' },
        ],
      ],
      [
        'a dropped request',
        [{ requestId: 'request-1', whyThisMatches: 'a' }],
      ],
      [
        // Same set, same length — caught only because duplicates are checked
        // separately from set membership.
        'a duplicate that pushes another out',
        [
          { requestId: 'request-1', whyThisMatches: 'a' },
          { requestId: 'request-1', whyThisMatches: 'again' },
        ],
      ],
      [
        'a substituted id',
        [
          { requestId: 'request-1', whyThisMatches: 'a' },
          { requestId: 'request-3', whyThisMatches: 'never sent' },
        ],
      ],
    ])('%s', async (_case, matches) => {
      respond({ matches, metadata });

      await expect(client.rank(input)).rejects.toMatchObject({
        code: 'AI_MATCHING_RANK_INVALID_RESPONSE',
        statusCode: 502,
      } satisfies Partial<ApplicationError>);
    });
  });

  describe('rejects anything a contributor must not read', () => {
    it('a narrative containing a percentage', async () => {
      respond({
        matches: [
          { requestId: 'request-1', whyThisMatches: 'A 92% match.' },
          { requestId: 'request-2', whyThisMatches: 'b' },
        ],
        metadata,
      });

      await expect(client.rank(input)).rejects.toMatchObject({
        code: 'AI_MATCHING_RANK_INVALID_RESPONSE',
      });
    });

    it('an unbounded narrative', async () => {
      respond({
        matches: [
          { requestId: 'request-1', whyThisMatches: 'x'.repeat(301) },
          { requestId: 'request-2', whyThisMatches: 'b' },
        ],
        metadata,
      });

      await expect(client.rank(input)).rejects.toMatchObject({
        code: 'AI_MATCHING_RANK_INVALID_RESPONSE',
      });
    });

    it('a blank narrative', async () => {
      respond({
        matches: [
          { requestId: 'request-1', whyThisMatches: '   ' },
          { requestId: 'request-2', whyThisMatches: 'b' },
        ],
        metadata,
      });

      await expect(client.rank(input)).rejects.toMatchObject({
        code: 'AI_MATCHING_RANK_INVALID_RESPONSE',
      });
    });
  });

  describe('transport failures', () => {
    it('maps a non-ok response to a retriable service error', async () => {
      respond({}, false);

      await expect(client.rank(input)).rejects.toMatchObject({
        code: 'AI_MATCHING_RANK_SERVICE_ERROR',
        statusCode: 502,
      });
    });

    it('maps an unreachable service to unavailable', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

      await expect(client.rank(input)).rejects.toMatchObject({
        code: 'AI_MATCHING_RANK_SERVICE_UNAVAILABLE',
        statusCode: 502,
      });
    });

    it('maps a malformed body to an invalid response', async () => {
      respond({ matches: 'not-an-array', metadata });

      await expect(client.rank(input)).rejects.toMatchObject({
        code: 'AI_MATCHING_RANK_INVALID_RESPONSE',
      });
    });
  });
});
