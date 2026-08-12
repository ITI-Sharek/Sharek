import { SubscriptionPlanType } from '@prisma/client';

import { ContributorMatchingService } from './matching.service';

describe('ContributorMatchingService', () => {
  const requestContext = {
    id: 'request-1',
    ownerId: 'owner-1',
    title: 'Add JWT Authentication',
    description: 'Implement secure JWT authentication for the API.',
    requirements: [
      { id: 'requirement-1', kind: 'required', position: 0, text: 'Node.js and JWT' },
    ],
    technologyTags: ['Node.js', 'JWT'],
  };

  function createService() {
    const database = {
      $transaction: jest.fn().mockImplementation(async (callback) => callback(database)),
      aiMatchResult: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
    };
    const contributionTasks = {
      getPublishedMatchingContext: jest.fn().mockResolvedValue(requestContext),
      listPublishedTaskRecommendationContexts: jest.fn().mockResolvedValue([]),
    };
    const subscriptions = {
        getOwnerMatchingEntitlement: jest.fn().mockResolvedValue({
        entitled: true,
        planType: SubscriptionPlanType.silver,
        resultLimit: 5,
      }),
      getContributorBenefitEntitlement: jest.fn(),
    };
    const skills = {
      listApprovedContributorMatchingSnapshots: jest.fn().mockResolvedValue([
        {
          contributorId: 'contributor-1',
          displayName: 'Sara Ahmed',
          username: 'sara-dev',
          approvedSkills: [
            {
              skillProfileId: 'skill-1',
              name: 'Node.js',
              proficiency: 'advanced',
              confidence: 0.94,
              evidenceIds: ['github:sara/api'],
              evidenceSummary: 'Approved Node.js evidence',
            },
          ],
        },
      ]),
      getApprovedContributorMatchingSnapshot: jest.fn(),
    };
    const reputation = {
      listSummariesForUsers: jest.fn().mockResolvedValue(
        new Map([
          [
            'contributor-1',
            {
              rating: 4.7,
              reviewsCount: 13,
              completedContributions: 13,
              totalAssignedTasks: 14,
              successRate: 93,
              topVerifiedSkills: [{ name: 'Node.js', verifiedContributionCount: 3 }],
            },
          ],
        ]),
      ),
      getSummaryForUser: jest.fn().mockResolvedValue({
        rating: 4.7,
        reviewsCount: 13,
        completedContributions: 13,
        totalAssignedTasks: 14,
        successRate: 93,
        topVerifiedSkills: [{ name: 'Node.js', verifiedContributionCount: 3 }],
      }),
    };
    const ai = {
      requestContributorMatching: jest.fn().mockResolvedValue({
        kind: 'completed',
        matches: [
          {
            contributorId: 'contributor-1',
            matchScore: 0.94,
            confidence: 'HIGH',
            justification: 'Strong approved Node.js evidence.',
            matchedSkills: [
              { name: 'Node.js', proficiency: 'advanced', evidenceIds: ['github:sara/api'] },
            ],
            evidenceIds: ['requirement:requirement-1', 'github:sara/api'],
          },
        ],
        metadata: {
          provider: 'fixture',
          model: 'fixture',
          promptVersion: 'contributor-matching-v1',
          schemaVersion: 'contributor-matching-v1',
          serviceVersion: 'test',
        },
      }),
    };
    const queue = { enqueueForPublishedRequest: jest.fn().mockResolvedValue(undefined) };
    const notifications = {
      createMatchFoundNotification: jest.fn().mockResolvedValue({
        notificationId: 'notification-1',
        created: true,
      }),
    };
    return {
      service: new ContributorMatchingService(
        database as never,
        contributionTasks as never,
        subscriptions as never,
        skills as never,
        reputation as never,
        ai as never,
        queue as never,
        notifications as never,
      ),
      database,
      contributionTasks,
      subscriptions,
      skills,
      reputation,
      ai,
      queue,
      notifications,
    };
  }

  it('generates and persists only the plan-sized ranked result', async () => {
    const { service, database, ai } = createService();

    await expect(
      service.generateForPublishedRequest({ ownerId: 'owner-1', requestId: 'request-1' }),
    ).resolves.toMatchObject({
      requestId: 'request-1',
      planType: 'silver',
      resultLimit: 5,
      matches: [expect.objectContaining({ contributorId: 'contributor-1', rank: 1 })],
    });

    expect(ai.requestContributorMatching).toHaveBeenCalledWith(
      expect.objectContaining({
        contributionRequestId: 'request-1',
        candidates: expect.any(Array),
      }),
    );
    expect(database.aiMatchResult.deleteMany).toHaveBeenCalledWith({
      where: { contribution_request_id: 'request-1' },
    });
    expect(database.aiMatchResult.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        contribution_request_id: 'request-1',
        contributor_id: 'contributor-1',
        rank: 1,
        confidence: 'HIGH',
      })],
    });
  });

  it('fails closed for Bronze owners before calling AI', async () => {
    const { service, subscriptions, ai } = createService();
      subscriptions.getOwnerMatchingEntitlement.mockResolvedValue({
      entitled: false,
      planType: SubscriptionPlanType.bronze,
      resultLimit: 0,
    });

    await expect(
      service.generateForPublishedRequest({ ownerId: 'owner-1', requestId: 'request-1' }),
    ).rejects.toMatchObject({ code: 'CONTRIBUTOR_MATCHING_PLAN_REQUIRED' });
    expect(ai.requestContributorMatching).not.toHaveBeenCalled();
  });

  it('lets an eligible owner invite a stored match without creating an Application', async () => {
    const { service, database, notifications } = createService();
    database.aiMatchResult.findFirst.mockResolvedValue({
      contributor_id: 'contributor-1',
      match_score: 0.94,
      matched_skills: [{ name: 'Node.js' }],
    });

    await expect(
      service.inviteMatchedContributor({
        ownerId: 'owner-1',
        requestId: 'request-1',
        contributorId: 'contributor-1',
      }),
    ).resolves.toMatchObject({
      requestId: 'request-1',
      contributorId: 'contributor-1',
      notificationId: 'notification-1',
    });

    expect(notifications.createMatchFoundNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'contributor-1',
        contributionRequestId: 'request-1',
        audience: 'contributor',
        notificationKind: 'owner_invite',
      }),
    );
  });

  it('returns reverse AI recommendations only to Gold contributors', async () => {
    const { service, subscriptions, skills, contributionTasks, reputation } =
      createService();
    const now = new Date('2026-08-11T12:00:00.000Z');
    const contributor = {
      id: 'contributor-1',
      role: 'contributor' as const,
      status: 'active' as const,
      email: 'sara@example.com',
    };
    subscriptions.getContributorBenefitEntitlement = jest.fn().mockResolvedValue({
      planType: SubscriptionPlanType.gold,
      taskRecommendations: true,
      skillMatchedNotifications: true,
      priorityApplicationVisibility: true,
      commission: 'none',
      source: 'demo',
    });
    skills.getApprovedContributorMatchingSnapshot.mockResolvedValue({
      contributorId: 'contributor-1',
      displayName: 'Sara Ahmed',
      username: 'sara-dev',
      approvedSkills: [
        {
          skillProfileId: 'skill-1',
          name: 'Node.js',
          proficiency: 'advanced',
          confidence: 0.94,
          evidenceIds: ['github:sara/api'],
          evidenceSummary: 'Approved Node.js evidence',
        },
      ],
    });
    contributionTasks.listPublishedTaskRecommendationContexts.mockResolvedValue([
      {
        ...requestContext,
        projectName: 'Sharek API',
        difficulty: 'intermediate',
        applicationsCloseAt: new Date('2026-08-20T00:00:00.000Z'),
        targetCompletionDate: null,
        reward: 75,
        rewardCurrency: 'USD',
      },
    ]);

    await expect(
      service.listRecommendedTasks({ actor: contributor, now }),
    ).resolves.toMatchObject({
      planType: 'gold',
      recommendations: [
        expect.objectContaining({
          requestId: 'request-1',
          projectName: 'Sharek API',
          matchScore: 0.94,
        }),
      ],
    });
    expect(reputation.getSummaryForUser).toHaveBeenCalledWith('contributor-1');
  });

  it('auto-notifies the generated best matches for a Gold owner', async () => {
    const { service, subscriptions, notifications } = createService();
    subscriptions.getOwnerMatchingEntitlement.mockResolvedValue({
      entitled: true,
      planType: SubscriptionPlanType.gold,
      resultLimit: 10,
    });

    await service.generateForPublishedRequest({
      ownerId: 'owner-1',
      requestId: 'request-1',
    });

    expect(notifications.createMatchFoundNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'contributor-1',
        notificationKind: 'gold_auto_match',
      }),
    );
  });
});
