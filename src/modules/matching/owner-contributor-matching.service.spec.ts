import { SubscriptionPlanType } from '@prisma/client';

import { OwnerContributorMatchingService } from './owner-contributor-matching.service';

describe('OwnerContributorMatchingService', () => {
  const contributionTasks = { getPublishedMatchingContext: jest.fn() };
  const entitlements = { resolveForOwner: jest.fn() };
  const skillProfiles = {
    listApprovedContributorMatchingSnapshots: jest.fn(),
  };
  const reputation = { listSummariesForUsers: jest.fn() };
  const ai = { requestContributorMatching: jest.fn() };
  const service = new OwnerContributorMatchingService(
    contributionTasks as never,
    entitlements as never,
    skillProfiles as never,
    reputation as never,
    ai as never,
  );
  const owner = {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'owner@example.test',
    role: 'owner' as const,
    status: 'active' as const,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    contributionTasks.getPublishedMatchingContext.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      ownerId: '22222222-2222-4222-8222-222222222222',
      title: 'Improve API security',
      description: 'Add JWT authentication.',
      technologyTags: ['Node.js'],
      requirements: [
        { id: 'requirement-1', kind: 'required', position: 0, text: 'Node.js' },
      ],
    });
    entitlements.resolveForOwner.mockResolvedValue({
      planType: SubscriptionPlanType.gold,
      contributorMatchLimit: 10,
    });
    skillProfiles.listApprovedContributorMatchingSnapshots.mockResolvedValue([
      {
        contributorId: '33333333-3333-4333-8333-333333333333',
        displayName: 'Sara Ahmed',
        username: 'sara',
        approvedSkills: [
          {
            skillProfileId: 'skill-1',
            name: 'Node.js',
            proficiency: 'advanced',
            confidence: 0.94,
            evidenceIds: ['github:sara/api'],
            evidenceSummary: 'Reviewed API work',
          },
        ],
      },
    ]);
    reputation.listSummariesForUsers.mockResolvedValue(
      new Map([
        [
          '33333333-3333-4333-8333-333333333333',
          {
            rating: 4.8,
            reviewsCount: 5,
            completedContributions: 7,
            totalAssignedTasks: 8,
            successRate: 87.5,
            topVerifiedSkills: [{ name: 'Node.js', verifiedContributionCount: 4 }],
          },
        ],
      ]),
    );
    ai.requestContributorMatching.mockResolvedValue({
      kind: 'completed',
      matches: [
        {
          contributorId: '33333333-3333-4333-8333-333333333333',
          matchScore: 0.94,
          confidence: 'HIGH',
          justification: 'Strong approved Node.js evidence.',
          matchedSkills: [
            {
              name: 'Node.js',
              proficiency: 'advanced',
              evidenceIds: ['github:sara/api'],
            },
          ],
          evidenceIds: ['github:sara/api'],
        },
      ],
      metadata: {
        provider: 'fixture',
        model: 'fixture',
        promptVersion: 'v1',
        schemaVersion: 'v1',
        serviceVersion: 'test',
      },
    });
  });

  it('gates generation to the Gold owner plan before candidate discovery', async () => {
    entitlements.resolveForOwner.mockResolvedValue({
      planType: SubscriptionPlanType.free,
      contributorMatchLimit: 0,
    });

    await expect(
      service.generate({
        actor: owner,
        requestId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toMatchObject({
      code: 'OWNER_CONTRIBUTOR_MATCHING_PLAN_REQUIRED',
      statusCode: 403,
    });
    expect(skillProfiles.listApprovedContributorMatchingSnapshots).not.toHaveBeenCalled();
    expect(ai.requestContributorMatching).not.toHaveBeenCalled();
  });

  it('returns ranked advisory matches without exposing numeric scores', async () => {
    const response = await service.generate({
      actor: owner,
      requestId: '11111111-1111-4111-8111-111111111111',
    });

    expect(response).toEqual({
      requestId: '11111111-1111-4111-8111-111111111111',
      planType: 'gold',
      resultLimit: 10,
      status: 'completed',
      matches: [
        {
          contributorId: '33333333-3333-4333-8333-333333333333',
          contributorName: 'Sara Ahmed',
          contributorUsername: 'sara',
          rank: 1,
          confidence: 'HIGH',
          justification: 'Strong approved Node.js evidence.',
          matchedSkills: [{ name: 'Node.js', proficiency: 'advanced' }],
        },
      ],
    });
    expect(response.matches[0]).not.toHaveProperty('matchScore');
    expect(ai.requestContributorMatching).toHaveBeenCalledWith(
      expect.objectContaining({
        contributionRequestId: '11111111-1111-4111-8111-111111111111',
        contractVersion: 'contributor-matching-v1',
      }),
    );
  });

  it('does not let another owner use the matching capability', async () => {
    await expect(
      service.generate({
        actor: {
          ...owner,
          id: '44444444-4444-4444-8444-444444444444',
        },
        requestId: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toMatchObject({
      code: 'OWNER_CONTRIBUTOR_MATCHING_NOT_AUTHORIZED',
      statusCode: 403,
    });
    expect(entitlements.resolveForOwner).not.toHaveBeenCalled();
  });
});
