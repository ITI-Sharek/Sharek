import { ApplicationStatus } from '@prisma/client';

import { ApplicationDeliveryContextService } from './application-delivery-context.service';

const contributorId = '00000000-0000-4000-8000-000000000001';
const applicationId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';

function lifecycleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: applicationId,
    contribution_request_id: requestId,
    contributor_id: contributorId,
    status: ApplicationStatus.accepted,
    contributionRequest: { title: 'Add JWT authentication' },
    contributor: {
      id: contributorId,
      username: 'contributor',
      first_name: 'Example',
      last_name: 'Contributor',
      avatar_url: null,
    },
    assignment: {
      agreed_delivery_due_at: new Date('2026-08-25T10:00:00.000Z'),
      assigned_at: new Date('2026-08-11T10:00:00.000Z'),
    },
    ...overrides,
  };
}

describe('ApplicationDeliveryContextService', () => {
  const database = {
    application: { findMany: jest.fn() },
  };
  const service = new ApplicationDeliveryContextService(database as never);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('lockDeliverySubmissionContext', () => {
    it('returns the locked accepted Application for its contributor', async () => {
      const transaction = {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: applicationId,
            contribution_request_id: requestId,
            contributor_id: contributorId,
            status: ApplicationStatus.accepted,
          },
        ]),
      };

      await expect(
        service.lockDeliverySubmissionContext({
          applicationId,
          contributorId,
          transaction: transaction as never,
        }),
      ).resolves.toEqual({
        applicationId,
        contributionRequestId: requestId,
        contributorId,
        status: ApplicationStatus.accepted,
      });
      expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('refuses a missing row or another contributor row with DELIVERY_NOT_AUTHORIZED', async () => {
      for (const rows of [
        [],
        [
          {
            id: applicationId,
            contribution_request_id: requestId,
            contributor_id: '99999999-9999-4999-8999-999999999999',
            status: ApplicationStatus.accepted,
          },
        ],
      ]) {
        const transaction = { $queryRaw: jest.fn().mockResolvedValue(rows) };
        await expect(
          service.lockDeliverySubmissionContext({
            applicationId,
            contributorId,
            transaction: transaction as never,
          }),
        ).rejects.toThrowError(
          expect.objectContaining({
            code: 'DELIVERY_NOT_AUTHORIZED',
            statusCode: 403,
          }),
        );
      }
    });

    it('refuses a non-accepted Application with APPLICATION_NOT_ACCEPTED and its status', async () => {
      const transaction = {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: applicationId,
            contribution_request_id: requestId,
            contributor_id: contributorId,
            status: ApplicationStatus.pending_owner_review,
          },
        ]),
      };

      await expect(
        service.lockDeliverySubmissionContext({
          applicationId,
          contributorId,
          transaction: transaction as never,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'APPLICATION_NOT_ACCEPTED',
          statusCode: 409,
          metadata: { status: ApplicationStatus.pending_owner_review },
        }),
      );
    });
  });

  describe('listDeliveryLifecycleContextsForContributor', () => {
    it('exposes the complete Application progression for the contributor Delivery lifecycle', async () => {
      const assignedAt = new Date('2026-08-11T10:00:00.000Z');
      const deliveryDueAt = new Date('2026-08-25T10:00:00.000Z');
      database.application.findMany.mockResolvedValue([
        lifecycleRow(),
        lifecycleRow({
          id: '55555555-5555-4555-8555-555555555555',
          status: ApplicationStatus.pending_owner_review,
          contributionRequest: { title: 'Incomplete legacy acceptance' },
          assignment: null,
        }),
      ]);

      await expect(
        service.listDeliveryLifecycleContextsForContributor(contributorId),
      ).resolves.toEqual([
        {
          applicationId,
          contributionRequestId: requestId,
          contributionRequestTitle: 'Add JWT authentication',
          contributorId,
          contributor: {
            id: contributorId,
            username: 'contributor',
            displayName: 'Example Contributor',
            avatarUrl: null,
          },
          applicationStatus: 'ACCEPTED',
          deliveryDueAt,
          assignedAt,
        },
        {
          applicationId: '55555555-5555-4555-8555-555555555555',
          contributionRequestId: requestId,
          contributionRequestTitle: 'Incomplete legacy acceptance',
          contributorId,
          contributor: {
            id: contributorId,
            username: 'contributor',
            displayName: 'Example Contributor',
            avatarUrl: null,
          },
          applicationStatus: 'PENDING_OWNER_REVIEW',
          deliveryDueAt: null,
          assignedAt: null,
        },
      ]);
      expect(database.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            contributor_id: contributorId,
          },
        }),
      );
    });
  });

  describe('listDeliveryLifecycleContextsForOwner', () => {
    it('returns an empty list without querying when there are no Request scopes', async () => {
      await expect(
        service.listDeliveryLifecycleContextsForOwner([]),
      ).resolves.toEqual([]);
      expect(database.application.findMany).not.toHaveBeenCalled();
    });

    it('queries exactly the owned Request scopes', async () => {
      database.application.findMany.mockResolvedValue([lifecycleRow()]);

      await service.listDeliveryLifecycleContextsForOwner([requestId]);

      expect(database.application.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { contribution_request_id: { in: [requestId] } },
        }),
      );
    });
  });
});
