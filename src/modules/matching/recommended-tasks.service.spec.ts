import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { MatchingCandidateRequestDto } from '../contribution-tasks/dto/matching-candidate.dto';
import { MatchShortlist, ShortlistedMatch } from './matching.service';
import { RecommendedTasksService } from './recommended-tasks.service';

describe('RecommendedTasksService', () => {
  const contributor: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'contributor@example.com',
    role: 'contributor',
    status: 'active',
  };
  const now = new Date('2026-08-14T12:00:00.000Z');

  const matching = { shortlistForContributor: jest.fn() };
  const database = {
    aiMatchResult: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  };

  function request(
    overrides: Partial<MatchingCandidateRequestDto> = {},
  ): MatchingCandidateRequestDto {
    return {
      id: '33333333-3333-4333-8333-333333333331',
      projectId: '44444444-4444-4444-8444-444444444441',
      projectName: 'Share-k API',
      ownerId: '22222222-2222-4222-8222-222222222222',
      title: 'Build the ingestion worker',
      technologyTags: ['NestJS'],
      requirementTexts: ['Write tested services.'],
      skillRequirements: [],
      difficulty: 'intermediate',
      applicationsCloseAt: new Date('2026-09-01T00:00:00.000Z'),
      targetCompletionDate: new Date('2026-09-15T00:00:00.000Z'),
      reward: null,
      rewardCurrency: null,
      publishedAt: new Date('2026-08-10T00:00:00.000Z'),
      ...overrides,
    };
  }

  function match(overrides: Partial<ShortlistedMatch> = {}): ShortlistedMatch {
    return {
      request: request(),
      rank: 1,
      matchedSkills: [
        {
          name: 'NestJS',
          proficiency: 'advanced',
          evidenceIds: ['github:sharek/api'],
        },
      ],
      exceededSkills: [],
      confidence: 'HIGH',
      ...overrides,
    };
  }

  function goldShortlist(matches: ShortlistedMatch[]): MatchShortlist {
    return { planType: 'gold', matches, reason: null };
  }

  function build(ranker?: { rerank: jest.Mock }) {
    return new RecommendedTasksService(
      matching as never,
      database as never,
      ranker as never,
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) =>
        callback(database),
    );
    database.aiMatchResult.deleteMany.mockResolvedValue({ count: 0 });
    database.aiMatchResult.createMany.mockResolvedValue({ count: 1 });
    matching.shortlistForContributor.mockResolvedValue(
      goldShortlist([match()]),
    );
  });

  describe('entitlement gating', () => {
    it('gives a Gold contributor their matches', async () => {
      const response = await build().listForContributor(contributor, now);

      expect(response.planType).toBe('gold');
      expect(response.recommendations).toHaveLength(1);
      expect(response.reason).toBeNull();
    });

    it('gives a free contributor an empty list and a reason, not a 403', async () => {
      matching.shortlistForContributor.mockResolvedValue({
        planType: 'free',
        matches: [],
        reason: 'MATCHING_REQUIRES_SUBSCRIPTION',
      });

      await expect(
        build().listForContributor(contributor, now),
      ).resolves.toEqual({
        planType: 'free',
        recommendations: [],
        reason: 'MATCHING_REQUIRES_SUBSCRIPTION',
      });
      // Nothing is recorded for a contributor who was shown nothing.
      expect(database.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['an owner', { ...contributor, role: 'owner' as const }],
      ['a suspended contributor', { ...contributor, status: 'suspended' as const }],
    ])('refuses %s', async (_who, actor) => {
      await expect(
        build().listForContributor(actor as AuthenticatedUser, now),
      ).rejects.toMatchObject({
        code: 'CONTRIBUTOR_RECOMMENDATIONS_NOT_AUTHORIZED',
        statusCode: 403,
      });
    });
  });

  describe('persistence', () => {
    it('records rank and matched skills for what the contributor was shown', async () => {
      matching.shortlistForContributor.mockResolvedValue(
        goldShortlist([
          match({ request: request({ id: '33333333-3333-4333-8333-333333333331' }) }),
          match({
            request: request({ id: '33333333-3333-4333-8333-333333333332' }),
            confidence: 'MEDIUM',
          }),
        ]),
      );

      await build().listForContributor(contributor, now);

      expect(database.aiMatchResult.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            contribution_request_id: '33333333-3333-4333-8333-333333333331',
            contributor_id: contributor.id,
            rank: 1,
            matched_skills: [
              expect.objectContaining({ name: 'NestJS', proficiency: 'advanced' }),
            ],
          }),
          expect.objectContaining({
            contribution_request_id: '33333333-3333-4333-8333-333333333332',
            rank: 2,
          }),
        ],
      });
    });

    it('replaces the previous results rather than accumulating them', async () => {
      await build().listForContributor(contributor, now);

      expect(database.aiMatchResult.deleteMany).toHaveBeenCalledWith({
        where: { contributor_id: contributor.id },
      });
      // One transaction, so a failure cannot leave the contributor with the
      // delete applied and no rows written.
      expect(database.$transaction).toHaveBeenCalledTimes(1);
      const deleteOrder =
        database.aiMatchResult.deleteMany.mock.invocationCallOrder[0];
      const createOrder =
        database.aiMatchResult.createMany.mock.invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(createOrder);
    });

    it('never writes a notification_sent flag, dropped with the column', async () => {
      await build().listForContributor(contributor, now);

      const [call] = database.aiMatchResult.createMany.mock.calls[0] as [
        { data: Record<string, unknown>[] },
      ];
      for (const row of call.data) {
        expect(row).not.toHaveProperty('notification_sent');
      }
    });
  });

  describe('AI ranking', () => {
    it('uses the deterministic order when no ranker is bound', async () => {
      const response = await build().listForContributor(contributor, now);

      expect(response.recommendations[0].requestId).toBe(
        '33333333-3333-4333-8333-333333333331',
      );
    });

    it('degrades to the deterministic order when the ranker throws', async () => {
      const ranker = {
        rerank: jest.fn().mockRejectedValue(new Error('provider unavailable')),
      };
      matching.shortlistForContributor.mockResolvedValue(
        goldShortlist([
          match({ request: request({ id: '33333333-3333-4333-8333-333333333331' }) }),
          match({ request: request({ id: '33333333-3333-4333-8333-333333333332' }) }),
        ]),
      );

      const response = await build(ranker).listForContributor(contributor, now);

      expect(response.recommendations.map((entry) => entry.requestId)).toEqual([
        '33333333-3333-4333-8333-333333333331',
        '33333333-3333-4333-8333-333333333332',
      ]);
    });

    it('accepts a reordering', async () => {
      const first = match({
        request: request({ id: '33333333-3333-4333-8333-333333333331' }),
      });
      const second = match({
        request: request({ id: '33333333-3333-4333-8333-333333333332' }),
      });
      matching.shortlistForContributor.mockResolvedValue(
        goldShortlist([first, second]),
      );
      const ranker = { rerank: jest.fn().mockResolvedValue([second, first]) };

      const response = await build(ranker).listForContributor(contributor, now);

      expect(response.recommendations.map((entry) => entry.requestId)).toEqual([
        '33333333-3333-4333-8333-333333333332',
        '33333333-3333-4333-8333-333333333331',
      ]);
      expect(response.recommendations.map((entry) => entry.rank)).toEqual([1, 2]);
    });

    it('ignores ranker edits to server-authored match facts', async () => {
      const first = match({
        request: request({ id: '33333333-3333-4333-8333-333333333331' }),
      });
      const second = match({
        request: request({ id: '33333333-3333-4333-8333-333333333332' }),
      });
      matching.shortlistForContributor.mockResolvedValue(
        goldShortlist([first, second]),
      );
      const ranker = {
        rerank: jest.fn().mockResolvedValue([
          {
            ...second,
            matchedSkills: [],
            confidence: 'LOW',
            request: { ...second.request, title: 'tampered' },
          },
          {
            ...first,
            matchedSkills: [],
            confidence: 'LOW',
            request: { ...first.request, title: 'tampered' },
          },
        ]),
      };

      const response = await build(ranker).listForContributor(contributor, now);

      expect(response.recommendations).toEqual([
        expect.objectContaining({
          requestId: second.request.id,
          title: second.request.title,
          confidence: second.confidence,
          matchedSkills: second.matchedSkills,
        }),
        expect.objectContaining({
          requestId: first.request.id,
          title: first.request.title,
          confidence: first.confidence,
          matchedSkills: first.matchedSkills,
        }),
      ]);
    });

    it('refuses a ranker that adds a Request the exclusions rejected', async () => {
      const original = match();
      matching.shortlistForContributor.mockResolvedValue(
        goldShortlist([original]),
      );
      const ranker = {
        rerank: jest.fn().mockResolvedValue([
          original,
          match({
            request: request({ id: '99999999-9999-4999-8999-999999999999' }),
          }),
        ]),
      };

      const response = await build(ranker).listForContributor(contributor, now);

      expect(response.recommendations.map((entry) => entry.requestId)).toEqual([
        '33333333-3333-4333-8333-333333333331',
      ]);
    });

    it('refuses a ranker that drops a Request', async () => {
      matching.shortlistForContributor.mockResolvedValue(
        goldShortlist([
          match({ request: request({ id: '33333333-3333-4333-8333-333333333331' }) }),
          match({ request: request({ id: '33333333-3333-4333-8333-333333333332' }) }),
        ]),
      );
      const ranker = { rerank: jest.fn().mockResolvedValue([match()]) };

      const response = await build(ranker).listForContributor(contributor, now);

      expect(response.recommendations).toHaveLength(2);
    });
  });

  describe('the contract a contributor sees', () => {
    it('carries no matchScore and no percentage', async () => {
      const response = await build().listForContributor(contributor, now);

      const serialized = JSON.stringify(response);
      expect(serialized).not.toContain('matchScore');
      expect(serialized).not.toContain('match_score');
      expect(serialized).not.toContain('%');
    });

    it('explains itself with skills rather than a number', async () => {
      matching.shortlistForContributor.mockResolvedValue(
        goldShortlist([
          match({
            matchedSkills: [
              { name: 'NestJS', proficiency: 'advanced', evidenceIds: [] },
              { name: 'PostgreSQL', proficiency: 'intermediate', evidenceIds: [] },
            ],
            exceededSkills: [
              { name: 'Kubernetes', proficiency: 'beginner', evidenceIds: [] },
            ],
          }),
        ]),
      );

      const response = await build().listForContributor(contributor, now);

      expect(response.recommendations[0].justification).toBe(
        'Your approved NestJS and PostgreSQL match what this request asks for. You also bring Kubernetes.',
      );
    });

    it('serializes dates as ISO strings the UI can format', async () => {
      const response = await build().listForContributor(contributor, now);

      expect(response.recommendations[0].applicationsCloseAt).toBe(
        '2026-09-01T00:00:00.000Z',
      );
      expect(response.recommendations[0].targetCompletionDate).toBe(
        '2026-09-15T00:00:00.000Z',
      );
    });

    it('leaves an absent target completion date null rather than inventing one', async () => {
      matching.shortlistForContributor.mockResolvedValue(
        goldShortlist([
          match({ request: request({ targetCompletionDate: null }) }),
        ]),
      );

      const response = await build().listForContributor(contributor, now);

      expect(response.recommendations[0].targetCompletionDate).toBeNull();
    });
  });
});
