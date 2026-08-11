import { ReputationService } from './reputation.service';

describe('ReputationService', () => {
  const lastUpdatedAt = new Date('2026-08-11T16:00:00.000Z');
  const database = {
    reputationRecord: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const service = new ReputationService(database as never);

  beforeEach(() => jest.resetAllMocks());

  it('returns a complete empty summary before the first projection', async () => {
    database.reputationRecord.findUnique.mockResolvedValue(null);

    await expect(
      service.getSummaryForUser('11111111-1111-4111-8111-111111111111'),
    ).resolves.toEqual({
      rating: null,
      reviewsCount: 0,
      completedContributions: 0,
      totalAssignedTasks: 0,
      successRate: 0,
      topVerifiedSkills: [],
    });
  });

  it('replaces the projection from authoritative assignment and approved-delivery facts', async () => {
    database.reputationRecord.upsert.mockResolvedValue({
      overall_rating: 4,
      total_contributions: 4,
      successful_contributions: 2,
      success_rate: 50,
      top_verified_skills: [
        { name: 'React', verifiedContributionCount: 2 },
        { name: 'NestJS', verifiedContributionCount: 1 },
        { name: 'TypeScript', verifiedContributionCount: 1 },
      ],
      total_ratings_received: 2,
    });

    await expect(
      service.replaceProjection({
        contributorId: '11111111-1111-4111-8111-111111111111',
        totalAssignedTasks: 4,
        approvedDeliveries: [
          {
            rating: 5,
            technologyTags: ['TypeScript', 'React', ' react '],
          },
          {
            rating: 3,
            technologyTags: ['React', 'NestJS'],
          },
        ],
        lastUpdatedAt,
      }),
    ).resolves.toEqual({
      rating: 4,
      reviewsCount: 2,
      completedContributions: 2,
      totalAssignedTasks: 4,
      successRate: 50,
      topVerifiedSkills: [
        { name: 'React', verifiedContributionCount: 2 },
        { name: 'NestJS', verifiedContributionCount: 1 },
        { name: 'TypeScript', verifiedContributionCount: 1 },
      ],
    });

    expect(database.reputationRecord.upsert).toHaveBeenCalledWith({
      where: { user_id: '11111111-1111-4111-8111-111111111111' },
      create: {
        user_id: '11111111-1111-4111-8111-111111111111',
        overall_rating: 4,
        total_contributions: 4,
        successful_contributions: 2,
        success_rate: 50,
        top_verified_skills: [
          { name: 'React', verifiedContributionCount: 2 },
          { name: 'NestJS', verifiedContributionCount: 1 },
          { name: 'TypeScript', verifiedContributionCount: 1 },
        ],
        total_ratings_received: 2,
        last_updated_at: lastUpdatedAt,
      },
      update: {
        overall_rating: 4,
        total_contributions: 4,
        successful_contributions: 2,
        success_rate: 50,
        top_verified_skills: [
          { name: 'React', verifiedContributionCount: 2 },
          { name: 'NestJS', verifiedContributionCount: 1 },
          { name: 'TypeScript', verifiedContributionCount: 1 },
        ],
        total_ratings_received: 2,
        last_updated_at: lastUpdatedAt,
      },
      select: {
        overall_rating: true,
        total_contributions: true,
        successful_contributions: true,
        success_rate: true,
        top_verified_skills: true,
        total_ratings_received: true,
      },
    });
  });

  it('keeps unapproved assignments out of completed reputation metrics', async () => {
    database.reputationRecord.upsert.mockResolvedValue({
      overall_rating: null,
      total_contributions: 2,
      successful_contributions: 0,
      success_rate: 0,
      top_verified_skills: [],
      total_ratings_received: 0,
    });

    await expect(
      service.replaceProjection({
        contributorId: '11111111-1111-4111-8111-111111111111',
        totalAssignedTasks: 2,
        approvedDeliveries: [],
        lastUpdatedAt,
      }),
    ).resolves.toEqual({
      rating: null,
      reviewsCount: 0,
      completedContributions: 0,
      totalAssignedTasks: 2,
      successRate: 0,
      topVerifiedSkills: [],
    });
  });
});
