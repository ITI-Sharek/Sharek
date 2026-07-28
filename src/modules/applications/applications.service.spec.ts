import { ApplicationStatus } from '@prisma/client';

import { ApplicationsService } from './applications.service';

describe('ApplicationsService owner-workspace summary', () => {
  const database = {
    application: {
      groupBy: jest.fn(),
    },
  };
  const service = new ApplicationsService(database as never);

  beforeEach(() => jest.resetAllMocks());

  it('counts only pending owner-review Applications inside trusted Request scopes', async () => {
    database.application.groupBy.mockResolvedValue([
      {
        contribution_request_id: 'request-1',
        _count: { _all: 2 },
      },
    ]);

    await expect(
      service.summarizePendingByContributionRequests({
        requestScopes: [
          { projectId: 'project-1', contributionRequestIds: ['request-1'] },
          { projectId: 'project-2', contributionRequestIds: ['request-2'] },
        ],
      }),
    ).resolves.toEqual({
      projects: [
        { projectId: 'project-1', pendingApplicationCount: 2 },
        { projectId: 'project-2', pendingApplicationCount: 0 },
      ],
    });
    expect(database.application.groupBy).toHaveBeenCalledWith({
      by: ['contribution_request_id'],
      where: {
        contribution_request_id: { in: ['request-1', 'request-2'] },
        status: ApplicationStatus.pending_owner_review,
      },
      _count: { _all: true },
    });
  });

  it('returns stable zero summaries without querying for empty Request scopes', async () => {
    await expect(
      service.summarizePendingByContributionRequests({
        requestScopes: [
          { projectId: 'project-1', contributionRequestIds: [] },
        ],
      }),
    ).resolves.toEqual({
      projects: [{ projectId: 'project-1', pendingApplicationCount: 0 }],
    });
    expect(database.application.groupBy).not.toHaveBeenCalled();
  });
});
