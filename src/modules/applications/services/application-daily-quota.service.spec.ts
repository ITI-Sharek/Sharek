import { Prisma, SubscriptionPlanType, UserActionType } from '@prisma/client';

import { ApplicationError } from '../../../shared/errors/application.error';
import { EntitlementsService } from '../../subscriptions/entitlements.service';
import { ApplicationDailyQuotaService } from './application-daily-quota.service';

describe('ApplicationDailyQuotaService', () => {
  const contributorId = '11111111-1111-4111-8111-111111111111';

  const transaction = {
    usageTracker: { upsert: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    subscription: { findFirst: jest.fn() },
    $executeRaw: jest.fn(),
  };
  const service = new ApplicationDailyQuotaService(
    new EntitlementsService(transaction as never),
    transaction as never,
  );

  function goldSubscription() {
    return {
      plan_type: SubscriptionPlanType.gold,
      status: 'active',
      source: 'payment_provider',
      starts_at: new Date('2026-08-01T00:00:00.000Z'),
      expires_at: new Date('2026-09-01T00:00:00.000Z'),
      current_period_start: new Date('2026-08-01T00:00:00.000Z'),
      current_period_end: new Date('2026-09-01T00:00:00.000Z'),
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    transaction.$executeRaw.mockResolvedValue(1);
    transaction.subscription.findFirst.mockResolvedValue(null);
    transaction.usageTracker.upsert.mockResolvedValue({ count: 0 });
    transaction.usageTracker.update.mockResolvedValue({ count: 1 });
  });

  describe('the advisory lock', () => {
    it('serializes one contributor through $executeRaw', async () => {
      await service.lockContributor(
        contributorId,
        transaction as unknown as Prisma.TransactionClient,
      );

      expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
      const [statement] = transaction.$executeRaw.mock.calls[0] as [
        Prisma.Sql,
      ];
      expect(statement.sql).toContain('pg_advisory_xact_lock');
      expect(statement.sql).toContain('hashtextextended');
      expect(statement.values).toEqual([contributorId]);
    });

    // pg_advisory_xact_lock returns void, which Prisma cannot deserialize: on a
    // real database $queryRaw here throws P2010, and no mocked suite can see it.
    it('never routes the lock through $queryRaw', async () => {
      const queryRaw = jest.fn();
      await service.lockContributor(contributorId, {
        ...transaction,
        $queryRaw: queryRaw,
      } as unknown as Prisma.TransactionClient);

      expect(queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('the free allowance', () => {
    it('lets a free contributor through their first Application of the day', async () => {
      await expect(
        service.reserve({
          contributorId,
          transaction: transaction as unknown as Prisma.TransactionClient,
          now: new Date('2026-08-14T09:30:00.000Z'),
        }),
      ).resolves.toEqual({
        used: 1,
        limit: 1,
        resetsAt: new Date('2026-08-15T00:00:00.000Z'),
      });
      expect(transaction.usageTracker.update).toHaveBeenCalledWith({
        where: {
          user_id_action_type_period_date: {
            user_id: contributorId,
            action_type: UserActionType.application_submitted,
            period_date: new Date('2026-08-14T00:00:00.000Z'),
          },
        },
        data: { count: { increment: 1 } },
        select: { count: true },
      });
    });

    it('refuses the second, naming what the contributor has to wait for', async () => {
      transaction.usageTracker.upsert.mockResolvedValue({ count: 1 });

      await expect(
        service.reserve({
          contributorId,
          transaction: transaction as unknown as Prisma.TransactionClient,
          now: new Date('2026-08-14T09:30:00.000Z'),
        }),
      ).rejects.toMatchObject({
        code: 'APPLICATION_DAILY_LIMIT_REACHED',
        statusCode: 409,
        metadata: {
          used: 1,
          limit: 1,
          resetsAt: '2026-08-15T00:00:00.000Z',
        },
      } satisfies Partial<ApplicationError>);
      expect(transaction.usageTracker.update).not.toHaveBeenCalled();
    });
  });

  describe('the Gold allowance', () => {
    it('lets a Gold contributor through a fifth Application', async () => {
      transaction.subscription.findFirst.mockResolvedValue(goldSubscription());
      transaction.usageTracker.upsert.mockResolvedValue({ count: 4 });
      transaction.usageTracker.update.mockResolvedValue({ count: 5 });

      await expect(
        service.reserve({
          contributorId,
          transaction: transaction as unknown as Prisma.TransactionClient,
          now: new Date('2026-08-14T09:30:00.000Z'),
        }),
      ).resolves.toMatchObject({ used: 5, limit: 5 });
    });

    it('refuses their sixth', async () => {
      transaction.subscription.findFirst.mockResolvedValue(goldSubscription());
      transaction.usageTracker.upsert.mockResolvedValue({ count: 5 });

      await expect(
        service.reserve({
          contributorId,
          transaction: transaction as unknown as Prisma.TransactionClient,
          now: new Date('2026-08-14T09:30:00.000Z'),
        }),
      ).rejects.toMatchObject({
        code: 'APPLICATION_DAILY_LIMIT_REACHED',
        metadata: { used: 5, limit: 5 },
      });
    });
  });

  describe('the day boundary', () => {
    // A controlled clock, because the whole point of the rule is which side of
    // midnight UTC an instant falls on.
    it.each([
      ['2026-08-14T00:00:00.000Z', '2026-08-14', '2026-08-15T00:00:00.000Z'],
      ['2026-08-14T23:59:59.999Z', '2026-08-14', '2026-08-15T00:00:00.000Z'],
      ['2026-08-15T00:00:00.000Z', '2026-08-15', '2026-08-16T00:00:00.000Z'],
    ])('at %s counts against %s and resets at %s', async (
      now,
      expectedPeriod,
      expectedReset,
    ) => {
      const result = await service.reserve({
        contributorId,
        transaction: transaction as unknown as Prisma.TransactionClient,
        now: new Date(now),
      });

      expect(result.resetsAt.toISOString()).toBe(expectedReset);
      expect(transaction.usageTracker.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            user_id_action_type_period_date: expect.objectContaining({
              period_date: new Date(`${expectedPeriod}T00:00:00.000Z`),
            }),
          },
        }),
      );
    });

    it('gives the contributor a fresh allowance on the next UTC day', async () => {
      // The tally for 15 August does not exist yet, so the upsert creates it at
      // zero even though 14 August was fully spent.
      transaction.usageTracker.upsert.mockResolvedValue({ count: 0 });

      await expect(
        service.reserve({
          contributorId,
          transaction: transaction as unknown as Prisma.TransactionClient,
          now: new Date('2026-08-15T00:00:00.001Z'),
        }),
      ).resolves.toMatchObject({ used: 1, limit: 1 });
    });
  });

  describe('reading the tally without spending it', () => {
    it('reports zero for a contributor who has not applied today', async () => {
      transaction.usageTracker.findUnique.mockResolvedValue(null);

      await expect(
        service.read({
          contributorId,
          now: new Date('2026-08-14T09:30:00.000Z'),
        }),
      ).resolves.toEqual({
        used: 0,
        periodStart: new Date('2026-08-14T00:00:00.000Z'),
        periodEnd: new Date('2026-08-15T00:00:00.000Z'),
      });
    });

    it('reports the tally and never writes', async () => {
      transaction.usageTracker.findUnique.mockResolvedValue({ count: 3 });

      await expect(
        service.read({
          contributorId,
          now: new Date('2026-08-14T09:30:00.000Z'),
        }),
      ).resolves.toMatchObject({ used: 3 });
      expect(transaction.usageTracker.upsert).not.toHaveBeenCalled();
      expect(transaction.usageTracker.update).not.toHaveBeenCalled();
    });
  });
});
