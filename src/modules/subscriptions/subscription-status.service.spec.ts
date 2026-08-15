import { SubscriptionPlanType, SubscriptionSource } from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionStatusService } from './subscription-status.service';

describe('SubscriptionStatusService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const now = new Date('2026-08-14T09:30:00.000Z');

  const owner: AuthenticatedUser = {
    id: userId,
    email: 'owner@example.com',
    role: 'owner',
    status: 'active',
  };
  const contributor: AuthenticatedUser = {
    id: userId,
    email: 'contributor@example.com',
    role: 'contributor',
    status: 'active',
  };

  const database = { subscription: { findFirst: jest.fn() } };
  const config = { get: jest.fn((_key: string, fallback: unknown) => fallback) };
  const projects = { getOwnerPublicationUsage: jest.fn() };
  const applicationQuota = { read: jest.fn() };
  const service = new SubscriptionStatusService(
    new EntitlementsService(database as never, config as never),
    projects as never,
    applicationQuota as never,
  );

  function goldRow() {
    return {
      plan_type: SubscriptionPlanType.gold,
      status: 'active',
      source: SubscriptionSource.payment_provider,
      starts_at: new Date('2026-08-01T00:00:00.000Z'),
      expires_at: new Date('2026-09-01T00:00:00.000Z'),
      current_period_start: new Date('2026-08-01T00:00:00.000Z'),
      current_period_end: new Date('2026-09-01T00:00:00.000Z'),
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockImplementation(
      (_key: string, fallback: unknown) => fallback,
    );
    database.subscription.findFirst.mockResolvedValue(null);
    projects.getOwnerPublicationUsage.mockResolvedValue({
      used: 2,
      limit: 5,
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-01T00:00:00.000Z'),
    });
    applicationQuota.read.mockResolvedValue({
      used: 0,
      periodStart: new Date('2026-08-14T00:00:00.000Z'),
      periodEnd: new Date('2026-08-15T00:00:00.000Z'),
    });
  });

  describe('the four payloads', () => {
    it('describes a free contributor completely rather than 404ing', async () => {
      await expect(service.getPlanStatus(contributor, now)).resolves.toEqual({
        roleContext: 'contributor',
        plan: 'free',
        status: 'active',
        source: 'default',
        usage: {
          used: 0,
          limit: 1,
          periodStart: '2026-08-14T00:00:00.000Z',
          periodEnd: '2026-08-15T00:00:00.000Z',
        },
        benefits: [
          {
            key: 'CONTRIBUTOR_DAILY_APPLICATIONS',
            state: 'included',
            label: '1 Application per day',
          },
          {
            key: 'CONTRIBUTOR_MATCHED_PROJECTS',
            state: 'unavailable',
            label: 'Matched projects',
          },
        ],
        entitlements: [
          { key: 'PROJECT_MATERIAL_ANALYSIS', state: 'unavailable' },
        ],
      });
    });

    it('describes a Gold contributor', async () => {
      database.subscription.findFirst.mockResolvedValue(goldRow());
      applicationQuota.read.mockResolvedValue({
        used: 3,
        periodStart: new Date('2026-08-14T00:00:00.000Z'),
        periodEnd: new Date('2026-08-15T00:00:00.000Z'),
      });

      await expect(service.getPlanStatus(contributor, now)).resolves.toEqual({
        roleContext: 'contributor',
        plan: 'gold',
        status: 'active',
        source: 'payment_provider',
        usage: {
          used: 3,
          limit: 5,
          periodStart: '2026-08-14T00:00:00.000Z',
          periodEnd: '2026-08-15T00:00:00.000Z',
        },
        benefits: [
          {
            key: 'CONTRIBUTOR_DAILY_APPLICATIONS',
            state: 'included',
            label: '5 Applications per day',
          },
          {
            key: 'CONTRIBUTOR_MATCHED_PROJECTS',
            state: 'included',
            label: '10 matched projects',
          },
        ],
        entitlements: [
          { key: 'PROJECT_MATERIAL_ANALYSIS', state: 'unavailable' },
        ],
      });
    });

    it('describes a free owner, counting published Requests this month', async () => {
      await expect(service.getPlanStatus(owner, now)).resolves.toEqual({
        roleContext: 'owner',
        plan: 'free',
        status: 'active',
        source: 'default',
        usage: {
          used: 2,
          limit: 5,
          periodStart: '2026-08-01T00:00:00.000Z',
          periodEnd: '2026-09-01T00:00:00.000Z',
        },
        benefits: [
          {
            key: 'OWNER_MONTHLY_CONTRIBUTION_REQUESTS',
            state: 'included',
            label: '5 published Contribution Requests per month',
          },
          {
            key: 'OWNER_CONTRIBUTOR_MATCHING',
            state: 'unavailable',
            label: 'AI contributor matching',
          },
        ],
        // Material analysis is not subscription-gated by default, so a free
        // owner is entitled to it exactly as before this endpoint existed.
        entitlements: [{ key: 'PROJECT_MATERIAL_ANALYSIS', state: 'granted' }],
      });
    });

    it('describes a Gold owner', async () => {
      database.subscription.findFirst.mockResolvedValue(goldRow());
      projects.getOwnerPublicationUsage.mockResolvedValue({
        used: 11,
        limit: 30,
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        periodEnd: new Date('2026-09-01T00:00:00.000Z'),
      });

      await expect(service.getPlanStatus(owner, now)).resolves.toMatchObject({
        roleContext: 'owner',
        plan: 'gold',
        usage: { used: 11, limit: 30 },
        benefits: [
          {
            key: 'OWNER_MONTHLY_CONTRIBUTION_REQUESTS',
            state: 'included',
            label: '30 published Contribution Requests per month',
          },
          {
            key: 'OWNER_CONTRIBUTOR_MATCHING',
            state: 'included',
            label:
              'AI contributor matching with up to 10 suggestions per Request',
          },
        ],
      });
    });
  });

  describe('what Phase 1 must not say', () => {
    it.each([
      ['contributor', contributor],
      ['owner', owner],
    ])('emits no commission benefit for a free %s', async (_role, actor) => {
      const status = await service.getPlanStatus(actor, now);

      expect(
        JSON.stringify(status).toLowerCase().includes('commission'),
      ).toBe(false);
    });

    it.each([
      ['contributor', contributor],
      ['owner', owner],
    ])('emits no commission benefit for a Gold %s', async (_role, actor) => {
      database.subscription.findFirst.mockResolvedValue(goldRow());

      const status = await service.getPlanStatus(actor, now);

      expect(
        JSON.stringify(status).toLowerCase().includes('commission'),
      ).toBe(false);
    });

    it('never describes the other role context', async () => {
      database.subscription.findFirst.mockResolvedValue(goldRow());

      const status = await service.getPlanStatus(owner, now);

      expect(
        status.benefits.map((benefit) => benefit.key),
      ).not.toContain('CONTRIBUTOR_DAILY_APPLICATIONS');
      expect(
        status.benefits.map((benefit) => benefit.key),
      ).not.toContain('CONTRIBUTOR_MATCHED_PROJECTS');
    });
  });

  describe('role isolation of usage', () => {
    it('counts Applications for a contributor and never publication', async () => {
      await service.getPlanStatus(contributor, now);

      expect(applicationQuota.read).toHaveBeenCalledWith({
        contributorId: userId,
        now,
      });
      expect(projects.getOwnerPublicationUsage).not.toHaveBeenCalled();
    });

    it('counts publication for an owner and never Applications', async () => {
      await service.getPlanStatus(owner, now);

      expect(projects.getOwnerPublicationUsage).toHaveBeenCalledWith(
        userId,
        now,
      );
      expect(applicationQuota.read).not.toHaveBeenCalled();
    });
  });

  describe('material analysis reporting', () => {
    it('reports it unavailable to an owner when the feature is off', async () => {
      config.get.mockImplementation((key: string, fallback: unknown) =>
        key === 'MATERIAL_ANALYSIS_ENABLED' ? false : fallback,
      );

      await expect(service.getPlanStatus(owner, now)).resolves.toMatchObject({
        entitlements: [
          { key: 'PROJECT_MATERIAL_ANALYSIS', state: 'unavailable' },
        ],
      });
    });

    it('reports it unavailable to a free owner once a subscription is required', async () => {
      config.get.mockImplementation((key: string, fallback: unknown) =>
        key === 'MATERIAL_ANALYSIS_REQUIRE_SUBSCRIPTION' ? true : fallback,
      );

      await expect(service.getPlanStatus(owner, now)).resolves.toMatchObject({
        entitlements: [
          { key: 'PROJECT_MATERIAL_ANALYSIS', state: 'unavailable' },
        ],
      });
    });

    it('reports it granted to a Gold owner once a subscription is required', async () => {
      config.get.mockImplementation((key: string, fallback: unknown) =>
        key === 'MATERIAL_ANALYSIS_REQUIRE_SUBSCRIPTION' ? true : fallback,
      );
      database.subscription.findFirst.mockResolvedValue(goldRow());

      await expect(service.getPlanStatus(owner, now)).resolves.toMatchObject({
        entitlements: [{ key: 'PROJECT_MATERIAL_ANALYSIS', state: 'granted' }],
      });
    });
  });

  describe('authorization', () => {
    it.each([
      ['an admin', { ...owner, role: 'admin' as const }],
      ['a suspended owner', { ...owner, status: 'suspended' as const }],
    ])('refuses %s', async (_who, actor) => {
      await expect(
        service.getPlanStatus(actor as AuthenticatedUser, now),
      ).rejects.toMatchObject({
        code: 'SUBSCRIPTION_ACCOUNT_NOT_ELIGIBLE',
        statusCode: 403,
      });
    });

    it('reads the caller and no one else', async () => {
      await service.getPlanStatus(contributor, now);

      expect(database.subscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ user_id: contributor.id }),
        }),
      );
    });
  });
});
