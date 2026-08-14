import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { ApplicationDailyQuotaService } from '../src/modules/applications/services/application-daily-quota.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { EntitlementsService } from '../src/modules/subscriptions/entitlements.service';
import { SubscriptionStatusService } from '../src/modules/subscriptions/subscription-status.service';
import { SubscriptionsController } from '../src/modules/subscriptions/subscriptions.controller';
import { AuthenticatedUser } from '../src/shared/auth/authenticated-request';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { RolesGuard } from '../src/shared/auth/guards/roles.guard';
import { DatabaseService } from '../src/shared/database/database.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';

/**
 * The frontend has been calling `GET /me/subscription` against a type with no
 * implementation behind it, so these assertions are written against that type —
 * `Frontend/src/modules/subscriptions/types/subscription.types.ts` — field for
 * field, rather than against whatever this backend happens to return.
 */
const FRONTEND_PLAN_STATUS_FIELDS = [
  'roleContext',
  'plan',
  'status',
  'source',
  'usage',
  'benefits',
  'entitlements',
].sort();
const FRONTEND_USAGE_FIELDS = [
  'used',
  'limit',
  'periodStart',
  'periodEnd',
].sort();
const FRONTEND_BENEFIT_FIELDS = ['key', 'state', 'label'].sort();
const FRONTEND_ENTITLEMENT_FIELDS = ['key', 'state'].sort();

const owner: AuthenticatedUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'owner@example.com',
  role: 'owner',
  status: 'active',
};
const contributor: AuthenticatedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'contributor@example.com',
  role: 'contributor',
  status: 'active',
};
const admin: AuthenticatedUser = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
};

describe('GET /me/subscription HTTP integration', () => {
  let app: INestApplication;
  let currentUser: AuthenticatedUser | null = contributor;

  const database = { subscription: { findFirst: jest.fn() } };
  const projects = { getOwnerPublicationUsage: jest.fn() };
  const applicationQuota = { read: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        SubscriptionStatusService,
        EntitlementsService,
        Reflector,
        RolesGuard,
        { provide: DatabaseService, useValue: database },
        { provide: ProjectsService, useValue: projects },
        {
          provide: ApplicationDailyQuotaService,
          useValue: applicationQuota,
        },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          // The real guard throws UnauthorizedException on a missing bearer
          // token; mirroring that is what makes the 401 assertion meaningful.
          if (!currentUser) throw new UnauthorizedException('Missing bearer token');
          context.switchToHttp().getRequest().user = currentUser;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    jest.resetAllMocks();
    currentUser = contributor;
    database.subscription.findFirst.mockResolvedValue(null);
    applicationQuota.read.mockResolvedValue({
      used: 0,
      periodStart: new Date('2026-08-14T00:00:00.000Z'),
      periodEnd: new Date('2026-08-15T00:00:00.000Z'),
    });
    projects.getOwnerPublicationUsage.mockResolvedValue({
      used: 2,
      limit: 5,
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-01T00:00:00.000Z'),
    });
  });

  it('answers a free contributor with a complete payload rather than a 404', async () => {
    await request(app.getHttpServer())
      .get('/me/subscription')
      .expect(200)
      .expect(({ body }) => {
        expect(Object.keys(body).sort()).toEqual(FRONTEND_PLAN_STATUS_FIELDS);
        expect(Object.keys(body.usage).sort()).toEqual(FRONTEND_USAGE_FIELDS);
        expect(body.roleContext).toBe('contributor');
        expect(body.plan).toBe('free');
        expect(body.status).toBe('active');
        expect(body.source).toBe('default');
        expect(body.usage).toMatchObject({ used: 0, limit: 1 });
      });
  });

  it('matches the frontend DTO field for field on every nested shape', async () => {
    await request(app.getHttpServer())
      .get('/me/subscription')
      .expect(200)
      .expect(({ body }) => {
        for (const benefit of body.benefits) {
          expect(Object.keys(benefit).sort()).toEqual(FRONTEND_BENEFIT_FIELDS);
          expect(['included', 'unavailable', 'not_applicable']).toContain(
            benefit.state,
          );
        }
        for (const entitlement of body.entitlements) {
          expect(Object.keys(entitlement).sort()).toEqual(
            FRONTEND_ENTITLEMENT_FIELDS,
          );
          expect(['granted', 'unavailable']).toContain(entitlement.state);
        }
        // The UI formats these with Intl.DateTimeFormat, so they have to parse.
        expect(Number.isNaN(Date.parse(body.usage.periodStart))).toBe(false);
        expect(Number.isNaN(Date.parse(body.usage.periodEnd))).toBe(false);
      });
  });

  it('reports the owner month rather than the contributor day for an owner', async () => {
    currentUser = owner;

    await request(app.getHttpServer())
      .get('/me/subscription')
      .expect(200)
      .expect(({ body }) => {
        expect(body.roleContext).toBe('owner');
        expect(body.usage).toMatchObject({
          used: 2,
          limit: 5,
          periodStart: '2026-08-01T00:00:00.000Z',
          periodEnd: '2026-09-01T00:00:00.000Z',
        });
      });
  });

  it('mentions no commission anywhere in the payload', async () => {
    await request(app.getHttpServer())
      .get('/me/subscription')
      .expect(200)
      .expect(({ text }) => {
        expect(text.toLowerCase()).not.toContain('commission');
      });
  });

  it('refuses an unauthenticated caller', async () => {
    currentUser = null;

    await request(app.getHttpServer()).get('/me/subscription').expect(401);
  });

  it('refuses an admin, who holds no plan in either role context', async () => {
    currentUser = admin;

    await request(app.getHttpServer()).get('/me/subscription').expect(403);
  });

  it('exposes no route that reads another user, so it always queries the caller', async () => {
    await request(app.getHttpServer())
      .get(`/me/subscription?userId=${owner.id}`)
      .expect(200);

    expect(database.subscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: contributor.id }),
      }),
    );
    expect(database.subscription.findFirst).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: owner.id }),
      }),
    );
  });
});
