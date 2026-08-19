import {
  ContributionRequestRequirementKind,
  SubscriptionPlanType,
} from '@prisma/client';

import { MatchingCandidateRequestDto } from '../contribution-tasks/dto/matching-candidate.dto';
import { MatchingService } from './matching.service';

describe('MatchingService', () => {
  const contributorId = '11111111-1111-4111-8111-111111111111';
  const ownerId = '22222222-2222-4222-8222-222222222222';
  const now = new Date('2026-08-14T12:00:00.000Z');

  const entitlements = { resolveForContributor: jest.fn() };
  const skillProfiles = { listApprovedSkillsForEligibility: jest.fn() };
  const contributionTasks = { listOpenRequestsForMatching: jest.fn() };
  const applications = { listAppliedContributionRequestIds: jest.fn() };
  const reputation = { listSummariesForUsers: jest.fn() };

  const service = new MatchingService(
    entitlements as never,
    skillProfiles as never,
    contributionTasks as never,
    applications as never,
    reputation as never,
  );

  function candidate(
    overrides: Partial<MatchingCandidateRequestDto> = {},
  ): MatchingCandidateRequestDto {
    return {
      id: '33333333-3333-4333-8333-333333333331',
      projectId: '44444444-4444-4444-8444-444444444441',
      projectName: 'Share-k API',
      ownerId,
      title: 'Build the NestJS ingestion worker',
      technologyTags: ['NestJS', 'PostgreSQL'],
      requirementTexts: ['Write tested NestJS services.'],
      skillRequirements: [],
      difficulty: 'intermediate',
      applicationsCloseAt: new Date('2026-09-01T00:00:00.000Z'),
      targetCompletionDate: null,
      reward: null,
      rewardCurrency: null,
      publishedAt: new Date('2026-08-10T00:00:00.000Z'),
      ...overrides,
    };
  }

  function goldPlan() {
    return {
      roleContext: 'contributor' as const,
      planType: SubscriptionPlanType.gold,
      status: 'active',
      source: 'payment_provider',
      periodStart: null,
      periodEnd: null,
      dailyApplicationLimit: 5,
      matchedProjectLimit: 10,
      commissionRate: 0,
    };
  }

  function freePlan() {
    return {
      ...goldPlan(),
      planType: SubscriptionPlanType.free,
      dailyApplicationLimit: 1,
      matchedProjectLimit: 0,
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    entitlements.resolveForContributor.mockResolvedValue(goldPlan());
    skillProfiles.listApprovedSkillsForEligibility.mockResolvedValue([
      {
        name: 'NestJS',
        proficiencyLevel: 'advanced',
        evidenceSources: { evidenceIds: ['github:sharek/api'], limitations: [] },
      },
      { name: 'PostgreSQL', proficiencyLevel: 'intermediate', evidenceSources: null },
    ]);
    contributionTasks.listOpenRequestsForMatching.mockResolvedValue([
      candidate(),
    ]);
    applications.listAppliedContributionRequestIds.mockResolvedValue([]);
    reputation.listSummariesForUsers.mockResolvedValue(new Map());
  });

  describe('entitlement', () => {
    it('gives a free contributor an empty set and a reason, not a refusal', async () => {
      entitlements.resolveForContributor.mockResolvedValue(freePlan());

      await expect(
        service.shortlistForContributor({ contributorId, now }),
      ).resolves.toEqual({
        planType: 'free',
        matches: [],
        reason: 'MATCHING_REQUIRES_SUBSCRIPTION',
      });
      // Nothing is even read: the entitlement decision comes first.
      expect(
        contributionTasks.listOpenRequestsForMatching,
      ).not.toHaveBeenCalled();
    });

    it('gives a Gold contributor up to their matched-project cap', async () => {
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue(
        Array.from({ length: 25 }, (_unused, index) =>
          candidate({
            id: `33333333-3333-4333-8333-3333333333${String(index).padStart(2, '0')}`,
            publishedAt: new Date(Date.UTC(2026, 7, 1, 0, 0, index)),
          }),
        ),
      );

      const shortlist = await service.shortlistForContributor({
        contributorId,
        now,
      });

      expect(shortlist.planType).toBe('gold');
      expect(shortlist.matches).toHaveLength(10);
      expect(shortlist.matches.map((match) => match.rank)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ]);
    });

    it('caps at the entitlement, not at a constant', async () => {
      entitlements.resolveForContributor.mockResolvedValue({
        ...goldPlan(),
        matchedProjectLimit: 3,
      });
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue(
        Array.from({ length: 8 }, (_unused, index) =>
          candidate({
            id: `33333333-3333-4333-8333-3333333333${String(index).padStart(2, '0')}`,
          }),
        ),
      );

      const shortlist = await service.shortlistForContributor({
        contributorId,
        now,
      });

      expect(shortlist.matches).toHaveLength(3);
    });
  });

  describe('exclusions', () => {
    it('excludes a Request the contributor already applied to', async () => {
      applications.listAppliedContributionRequestIds.mockResolvedValue([
        candidate().id,
      ]);

      await expect(
        service.shortlistForContributor({ contributorId, now }),
      ).resolves.toMatchObject({
        matches: [],
        reason: 'NO_MATCHING_REQUESTS',
      });
    });

    it("excludes the contributor's own Requests by asking for them to be left out", async () => {
      await service.shortlistForContributor({ contributorId, now });

      expect(contributionTasks.listOpenRequestsForMatching).toHaveBeenCalledWith(
        expect.objectContaining({ excludeOwnerId: contributorId }),
      );
    });

    it('excludes closed and terminal Requests by passing the clock to the owning module', async () => {
      await service.shortlistForContributor({ contributorId, now });

      // Publication state and the applications window belong to
      // contribution-tasks, so the filter is applied there rather than
      // re-derived from rows this module has no business reading.
      expect(contributionTasks.listOpenRequestsForMatching).toHaveBeenCalledWith(
        expect.objectContaining({ now }),
      );
    });

    it('excludes Requests that match none of the approved skills', async () => {
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue([
        candidate({
          technologyTags: ['Rust', 'WASM'],
          requirementTexts: ['Systems programming experience.'],
        }),
      ]);

      await expect(
        service.shortlistForContributor({ contributorId, now }),
      ).resolves.toMatchObject({
        matches: [],
        reason: 'NO_MATCHING_REQUESTS',
      });
    });

    it('uses the frozen required levels and excludes an under-levelled contributor', async () => {
      skillProfiles.listApprovedSkillsForEligibility.mockResolvedValue([
        {
          name: 'React',
          proficiencyLevel: 'intermediate',
          evidenceSources: null,
        },
      ]);
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue([
        candidate({
          technologyTags: ['React'],
          skillRequirements: [
            {
              skillName: 'React',
              skillNameNormalized: 'react',
              requiredLevel: 'advanced',
              kind: ContributionRequestRequirementKind.required,
            },
          ],
        }),
      ]);

      await expect(
        service.shortlistForContributor({ contributorId, now }),
      ).resolves.toMatchObject({
        matches: [],
        reason: 'NO_MATCHING_REQUESTS',
      });
    });

    it('accepts an exact frozen required level and keeps preferred rows advisory', async () => {
      skillProfiles.listApprovedSkillsForEligibility.mockResolvedValue([
        {
          name: 'React',
          proficiencyLevel: 'advanced',
          evidenceSources: null,
        },
      ]);
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue([
        candidate({
          technologyTags: ['React'],
          skillRequirements: [
            {
              skillName: 'React',
              skillNameNormalized: 'react',
              requiredLevel: 'advanced',
              kind: ContributionRequestRequirementKind.required,
            },
            {
              skillName: 'PostgreSQL',
              skillNameNormalized: 'postgresql',
              requiredLevel: 'beginner',
              kind: ContributionRequestRequirementKind.preferred,
            },
          ],
        }),
      ]);

      await expect(
        service.shortlistForContributor({ contributorId, now }),
      ).resolves.toMatchObject({
        matches: [
          {
            matchedSkills: [{ name: 'React', proficiency: 'advanced' }],
          },
        ],
        reason: null,
      });
    });

    it('excludes every skill that is not approved, by reading only the approved list', async () => {
      skillProfiles.listApprovedSkillsForEligibility.mockResolvedValue([]);

      await expect(
        service.shortlistForContributor({ contributorId, now }),
      ).resolves.toMatchObject({
        matches: [],
        reason: 'NO_APPROVED_SKILLS',
      });
      expect(
        skillProfiles.listApprovedSkillsForEligibility,
      ).toHaveBeenCalledWith(contributorId);
    });

    it('bounds the candidate set rather than reading every open Request', async () => {
      await service.shortlistForContributor({ contributorId, now });

      const [call] = contributionTasks.listOpenRequestsForMatching.mock
        .calls[0] as [{ limit: number }];
      expect(call.limit).toBeGreaterThan(10);
      expect(Number.isFinite(call.limit)).toBe(true);
    });
  });

  describe('ranking', () => {
    it('orders by coverage before anything else', async () => {
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue([
        candidate({
          id: '33333333-3333-4333-8333-333333333301',
          technologyTags: ['NestJS', 'PostgreSQL', 'Kubernetes', 'Terraform'],
          publishedAt: new Date('2026-08-13T00:00:00.000Z'),
        }),
        candidate({
          id: '33333333-3333-4333-8333-333333333302',
          technologyTags: ['NestJS', 'PostgreSQL'],
          publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        }),
      ]);

      const shortlist = await service.shortlistForContributor({
        contributorId,
        now,
      });

      // Full coverage wins despite being the older publication.
      expect(shortlist.matches[0].request.id).toBe(
        '33333333-3333-4333-8333-333333333302',
      );
      expect(shortlist.matches[0].confidence).toBe('HIGH');
      expect(shortlist.matches[1].confidence).toBe('MEDIUM');
    });

    it('breaks equal coverage with the owner reputation', async () => {
      const wellRatedOwner = '22222222-2222-4222-8222-222222222299';
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue([
        candidate({ id: '33333333-3333-4333-8333-333333333301' }),
        candidate({
          id: '33333333-3333-4333-8333-333333333302',
          ownerId: wellRatedOwner,
        }),
      ]);
      reputation.listSummariesForUsers.mockResolvedValue(
        new Map([
          [ownerId, { rating: 3.1 }],
          [wellRatedOwner, { rating: 4.8 }],
        ]),
      );

      const shortlist = await service.shortlistForContributor({
        contributorId,
        now,
      });

      expect(shortlist.matches[0].request.ownerId).toBe(wellRatedOwner);
    });

    it('breaks equal coverage and reputation with recency', async () => {
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue([
        candidate({
          id: '33333333-3333-4333-8333-333333333301',
          publishedAt: new Date('2026-08-01T00:00:00.000Z'),
        }),
        candidate({
          id: '33333333-3333-4333-8333-333333333302',
          publishedAt: new Date('2026-08-13T00:00:00.000Z'),
        }),
      ]);

      const shortlist = await service.shortlistForContributor({
        contributorId,
        now,
      });

      expect(shortlist.matches[0].request.id).toBe(
        '33333333-3333-4333-8333-333333333302',
      );
    });

    it('breaks a total tie with the id, so the order is never arbitrary', async () => {
      const sameInstant = new Date('2026-08-13T00:00:00.000Z');
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue([
        candidate({
          id: '33333333-3333-4333-8333-333333333309',
          publishedAt: sameInstant,
        }),
        candidate({
          id: '33333333-3333-4333-8333-333333333301',
          publishedAt: sameInstant,
        }),
      ]);

      const shortlist = await service.shortlistForContributor({
        contributorId,
        now,
      });

      expect(shortlist.matches.map((match) => match.request.id)).toEqual([
        '33333333-3333-4333-8333-333333333301',
        '33333333-3333-4333-8333-333333333309',
      ]);
    });

    it('returns an identical order on repeated calls over identical data', async () => {
      const sameInstant = new Date('2026-08-13T00:00:00.000Z');
      const rows = Array.from({ length: 12 }, (_unused, index) =>
        candidate({
          id: `33333333-3333-4333-8333-3333333333${String(index).padStart(2, '0')}`,
          // Deliberately identical on every ranking key except the id, so the
          // only thing that can make the order stable is the id tie-break.
          publishedAt: sameInstant,
        }),
      );
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue(rows);

      const first = await service.shortlistForContributor({
        contributorId,
        now,
      });
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue(
        [...rows].reverse(),
      );
      const second = await service.shortlistForContributor({
        contributorId,
        now,
      });

      expect(second.matches.map((match) => match.request.id)).toEqual(
        first.matches.map((match) => match.request.id),
      );
    });
  });

  describe('the reason a match was made', () => {
    it('names the skills matched and the skills brought beyond the ask', async () => {
      skillProfiles.listApprovedSkillsForEligibility.mockResolvedValue([
        {
          name: 'NestJS',
          proficiencyLevel: 'advanced',
          evidenceSources: { evidenceIds: ['github:sharek/api'] },
        },
        { name: 'Kubernetes', proficiencyLevel: 'beginner', evidenceSources: null },
      ]);
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue([
        candidate({ technologyTags: ['NestJS'], requirementTexts: [] }),
      ]);

      const shortlist = await service.shortlistForContributor({
        contributorId,
        now,
      });

      expect(shortlist.matches[0]).toMatchObject({
        matchedSkills: [
          {
            name: 'NestJS',
            proficiency: 'advanced',
            // The approval's evidence travels with the match, so a
            // recommendation can cite why the platform believes the skill.
            evidenceIds: ['github:sharek/api'],
          },
        ],
        exceededSkills: [
          { name: 'Kubernetes', proficiency: 'beginner', evidenceIds: [] },
        ],
      });
    });

    it('counts the required bar, not the skills the contributor happens to bring', async () => {
      // Two required, one preferred. The contributor covers both required rows
      // and the preferred one, so `matchedSkills` holds three entries while the
      // gauge must still read 2 of 2 -- a numerator taken from `matchedSkills`
      // would render 3/2.
      skillProfiles.listApprovedSkillsForEligibility.mockResolvedValue([
        { name: 'NestJS', proficiencyLevel: 'advanced', evidenceSources: null },
        { name: 'PostgreSQL', proficiencyLevel: 'advanced', evidenceSources: null },
        { name: 'Redis', proficiencyLevel: 'advanced', evidenceSources: null },
      ]);
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue([
        candidate({
          skillRequirements: [
            { skillName: 'NestJS', skillNameNormalized: 'nestjs', requiredLevel: 'intermediate', kind: 'required' },
            { skillName: 'PostgreSQL', skillNameNormalized: 'postgresql', requiredLevel: 'beginner', kind: 'required' },
            { skillName: 'Redis', skillNameNormalized: 'redis', requiredLevel: 'beginner', kind: 'preferred' },
          ] as never,
        }),
      ]);

      const shortlist = await service.shortlistForContributor({
        contributorId,
        now,
      });

      expect(shortlist.matches[0].matchedSkills).toHaveLength(3);
      expect(shortlist.matches[0]).toMatchObject({
        matchedRequiredCount: 2,
        requiredSkillCount: 2,
        // The owner's display form, not the normalized comparison key, and
        // preferred rows are not part of the bar being counted.
        requiredSkillNames: ['NestJS', 'PostgreSQL'],
      });
    });

    it('reports an incomplete bar as incomplete rather than as a full one', async () => {
      // A preferred skill met, a required one missed. The match is ineligible
      // under the Phase 0 bar, which is itself the assertion: a partial fit is
      // never shown as a match at all, so the gauge can never be asked to draw
      // one it would round up to full.
      skillProfiles.listApprovedSkillsForEligibility.mockResolvedValue([
        { name: 'Redis', proficiencyLevel: 'advanced', evidenceSources: null },
      ]);
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue([
        candidate({
          skillRequirements: [
            { skillName: 'NestJS', skillNameNormalized: 'nestjs', requiredLevel: 'advanced', kind: 'required' },
            { skillName: 'Redis', skillNameNormalized: 'redis', requiredLevel: 'beginner', kind: 'preferred' },
          ] as never,
        }),
      ]);

      const shortlist = await service.shortlistForContributor({
        contributorId,
        now,
      });

      expect(shortlist.matches).toHaveLength(0);
      expect(shortlist.reason).toBe('NO_MATCHING_REQUESTS');
    });

    it('falls back to technology tags for a legacy Request with no frozen bar', async () => {
      skillProfiles.listApprovedSkillsForEligibility.mockResolvedValue([
        { name: 'NestJS', proficiencyLevel: 'advanced', evidenceSources: null },
      ]);
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue([
        candidate({ skillRequirements: [], technologyTags: ['NestJS', 'PostgreSQL'] }),
      ]);

      const shortlist = await service.shortlistForContributor({
        contributorId,
        now,
      });

      expect(shortlist.matches[0]).toMatchObject({
        requiredSkillNames: ['NestJS', 'PostgreSQL'],
        matchedRequiredCount: 1,
        requiredSkillCount: 2,
      });
    });

    it('carries no score and no percentage, only an ordinal and a band', async () => {
      const shortlist = await service.shortlistForContributor({
        contributorId,
        now,
      });

      const serialized = JSON.stringify(shortlist);
      expect(serialized).not.toContain('matchScore');
      expect(serialized).not.toContain('coverage');
      expect(serialized).not.toContain('%');
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(
        shortlist.matches[0].confidence,
      );
    });
  });

  describe('owner-side matching', () => {
    // The owner-facing matching UI was removed on 2026-08-14 and must not come
    // back. This asserts the absence structurally rather than by convention.
    it('exposes no method that takes a Request and returns contributors', () => {
      const methods = Object.getOwnPropertyNames(
        Object.getPrototypeOf(service),
      );

      expect(methods).toEqual(
        expect.arrayContaining(['shortlistForContributor']),
      );
      for (const method of methods) {
        expect(method.toLowerCase()).not.toContain('owner');
        expect(method.toLowerCase()).not.toContain('invite');
      }
    });
  });

  describe('performance', () => {
    // NFR-008 budgets **one match request** under 3 seconds at P95. The reads
    // are mocked, so this measures the ranking itself — the part that grows
    // with the platform — over 1000 Requests, repeated for 500 contributors so
    // the P95 is taken from a real distribution rather than a single sample.
    it('ranks 1000 Requests for 500 contributors inside the budget', async () => {
      const rows = Array.from({ length: 1000 }, (_unused, index) =>
        candidate({
          id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
          ownerId: `22222222-2222-4222-8222-${String(index % 50).padStart(12, '0')}`,
          technologyTags:
            index % 3 === 0
              ? ['NestJS', 'PostgreSQL']
              : ['NestJS', 'Redis', 'Kubernetes'],
          publishedAt: new Date(Date.UTC(2026, 7, 1) + index * 1000),
        }),
      );
      contributionTasks.listOpenRequestsForMatching.mockResolvedValue(rows);

      const durations: number[] = [];
      for (let contributor = 0; contributor < 500; contributor += 1) {
        const startedAt = performance.now();
        await service.shortlistForContributor({
          contributorId: `11111111-1111-4111-8111-${String(contributor).padStart(12, '0')}`,
          now,
        });
        durations.push(performance.now() - startedAt);
      }

      durations.sort((left, right) => left - right);
      const p95 = durations[Math.floor(durations.length * 0.95)];
      expect(p95).toBeLessThan(3000);
      // Far enough inside the budget that the assertion is about the algorithm
      // rather than about how loaded the machine happens to be.
      expect(p95).toBeLessThan(100);
    });
  });
});
