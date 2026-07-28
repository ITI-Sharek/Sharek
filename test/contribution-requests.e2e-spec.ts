import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { ContributionTasksController } from '../src/modules/contribution-tasks/contribution-tasks.controller';
import { ContributionTasksService } from '../src/modules/contribution-tasks/contribution-tasks.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import {
  ConflictApplicationError,
  NotFoundApplicationError,
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
    getOwnedRequest: jest.fn(),
    updateDraft: jest.fn(),
    discardDraft: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContributionTasksController],
      providers: [{ provide: ContributionTasksService, useValue: service }],
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
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    authenticated = true;
    jest.resetAllMocks();
    service.createDraft.mockResolvedValue(responseDto());
    service.getOwnedRequest.mockResolvedValue(responseDto());
    service.updateDraft.mockResolvedValue(responseDto({ title: 'Updated title' }));
    service.discardDraft.mockResolvedValue(responseDto({ status: 'discarded' }));
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

  it('rejects malformed input at the transport boundary', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/contribution-requests`)
      .send({ ...createBody(), requiredRequirements: [] })
      .expect(400);
    expect(service.createDraft).not.toHaveBeenCalled();
  });

  it('requires authentication on all draft routes', async () => {
    authenticated = false;
    await request(app.getHttpServer())
      .get(`/contribution-requests/${requestId}`)
      .expect(401);
    expect(service.getOwnedRequest).not.toHaveBeenCalled();
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
