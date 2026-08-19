import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { ContributorDashboardService } from './contributor-dashboard.service';

describe('ContributorDashboardService matched projects', () => {
  const actor: AuthenticatedUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'contributor@example.com',
    role: 'contributor',
    status: 'active',
  };

  const database = {
    user: { findUniqueOrThrow: jest.fn() },
    gitHubAccount: { findUnique: jest.fn() },
    skillProfileGeneration: { findFirst: jest.fn() },
    skillProfile: { count: jest.fn() },
    notification: { count: jest.fn() },
    application: { count: jest.fn(), findMany: jest.fn() },
    delivery: { findMany: jest.fn() },
  };
  const recommendations = { listForContributor: jest.fn() };
  const reputation = { getSummaryForUser: jest.fn() };
  const subscriptions = { getPlanStatus: jest.fn() };

  const service = new ContributorDashboardService(
    database as never,
    recommendations as never,
    reputation as never,
    subscriptions as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    database.user.findUniqueOrThrow.mockResolvedValue({
      first_name: 'Sara',
      contributorProfile: { id: 'profile-1', fields: [{ field_id: 'field-1' }] },
    });
    database.gitHubAccount.findUnique.mockResolvedValue({ id: 'github-1' });
    database.skillProfileGeneration.findFirst.mockResolvedValue({
      status: 'completed',
    });
    database.skillProfile.count.mockResolvedValue(1);
    database.notification.count.mockResolvedValue(0);
    database.application.count.mockResolvedValue(0);
    database.application.findMany.mockResolvedValue([]);
    database.delivery.findMany.mockResolvedValue([]);
    reputation.getSummaryForUser.mockResolvedValue({
      rating: null,
      completedContributions: 0,
      successRate: null,
    });
    subscriptions.getPlanStatus.mockResolvedValue({
      plan: 'gold',
      usage: { used: 0, limit: 5 },
    });
    recommendations.listForContributor.mockResolvedValue({
      planType: 'gold',
      reason: null,
      recommendations: [
        {
          requestId: 'request-1',
          projectName: 'Share-k API',
          title: 'Build the ingestion worker',
          rank: 1,
          confidence: 'HIGH',
          justification: 'Your approved NodeJS matches what this request asks for.',
          matchedSkills: [
            { name: 'NodeJS', proficiency: 'advanced', evidenceIds: [] },
          ],
          requiredSkillNames: ['Node.js', 'PostgreSQL'],
          matchedRequiredSkillNames: ['Node.js'],
          matchedRequiredCount: 1,
          requiredSkillCount: 2,
          applicationsCloseAt: '2026-09-01T00:00:00.000Z',
          targetCompletionDate: null,
          difficulty: 'intermediate',
          reward: null,
          rewardCurrency: null,
        },
      ],
    });
  });

  it('preserves the server-authored matched required names for the dashboard UI', async () => {
    const dashboard = await service.getForContributor(actor);

    expect(dashboard.matchedTasks).toEqual([
      {
        id: 'request-1',
        title: 'Build the ingestion worker',
        projectName: 'Share-k API',
        requiredSkills: ['Node.js', 'PostgreSQL'],
        matchedSkills: ['NodeJS'],
        matchedRequiredSkillNames: ['Node.js'],
        matchedCount: 1,
        requiredCount: 2,
      },
    ]);
    expect(dashboard.matching).toEqual({ planType: 'gold', reason: null });
  });

  it('does not show the verified-zero-match hero to a free contributor', async () => {
    recommendations.listForContributor.mockResolvedValue({
      planType: 'free',
      reason: 'MATCHING_REQUIRES_SUBSCRIPTION',
      recommendations: [],
    });
    subscriptions.getPlanStatus.mockResolvedValue({
      plan: 'free',
      usage: { used: 0, limit: 1 },
    });

    const dashboard = await service.getForContributor(actor);

    expect(dashboard.state).toBe('active');
    expect(dashboard.matching).toEqual({
      planType: 'free',
      reason: 'MATCHING_REQUIRES_SUBSCRIPTION',
    });
  });
});
