import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { ContributionTasksController } from '../src/modules/contribution-tasks/controllers/contribution-tasks.controller';
import { PublicContributionRequestsController } from '../src/modules/contribution-tasks/controllers/public-contribution-requests.controller';
import { ContributionRequestPublicationService } from '../src/modules/contribution-tasks/services/contribution-request-publication.service';
import { ContributionTasksService } from '../src/modules/contribution-tasks/services/contribution-tasks.service';
import { PublicContributionRequestsService } from '../src/modules/contribution-tasks/services/public-contribution-requests.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import {
  ConflictApplicationError,
  NotFoundApplicationError,
  UnprocessableApplicationError,
} from '../src/shared/errors/application.error';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';

const owner = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@example.com',
  role: 'owner',
  status: 'active',
};
const projectId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';

describe('Contribution Request draft HTTP contract', () => {
  let app: INestApplication;
  let authenticated = true;
  const service = {
    createDraft: jest.fn(),
    listForOwnedProject: jest.fn(),
    getOwnedRequest: jest.fn(),
    updateDraft: jest.fn(),
    discardDraft: jest.fn(),
    publishRequest: jest.fn(),
    cancelRequest: jest.fn(),
    list: jest.fn(),
    getById: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        ContributionTasksController,
        PublicContributionRequestsController,
      ],
      providers: [
        { provide: ContributionTasksService, useValue: service },
        { provide: ContributionRequestPublicationService, useValue: service },
        { provide: PublicContributionRequestsService, useValue: service },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!authenticated) throw new UnauthorizedException('Missing bearer token');
          context.switchToHttp().getRequest().user = owner;
          return true;
        },
      })
      .compile();

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
    authenticated = true;
    jest.resetAllMocks();
    service.createDraft.mockResolvedValue(responseDto());
    service.listForOwnedProject.mockResolvedValue({
      projectId,
      totalCount: 1,
      byStatus: {
        draft: [responseDto()],
        published: [],
        assigned: [],
        completed: [],
        cancelled: [],
        discarded: [],
      },
    });
    service.getOwnedRequest.mockResolvedValue(responseDto());
    service.updateDraft.mockResolvedValue(responseDto({ title: 'Updated title' }));
    service.discardDraft.mockResolvedValue(responseDto({ status: 'discarded' }));
    service.publishRequest.mockResolvedValue(
      responseDto({
        status: 'published',
        publishedAt: '2026-07-28T12:00:00.000Z',
      }),
    );
    service.cancelRequest.mockResolvedValue(
      responseDto({ status: 'cancelled' }),
    );
    service.list.mockResolvedValue({
      items: [publicListItem()],
      totalCount: 1,
      technologyFacets: ['NestJS'],
    });
    service.getById.mockResolvedValue({
      ...publicListItem(),
      description: 'Implement the public lifecycle safely.',
      status: 'published',
      requirements: [
        {
          id: 'required-0',
          text: 'Deliver tested endpoints',
          classification: 'required',
        },
        {
          id: 'preferred-0',
          text: 'Document the contract',
          classification: 'preferred',
        },
      ],
    });
  });

  afterAll(async () => app.close());

  it('creates a draft without accepting an owner identifier from the client', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/contribution-requests`)
      .set('Idempotency-Key', 'create-request-001')
      .send(createBody())
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe(requestId);
        expect(body.requiredRequirements[0].position).toBe(0);
        expect(body.preferredRequirements[0].text).toBe('Helpful docs');
      });

    expect(service.createDraft).toHaveBeenCalledWith({
      user: owner,
      projectId,
      body: expect.not.objectContaining({ ownerId: expect.anything() }),
      idempotencyKey: 'create-request-001',
    });
  });

  it('lists an owned Project Contribution Requests grouped by lifecycle state', async () => {
    await request(app.getHttpServer())
      .get(`/projects/${projectId}/contribution-requests`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.projectId).toBe(projectId);
        expect(body.totalCount).toBe(1);
        expect(body.byStatus.draft[0].id).toBe(requestId);
        expect(body.byStatus.completed).toEqual([]);
      });

    expect(service.listForOwnedProject).toHaveBeenCalledWith(owner, projectId);
  });

  it('returns a stable domain error when Required Requirements are missing', async () => {
    service.createDraft.mockRejectedValue(
      new UnprocessableApplicationError(
        'At least one Required Requirement is required',
        'CONTRIBUTION_REQUEST_REQUIRED_REQUIREMENT_MISSING',
      ),
    );
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/contribution-requests`)
      .send({ ...createBody(), requiredRequirements: [] })
      .expect(422)
      .expect(({ body }) =>
        expect(body.code).toBe(
          'CONTRIBUTION_REQUEST_REQUIRED_REQUIREMENT_MISSING',
        ),
      );
    expect(service.createDraft).toHaveBeenCalled();

    const withoutRequired = {
      ...createBody(),
      requiredRequirements: undefined,
    };
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/contribution-requests`)
      .send(withoutRequired)
      .expect(422)
      .expect(({ body }) =>
        expect(body.code).toBe(
          'CONTRIBUTION_REQUEST_REQUIRED_REQUIREMENT_MISSING',
        ),
      );
    expect(service.createDraft).toHaveBeenCalledTimes(2);
  });

  it('returns a stable domain error for duplicate Requirements', async () => {
    service.createDraft.mockRejectedValue(
      new UnprocessableApplicationError(
        'Requirements must be unique within their classification',
        'CONTRIBUTION_REQUEST_REQUIREMENT_DUPLICATE',
      ),
    );
    const duplicate = { text: 'Deliver tested endpoints' };

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/contribution-requests`)
      .send({
        ...createBody(),
        requiredRequirements: [duplicate, duplicate],
      })
      .expect(422)
      .expect(({ body }) =>
        expect(body.code).toBe('CONTRIBUTION_REQUEST_REQUIREMENT_DUPLICATE'),
      );

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/contribution-requests`)
      .send({
        ...createBody(),
        preferredRequirements: [duplicate, duplicate],
      })
      .expect(422)
      .expect(({ body }) =>
        expect(body.code).toBe('CONTRIBUTION_REQUEST_REQUIREMENT_DUPLICATE'),
      );
    expect(service.createDraft).toHaveBeenCalledTimes(2);
  });

  it('returns a stable audience-safe code for malformed Requirement input', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/contribution-requests`)
      .send({
        ...createBody(),
        requiredRequirements: [{ text: 'x' }],
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: 'CONTRIBUTION_REQUEST_REQUIREMENT_INPUT_INVALID',
          message: 'Contribution Request Requirement input is invalid',
        });
      });
    expect(service.createDraft).not.toHaveBeenCalled();
  });

  it('requires authentication on all draft routes', async () => {
    authenticated = false;
    const server = app.getHttpServer();

    await request(server)
      .get(`/contribution-requests/${requestId}`)
      .expect(401);
    await request(server)
      .get(`/projects/${projectId}/contribution-requests`)
      .expect(401);
    await request(server)
      .post(`/projects/${projectId}/contribution-requests`)
      .send(createBody())
      .expect(401);
    await request(server)
      .patch(`/contribution-requests/${requestId}`)
      .send({ title: 'Updated title' })
      .expect(401);
    await request(server)
      .post(`/contribution-requests/${requestId}/discard`)
      .send({})
      .expect(401);
    await request(server)
      .post(`/contribution-requests/${requestId}/publish`)
      .send({})
      .expect(401);
    await request(server)
      .post(`/contribution-requests/${requestId}/cancel`)
      .send({})
      .expect(401);

    expect(service.getOwnedRequest).not.toHaveBeenCalled();
    expect(service.listForOwnedProject).not.toHaveBeenCalled();
    expect(service.createDraft).not.toHaveBeenCalled();
    expect(service.updateDraft).not.toHaveBeenCalled();
    expect(service.discardDraft).not.toHaveBeenCalled();
    expect(service.publishRequest).not.toHaveBeenCalled();
    expect(service.cancelRequest).not.toHaveBeenCalled();
  });

  it('serializes the same audience-safe not-found result for inaccessible drafts', async () => {
    service.getOwnedRequest.mockRejectedValue(
      new NotFoundApplicationError(
        'Contribution Request was not found',
        'CONTRIBUTION_REQUEST_NOT_FOUND',
      ),
    );
    await request(app.getHttpServer())
      .get(`/contribution-requests/${requestId}`)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('CONTRIBUTION_REQUEST_NOT_FOUND'));
  });

  it('updates a draft and preserves stable transition errors', async () => {
    await request(app.getHttpServer())
      .patch(`/contribution-requests/${requestId}`)
      .set('Idempotency-Key', 'update-request-001')
      .send({ title: 'Updated title' })
      .expect(200);
    expect(service.updateDraft).toHaveBeenCalledWith(
      expect.objectContaining({ requestId, idempotencyKey: 'update-request-001' }),
    );

    service.updateDraft.mockRejectedValue(
      new ConflictApplicationError(
        'Only a draft Contribution Request can be updated',
        'CONTRIBUTION_REQUEST_DRAFT_NOT_EDITABLE',
      ),
    );
    await request(app.getHttpServer())
      .patch(`/contribution-requests/${requestId}`)
      .send({ title: 'Another title' })
      .expect(409)
      .expect(({ body }) =>
        expect(body.code).toBe('CONTRIBUTION_REQUEST_DRAFT_NOT_EDITABLE'),
      );
  });

  it('uses a command route for idempotent discard', async () => {
    await request(app.getHttpServer())
      .post(`/contribution-requests/${requestId}/discard`)
      .set('Idempotency-Key', 'discard-request-001')
      .send({ reason: 'No longer needed' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('discarded'));
    expect(service.discardDraft).toHaveBeenCalledWith({
      user: owner,
      requestId,
      reason: 'No longer needed',
      idempotencyKey: 'discard-request-001',
    });
  });

  it('publishes only through the explicit owner command', async () => {
    await request(app.getHttpServer())
      .post(`/contribution-requests/${requestId}/publish`)
      .set('Idempotency-Key', 'publish-request-001')
      .send({})
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('published');
        expect(body.publishedAt).toBe('2026-07-28T12:00:00.000Z');
      });

    expect(service.publishRequest).toHaveBeenCalledWith({
      user: owner,
      requestId,
      idempotencyKey: 'publish-request-001',
    });
  });

  it('cancels a published request through an auditable owner command', async () => {
    await request(app.getHttpServer())
      .post(`/contribution-requests/${requestId}/cancel`)
      .set('Idempotency-Key', 'cancel-request-001')
      .send({ reason: 'Project priorities changed' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('cancelled'));

    expect(service.cancelRequest).toHaveBeenCalledWith({
      user: owner,
      requestId,
      reason: 'Project priorities changed',
      idempotencyKey: 'cancel-request-001',
    });
  });

  it('exposes an unauthenticated actionable-only feed with structured filters', async () => {
    authenticated = false;

    await request(app.getHttpServer())
      .get('/tasks')
      .query({
        q: 'webhook',
        technologies: 'NestJS,PostgreSQL',
        difficulty: 'intermediate',
        hasReward: 'true',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).toEqual([publicListItem()]);
        expect(body.technologyFacets).toEqual(['NestJS']);
      });

    expect(service.list).toHaveBeenCalledWith({
      q: 'webhook',
      technologies: ['NestJS', 'PostgreSQL'],
      difficulty: 'intermediate',
      hasReward: true,
    });
  });

  it('accepts the bracketed technology arrays emitted by the frontend HTTP client', async () => {
    authenticated = false;

    await request(app.getHttpServer())
      .get('/tasks?technologies%5B%5D=NestJS&technologies%5B%5D=PostgreSQL')
      .expect(200);

    expect(service.list).toHaveBeenCalledWith({
      technologies: ['NestJS', 'PostgreSQL'],
    });
  });

  it('exposes actionable public detail with Required and Preferred Requirements distinct', async () => {
    authenticated = false;

    await request(app.getHttpServer())
      .get(`/tasks/${requestId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('published');
        expect(body.requirements).toEqual([
          expect.objectContaining({ classification: 'required' }),
          expect.objectContaining({ classification: 'preferred' }),
        ]);
      });

    expect(service.getById).toHaveBeenCalledWith(requestId);
  });

  it('keeps draft, cancelled, and closed Requests private behind one stable public error', async () => {
    authenticated = false;
    service.getById.mockRejectedValue(
      new NotFoundApplicationError(
        'Contribution Request was not found',
        'CONTRIBUTION_REQUEST_NOT_FOUND',
      ),
    );

    await request(app.getHttpServer())
      .get(`/tasks/${requestId}`)
      .expect(404)
      .expect(({ body }) =>
        expect(body.code).toBe('CONTRIBUTION_REQUEST_NOT_FOUND'),
      );
  });

  it('serializes stable publication-limit and cancellation-state errors', async () => {
    service.publishRequest.mockRejectedValue(
      new ConflictApplicationError(
        'The monthly Contribution Request publication limit was reached',
        'CONTRIBUTION_REQUEST_LIMIT_REACHED',
      ),
    );
    await request(app.getHttpServer())
      .post(`/contribution-requests/${requestId}/publish`)
      .send({})
      .expect(409)
      .expect(({ body }) =>
        expect(body.code).toBe('CONTRIBUTION_REQUEST_LIMIT_REACHED'),
      );

    service.cancelRequest.mockRejectedValue(
      new ConflictApplicationError(
        'Only a published Contribution Request can be cancelled',
        'CONTRIBUTION_REQUEST_NOT_CANCELLABLE',
      ),
    );
    await request(app.getHttpServer())
      .post(`/contribution-requests/${requestId}/cancel`)
      .send({})
      .expect(409)
      .expect(({ body }) =>
        expect(body.code).toBe('CONTRIBUTION_REQUEST_NOT_CANCELLABLE'),
      );
  });
});

function createBody() {
  return {
    title: 'Build a Contribution Request',
    description: 'Implement and test the private draft lifecycle.',
    requiredRequirements: [{ text: 'Deliver tested endpoints' }],
    preferredRequirements: [{ text: 'Helpful docs' }],
    technologyTags: ['NestJS'],
    applicationsCloseTime: '2030-03-10T12:00:00.000Z',
    targetCompletionDate: '2030-03-20',
    difficulty: 'intermediate',
    reward: 150,
    rewardCurrency: 'USD',
  };
}

function responseDto(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId,
    projectId,
    title: 'Build a Contribution Request',
    description: 'Implement and test the private draft lifecycle.',
    technologyTags: ['NestJS'],
    requiredRequirements: [{ position: 0, text: 'Deliver tested endpoints' }],
    preferredRequirements: [{ position: 0, text: 'Helpful docs' }],
    applicationsCloseTime: '2030-03-10T12:00:00.000Z',
    targetCompletionDate: '2030-03-20',
    difficulty: 'intermediate',
    reward: '150.00',
    rewardCurrency: 'USD',
    status: 'draft',
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
    ...overrides,
  };
}

function publicListItem() {
  return {
    id: requestId,
    projectId,
    projectName: 'Share-k Backend',
    projectSlug: 'share-k-backend',
    title: 'Build a Contribution Request',
    technologyTags: ['NestJS'],
    difficulty: 'intermediate',
    applicationsCloseAt: '2030-03-10T12:00:00.000Z',
    targetCompletionDate: '2030-03-20',
    reward: { amount: 150, currency: 'USD' },
  };
}
