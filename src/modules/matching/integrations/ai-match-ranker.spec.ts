import { ConfigService } from '@nestjs/config';

import { AiMatchRanker } from './ai-match-ranker';
import type { ShortlistedMatch } from '../matching.service';

describe('AiMatchRanker', () => {
  const ai = { rankMatches: jest.fn() };

  function config(enabled: boolean) {
    return {
      get: (key: string, fallback: unknown) =>
        key === 'MATCH_RANKER_ENABLED' ? enabled : fallback,
    } as unknown as ConfigService;
  }

  function match(id: string, rank: number): ShortlistedMatch {
    return {
      request: {
        id,
        projectId: 'project-1',
        projectName: 'Share-k API',
        ownerId: 'owner-1',
        title: `Request ${id}`,
        technologyTags: ['NestJS'],
        requirementTexts: ['Write tested services.'],
        skillRequirements: [],
        difficulty: 'intermediate',
        applicationsCloseAt: new Date('2026-09-01T00:00:00.000Z'),
        targetCompletionDate: null,
        reward: null,
        rewardCurrency: null,
        publishedAt: new Date('2026-08-10T00:00:00.000Z'),
      },
      rank,
      matchedSkills: [
        { name: 'NestJS', proficiency: 'advanced', evidenceIds: ['e1'] },
      ],
      exceededSkills: [],
      requiredSkillNames: ['NestJS'],
      matchedRequiredSkillNames: ['NestJS'],
      matchedRequiredCount: 1,
      requiredSkillCount: 1,
      confidence: 'HIGH',
    };
  }

  const shortlist = [match('request-1', 1), match('request-2', 2)];

  function build(enabled = true) {
    return new AiMatchRanker(ai as never, config(enabled));
  }

  beforeEach(() => jest.resetAllMocks());

  describe('when the flag is off', () => {
    it('calls nothing and keeps the deterministic order', async () => {
      await expect(
        build(false).rerank({ contributorId: 'c1', matches: shortlist }),
      ).resolves.toBe(shortlist);

      expect(ai.rankMatches).not.toHaveBeenCalled();
    });
  });

  describe('when there is nothing to reorder', () => {
    it('does not spend a model call on a single match', async () => {
      const single = [match('request-1', 1)];

      await expect(
        build().rerank({ contributorId: 'c1', matches: single }),
      ).resolves.toBe(single);
      expect(ai.rankMatches).not.toHaveBeenCalled();
    });
  });

  describe('when the agent answers', () => {
    it('applies the returned order', async () => {
      ai.rankMatches.mockResolvedValue({
        matches: [
          { requestId: 'request-2', whyThisMatches: 'Closer to your skills.' },
          { requestId: 'request-1', whyThisMatches: 'Also a fit.' },
        ],
        provider: 'groq',
        model: 'test',
        promptVersion: 'matching-rank-v1',
        schemaVersion: 'matching-rank-v1',
        serviceVersion: '0.1.0',
      });

      const result = await build().rerank({
        contributorId: 'c1',
        matches: shortlist,
      });

      expect(result.map((entry) => entry.request.id)).toEqual([
        'request-2',
        'request-1',
      ]);
      expect(result.map((entry) => entry.rankerJustification)).toEqual([
        'Closer to your skills.',
        'Also a fit.',
      ]);
    });

    it('sends no contributor identity', async () => {
      ai.rankMatches.mockResolvedValue({
        matches: [
          { requestId: 'request-1', whyThisMatches: 'a' },
          { requestId: 'request-2', whyThisMatches: 'b' },
        ],
        provider: 'groq',
        model: 'test',
        promptVersion: 'matching-rank-v1',
        schemaVersion: 'matching-rank-v1',
        serviceVersion: '0.1.0',
      });

      await build().rerank({
        contributorId: 'contributor-secret-id',
        matches: shortlist,
      });

      const sent = JSON.stringify(ai.rankMatches.mock.calls[0][0]);
      expect(sent).not.toContain('contributor-secret-id');
      expect(sent).not.toContain('evidenceIds');
    });
  });

  describe('every failure keeps the deterministic order', () => {
    it.each([
      ['the service is unreachable', new Error('ECONNREFUSED')],
      ['the service returns an error', new Error('502')],
    ])('%s', async (_case, error) => {
      ai.rankMatches.mockRejectedValue(error);

      await expect(
        build().rerank({ contributorId: 'c1', matches: shortlist }),
      ).resolves.toBe(shortlist);
    });

    it('the agent returns a short list', async () => {
      // Defence in depth: the client already refuses a non-permutation and the
      // caller refuses one again. If either check were relaxed, this stops a
      // truncated list quietly replacing a complete one.
      ai.rankMatches.mockResolvedValue({
        matches: [{ requestId: 'request-1', whyThisMatches: 'only one' }],
        provider: 'groq',
        model: 'test',
        promptVersion: 'matching-rank-v1',
        schemaVersion: 'matching-rank-v1',
        serviceVersion: '0.1.0',
      });

      await expect(
        build().rerank({ contributorId: 'c1', matches: shortlist }),
      ).resolves.toBe(shortlist);
    });

    it('the agent returns an id that was never sent', async () => {
      ai.rankMatches.mockResolvedValue({
        matches: [
          { requestId: 'request-1', whyThisMatches: 'a' },
          { requestId: 'request-99', whyThisMatches: 'invented' },
        ],
        provider: 'groq',
        model: 'test',
        promptVersion: 'matching-rank-v1',
        schemaVersion: 'matching-rank-v1',
        serviceVersion: '0.1.0',
      });

      const result = await build().rerank({
        contributorId: 'c1',
        matches: shortlist,
      });

      // The unknown id maps to nothing and is dropped, which makes the list
      // short, which returns the deterministic order untouched.
      expect(result).toBe(shortlist);
    });
  });
});
