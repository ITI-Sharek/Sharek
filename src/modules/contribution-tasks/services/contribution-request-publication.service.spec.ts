import {
  ContributionRequestRequirementKind,
  ContributionRequestStatus,
} from '@prisma/client';

import { ContributionRequestPublicationService } from './contribution-request-publication.service';

describe('ContributionRequestPublicationService', () => {
  const database = {
    contributionRequest: { findFirst: jest.fn() },
    contributionRequestAudit: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const projectsService = {
    getContributionRequestProjectAccess: jest.fn(),
  };
  const applicationsService = { cancelPendingForRequest: jest.fn() };
  const service = new ContributionRequestPublicationService(
    database as never,
    projectsService as never,
    applicationsService as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    database.contributionRequestAudit.findFirst.mockResolvedValue(null);
    projectsService.getContributionRequestProjectAccess.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      ownerId: '11111111-1111-4111-8111-111111111111',
      status: 'published',
    });
  });

  it('rejects a persisted draft whose work-contract title is incomplete', async () => {
    database.contributionRequest.findFirst.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      project_id: '22222222-2222-4222-8222-222222222222',
      owner_id: '11111111-1111-4111-8111-111111111111',
      title: 'x',
      description: 'A complete request description',
      technology_tags: [],
      applications_close_at: new Date('2030-01-01T00:00:00.000Z'),
      target_completion_date: null,
      difficulty: null,
      reward: null,
      reward_currency: null,
      status: ContributionRequestStatus.draft,
      published_at: null,
      created_at: new Date('2026-07-28T00:00:00.000Z'),
      updated_at: new Date('2026-07-28T00:00:00.000Z'),
      requirements: [
        {
          id: 'required-1',
          contribution_request_id: '33333333-3333-4333-8333-333333333333',
          kind: ContributionRequestRequirementKind.required,
          position: 0,
          text: 'Ship tested endpoints',
        },
      ],
    });

    await expect(
      service.publishRequest({
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'owner@example.com',
          role: 'owner',
          status: 'active',
        },
        requestId: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_DRAFT_NOT_PUBLISHABLE',
      metadata: { incompleteFields: ['title'] },
    });
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});
