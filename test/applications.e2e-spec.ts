import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { ApplicationsController } from '../src/modules/applications/applications.controller';
import { ApplicationsService } from '../src/modules/applications/applications.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import {
  ConflictApplicationError,
  ForbiddenApplicationError,
} from '../src/shared/errors/application.error';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';

const contributor = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'contributor@example.com',
  role: 'contributor',
  status: 'active',
};
const requestId = '22222222-2222-4222-8222-222222222222';
const applicationId = '33333333-3333-4333-8333-333333333333';
const idempotencyKey = '44444444-4444-4444-8444-444444444444';

describe('Applications HTTP contract', () => {
  let app: INestApplication;
  let authenticated = true;
  const service = {
    submit: jest.fn(),
    listForOwner: jest.fn(),
    getForActor: jest.fn(),
    withdraw: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ApplicationsController],
      providers: [{ provide: ApplicationsService, useValue: service }],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!authenticated)
            throw new UnauthorizedException('Missing bearer token');
          context.switchToHttp().getRequest().user = contributor;
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
    service.submit.mockResolvedValue(applicationDto());
    service.listForOwner.mockResolvedValue({
      applications: [applicationDto()],
    });
    service.getForActor.mockResolvedValue(applicationDto());
    service.withdraw.mockResolvedValue(applicationDto({ status: 'WITHDRAWN' }));
  });

  afterAll(async () => app.close());

  it('submits directly to owner review with the canonical Application input', async () => {
    await request(app.getHttpServer())
      .post(`/tasks/${requestId}/applications`)
      .send({
        contributionApproach: 'I will deliver a tested NestJS implementation.',
        proposedDeliveryDurationDays: 5,
        idempotencyKey,
      })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('PENDING_OWNER_REVIEW'));

    expect(service.submit).toHaveBeenCalledWith({
      actor: contributor,
      contributionRequestId: requestId,
      contributionApproach: 'I will deliver a tested NestJS implementation.',
      proposedDeliveryDurationDays: 5,
      idempotencyKey,
    });
  });

  it('validates duration and idempotency before calling the service', async () => {
    await request(app.getHttpServer())
      .post(`/tasks/${requestId}/applications`)
      .send({
        contributionApproach: 'Too short',
        proposedDeliveryDurationDays: 0,
      })
      .expect(400);

    expect(service.submit).not.toHaveBeenCalled();
  });

  it('lists and inspects Applications through owner-safe routes', async () => {
    await request(app.getHttpServer())
      .get(`/tasks/${requestId}/applications`)
      .expect(200)
      .expect(({ body }) => expect(body.applications).toHaveLength(1));
    await request(app.getHttpServer())
      .get(`/applications/${applicationId}`)
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(applicationId));

    expect(service.listForOwner).toHaveBeenCalledWith(contributor, requestId);
    expect(service.getForActor).toHaveBeenCalledWith(
      contributor,
      applicationId,
    );
  });

  it('withdraws a pending Application idempotently', async () => {
    await request(app.getHttpServer())
      .post(`/applications/${applicationId}/withdraw`)
      .set('Idempotency-Key', idempotencyKey)
      .send({})
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('WITHDRAWN'));

    expect(service.withdraw).toHaveBeenCalledWith({
      actor: contributor,
      applicationId,
      idempotencyKey,
    });
  });

  it('serializes stable workflow errors and requires authentication', async () => {
    service.submit.mockRejectedValue(
      new ConflictApplicationError(
        'An Application already exists for this Contribution Request',
        'ALREADY_APPLIED',
      ),
    );
    await request(app.getHttpServer())
      .post(`/tasks/${requestId}/applications`)
      .send({
        contributionApproach: 'I will deliver a tested NestJS implementation.',
        proposedDeliveryDurationDays: 5,
        idempotencyKey,
      })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('ALREADY_APPLIED'));

    authenticated = false;
    await request(app.getHttpServer())
      .get(`/applications/${applicationId}`)
      .expect(401);
  });

  it.each([
    [
      'APPLICATIONS_CLOSED',
      new ConflictApplicationError('Closed', 'APPLICATIONS_CLOSED'),
      409,
    ],
    [
      'REQUEST_CANCELLED',
      new ConflictApplicationError('Cancelled', 'REQUEST_CANCELLED'),
      409,
    ],
    [
      'REQUEST_TERMINAL',
      new ConflictApplicationError('Terminal', 'REQUEST_TERMINAL'),
      409,
    ],
    [
      'APPLICATION_NOT_AUTHORIZED',
      new ForbiddenApplicationError(
        'Unauthorized',
        'APPLICATION_NOT_AUTHORIZED',
      ),
      403,
    ],
  ])('serializes the %s submission error', async (code, error, status) => {
    service.submit.mockRejectedValue(error);

    await request(app.getHttpServer())
      .post(`/tasks/${requestId}/applications`)
      .send({
        contributionApproach: 'I will deliver a tested NestJS implementation.',
        proposedDeliveryDurationDays: 5,
        idempotencyKey,
      })
      .expect(status)
      .expect(({ body }) => expect(body.code).toBe(code));
  });
});

function applicationDto(overrides: Record<string, unknown> = {}) {
  return {
    id: applicationId,
    contributionRequestId: requestId,
    contributor: {
      id: contributor.id,
      username: 'contributor',
      displayName: 'Example Contributor',
    },
    profileContext: {
      bio: 'Backend contributor',
      availability: '10 hours/week',
      experienceLevel: {
        key: 'advanced',
        labelEn: 'Advanced',
        labelAr: 'Advanced',
      },
      fields: [{ key: 'backend', labelEn: 'Backend', labelAr: 'Backend' }],
      declaredSkills: ['NestJS'],
    },
    contributionApproach: 'I will deliver a tested NestJS implementation.',
    proposedDeliveryDurationDays: 5,
    status: 'PENDING_OWNER_REVIEW',
    requirementSnapshot: {
      required: [{ id: 'requirement-1', position: 0, text: 'NestJS' }],
      preferred: [],
    },
    evidenceSummary: [],
    submittedAt: '2026-07-28T12:00:00.000Z',
    reviewDueAt: '2026-07-31T12:00:00.000Z',
    expiresAt: '2026-08-04T12:00:00.000Z',
    ...overrides,
  };
}
