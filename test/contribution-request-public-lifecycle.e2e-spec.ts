import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { PublicContributionRequestsController } from '../src/modules/contribution-tasks/controllers/public-contribution-requests.controller';
import { ContributionTasksController } from '../src/modules/contribution-tasks/controllers/contribution-tasks.controller';
import { ContributionRequestPublicationService } from '../src/modules/contribution-tasks/services/contribution-request-publication.service';
import { ContributionTasksService } from '../src/modules/contribution-tasks/services/contribution-tasks.service';
import { PublicContributionRequestsService } from '../src/modules/contribution-tasks/services/public-contribution-requests.service';
import { ApplicationsService } from '../src/modules/applications/applications.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { DatabaseService } from '../src/shared/database/database.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';

const requestId = '33333333-3333-4333-8333-333333333333';
const projectId = '22222222-2222-4222-8222-222222222222';

describe('Contribution Request public lifecycle HTTP integration', () => {
  let app: INestApplication;
  let storedRequest = contributionRequest();
  const database = {
    contributionRequest: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const projectsService = {
    listContributionRequestProjectReferences: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicContributionRequestsController],
      providers: [
        PublicContributionRequestsService,
        { provide: DatabaseService, useValue: database },
        { provide: ProjectsService, useValue: projectsService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    storedRequest = contributionRequest();
    database.contributionRequest.findFirst.mockImplementation(() =>
      isActionable(storedRequest) ? storedRequest : null,
    );
    projectsService.listContributionRequestProjectReferences.mockResolvedValue([
      { id: projectId, title: 'Share-k Backend', slug: 'share-k-backend' },
    ]);
  });

  afterAll(async () => app.close());

  it('serves actionable detail through the real discovery service with classifications intact', async () => {
    await request(app.getHttpServer())
      .get(`/tasks/${requestId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: requestId,
          status: 'published',
          projectName: 'Share-k Backend',
          requirements: [
            { text: 'Ship tested endpoints', classification: 'required' },
            { text: 'Add examples', classification: 'preferred' },
          ],
        });
      });

    expect(database.contributionRequest.findFirst).toHaveBeenCalledWith({
      where: {
        id: requestId,
        status: 'published',
        published_at: { not: null },
        applications_close_at: { gt: expect.any(Date) },
      },
      include: { requirements: true },
    });
  });

  it('applies structured feed filters through the real discovery service', async () => {
    database.contributionRequest.count.mockResolvedValue(1);
    database.contributionRequest.findMany
      .mockResolvedValueOnce([storedRequest])
      .mockResolvedValueOnce([{ technology_tags: ['NestJS', 'PostgreSQL'] }]);

    await request(app.getHttpServer())
      .get('/tasks')
      .query({
        q: 'backend',
        technologies: 'NestJS,PostgreSQL',
        difficulty: 'intermediate',
        hasReward: 'true',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.totalCount).toBe(1);
        expect(body.items[0]).toMatchObject({ id: requestId });
        expect(body.technologyFacets).toEqual(['NestJS', 'PostgreSQL']);
      });

    expect(database.contributionRequest.count).toHaveBeenCalledWith({
      where: {
        AND: expect.arrayContaining([
          { difficulty: 'intermediate' },
          { reward: { not: null } },
          {
            OR: [
              { technology_tags: { array_contains: ['NestJS'] } },
              { technology_tags: { array_contains: ['PostgreSQL'] } },
            ],
          },
        ]),
      },
    });
  });

  it.each([
    ['draft', { status: 'draft' }],
    ['cancelled', { status: 'cancelled' }],
    ['closed', { applications_close_at: new Date('2020-01-01T00:00:00.000Z') }],
  ])('keeps a %s Request private at the real HTTP/service seam', async (_case, overrides) => {
    storedRequest = contributionRequest(overrides);

    await request(app.getHttpServer())
      .get(`/tasks/${requestId}`)
      .expect(404)
      .expect(({ body }) =>
        expect(body.code).toBe('CONTRIBUTION_REQUEST_NOT_FOUND'),
      );
  });
});

describe('Contribution Request owner publication HTTP integration', () => {
  let app: INestApplication;
  const owner = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'owner@example.com',
    role: 'owner',
    status: 'active',
  };
  const database = {
    contributionRequest: {
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    contributionRequestAudit: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    subscription: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const projectsService = {
    getContributionRequestProjectAccess: jest.fn(),
    lockContributionRequestProjectAccess: jest.fn(),
  };
  const applicationsService = { cancelPendingForRequest: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContributionTasksController],
      providers: [
        ContributionRequestPublicationService,
        { provide: ContributionTasksService, useValue: {} },
        { provide: DatabaseService, useValue: database },
        { provide: ProjectsService, useValue: projectsService },
        { provide: ApplicationsService, useValue: applicationsService },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = owner;
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

  beforeEach(() => {
    jest.resetAllMocks();
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) =>
        callback(database),
    );
    database.$queryRaw.mockResolvedValue([]);
    database.contributionRequestAudit.findFirst.mockResolvedValue(null);
    database.contributionRequestAudit.create.mockResolvedValue({});
    database.subscription.findFirst.mockResolvedValue(null);
    database.contributionRequest.count.mockResolvedValue(0);
    database.contributionRequest.updateMany.mockResolvedValue({ count: 1 });
    projectsService.getContributionRequestProjectAccess.mockResolvedValue({
      id: projectId,
      ownerId: owner.id,
      status: 'published',
    });
    projectsService.lockContributionRequestProjectAccess.mockResolvedValue({
      id: projectId,
      ownerId: owner.id,
      status: 'published',
    });
    applicationsService.cancelPendingForRequest.mockResolvedValue({
      cancelledApplicationIds: ['application-1'],
    });
  });

  afterAll(async () => app.close());

  it('publishes through the real command service and records the entitlement decision', async () => {
    const draft = contributionRequest({ status: 'draft', published_at: null });
    const published = contributionRequest();
    database.contributionRequest.findFirst.mockResolvedValue(draft);
    database.contributionRequest.findUniqueOrThrow.mockResolvedValue(published);

    await request(app.getHttpServer())
      .post(`/contribution-requests/${requestId}/publish`)
      .set('Idempotency-Key', 'publish-http-001')
      .send({})
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('published'));

    expect(database.contributionRequestAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'published',
        from_status: 'draft',
        to_status: 'published',
        metadata: expect.objectContaining({ planType: 'bronze' }),
      }),
    });
  });

  it('cancels through the real command service and propagates only pending Applications', async () => {
    const published = contributionRequest();
    const cancelled = contributionRequest({ status: 'cancelled' });
    database.contributionRequest.findFirst.mockResolvedValue(published);
    database.contributionRequest.findUniqueOrThrow.mockResolvedValue(cancelled);

    await request(app.getHttpServer())
      .post(`/contribution-requests/${requestId}/cancel`)
      .set('Idempotency-Key', 'cancel-http-001')
      .send({ reason: 'Priorities changed' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('cancelled'));

    expect(applicationsService.cancelPendingForRequest).toHaveBeenCalledWith({
      contributionRequestId: requestId,
      actorId: owner.id,
      transaction: database,
    });
    expect(database.contributionRequestAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'cancelled',
        reason: 'Priorities changed',
      }),
    });
  });
});

function isActionable(requestRecord: ReturnType<typeof contributionRequest>) {
  return (
    requestRecord.status === 'published' &&
    requestRecord.published_at !== null &&
    requestRecord.applications_close_at.getTime() > Date.now()
  );
}

function contributionRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId,
    project_id: projectId,
    owner_id: '11111111-1111-4111-8111-111111111111',
    title: 'Build a Contribution Request',
    description: 'Implement the public lifecycle safely.',
    technology_tags: ['NestJS'],
    applications_close_at: new Date('2030-03-10T12:00:00.000Z'),
    target_completion_date: new Date('2030-03-20T00:00:00.000Z'),
    difficulty: 'intermediate',
    reward: {
      toString: () => '150.00',
      toFixed: () => '150.00',
    },
    reward_currency: 'USD',
    status: 'published',
    published_at: new Date('2026-07-28T12:00:00.000Z'),
    created_at: new Date('2026-07-28T00:00:00.000Z'),
    updated_at: new Date('2026-07-28T00:00:00.000Z'),
    requirements: [
      {
        id: 'required-0',
        contribution_request_id: requestId,
        kind: 'required',
        position: 0,
        text: 'Ship tested endpoints',
      },
      {
        id: 'preferred-0',
        contribution_request_id: requestId,
        kind: 'preferred',
        position: 0,
        text: 'Add examples',
      },
    ],
    ...overrides,
  };
}
