import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { ApplicationsController } from '../src/modules/applications/applications.controller';
import { ApplicationsService } from '../src/modules/applications/applications.service';
import { AdvisoryFitAssessmentService } from '../src/modules/applications/services/advisory-fit-assessment.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import {
  ConflictApplicationError,
  ForbiddenApplicationError,
} from '../src/shared/errors/application.error';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { createApplicationValidationPipe } from '../src/shared/validation/application-validation.pipe';

const contributor = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'contributor@example.com',
  role: 'contributor',
  status: 'active',
};
const owner = {
  id: '77777777-7777-4777-8777-777777777777',
  email: 'owner@example.com',
  role: 'owner',
  status: 'active',
};
const requestId = '22222222-2222-4222-8222-222222222222';
const applicationId = '33333333-3333-4333-8333-333333333333';
const idempotencyKey = '44444444-4444-4444-8444-444444444444';

describe('Applications HTTP contract', () => {
  let app: INestApplication;
  let authenticated = true;
  let authenticatedActor = contributor;
  const service = {
    submit: jest.fn(),
    listForOwner: jest.fn(),
    getForActor: jest.fn(),
    withdraw: jest.fn(),
    accept: jest.fn(),
    decline: jest.fn(),
  };
  const assessmentService = {
    request: jest.fn(),
    getAssessment: jest.fn(),
    presentAssessment: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ApplicationsController],
      providers: [
        { provide: ApplicationsService, useValue: service },
        { provide: AdvisoryFitAssessmentService, useValue: assessmentService },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!authenticated)
            throw new UnauthorizedException('Missing bearer token');
          context.switchToHttp().getRequest().user = authenticatedActor;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createApplicationValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    authenticated = true;
    authenticatedActor = contributor;
    jest.resetAllMocks();
    assessmentService.request.mockResolvedValue({
      id: applicationId,
      applicationId,
      requestStatus: 'COMPLETED',
      fitBand: 'STRONG',
      findings: [],
      presentedAt: null,
      requestedAt: '2026-08-02T12:00:00.000Z',
      completedAt: '2026-08-02T12:00:01.000Z',
      attempts: 1,
      retryAvailable: false,
    });
    assessmentService.getAssessment.mockResolvedValue({
      id: applicationId,
      applicationId,
      requestStatus: 'NOT_REQUESTED',
      fitBand: null,
      findings: [],
      presentedAt: null,
      requestedAt: null,
      completedAt: null,
      attempts: 0,
      retryAvailable: false,
    });
    service.submit.mockResolvedValue(applicationDto());
    service.listForOwner.mockResolvedValue({
      applications: [applicationDto()],
    });
    service.getForActor.mockResolvedValue(applicationDto());
    service.withdraw.mockResolvedValue(applicationDto({ status: 'WITHDRAWN' }));
    service.accept.mockResolvedValue(
      ownerDecisionDto({
        application: applicationDto({ status: 'ACCEPTED' }),
        assignment: {
          id: '55555555-5555-4555-8555-555555555555',
          contributionRequestId: requestId,
          applicationId,
          ownerDecisionId: '66666666-6666-4666-8666-666666666666',
          contributorId: contributor.id,
          agreedDeliveryDurationDays: 5,
          agreedDeliveryDueDate: '2026-08-03T12:00:00.000Z',
          assignedAt: '2026-07-29T12:00:00.000Z',
        },
      }),
    );
    service.decline.mockResolvedValue(
      ownerDecisionDto({
        application: applicationDto({ status: 'DECLINED_BY_OWNER' }),
        ownerDecision: {
          id: '66666666-6666-4666-8666-666666666666',
          applicationId,
          contributionRequestId: requestId,
          decisionType: 'DECLINED',
          feedback: 'The proposed approach does not address testing.',
          decidedAt: '2026-07-29T12:00:00.000Z',
        },
      }),
    );
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
      .expect(({ body }) => {
        expect(body.status).toBe('PENDING_OWNER_REVIEW');
        expect(body.reviewDueAt).toBe('2026-07-31T12:00:00.000Z');
        expect(body.expiresAt).toBe('2026-08-04T12:00:00.000Z');
        expect(body.expiredAt).toBeNull();
        expect(body.overdue).toBe(false);
      });

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
      .expect(({ body }) => {
        expect(body.applications).toHaveLength(1);
        expect(body.applications[0]).toMatchObject({
          expiredAt: null,
          overdue: false,
        });
      });
    await request(app.getHttpServer())
      .get(`/applications/${applicationId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.id).toBe(applicationId);
        expect(body).toHaveProperty('expiredAt', null);
        expect(body).toHaveProperty('overdue', false);
      });

    expect(service.listForOwner).toHaveBeenCalledWith(contributor, requestId);
    expect(service.getForActor).toHaveBeenCalledWith(
      contributor,
      applicationId,
    );
  });

  it('exposes the declined decision identifier and feedback on contributor detail', async () => {
    service.getForActor.mockResolvedValue(
      applicationDto({
        status: 'DECLINED_BY_OWNER',
        ownerDecision: {
          id: '66666666-6666-4666-8666-666666666666',
          applicationId,
          contributionRequestId: requestId,
          decisionType: 'DECLINED',
          feedback: 'The proposed approach does not address testing.',
          decidedAt: '2026-07-29T12:00:00.000Z',
        },
      }),
    );

    await request(app.getHttpServer())
      .get(`/applications/${applicationId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.ownerDecision.id).toBe(
          '66666666-6666-4666-8666-666666666666',
        );
        expect(body.ownerDecision.feedback).toBe(
          'The proposed approach does not address testing.',
        );
      });
  });

  it('serializes terminal expiry without presenting it as overdue', async () => {
    service.getForActor.mockResolvedValue(
      applicationDto({
        status: 'EXPIRED',
        expiredAt: '2026-08-04T12:00:00.000Z',
        overdue: false,
      }),
    );

    await request(app.getHttpServer())
      .get(`/applications/${applicationId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('EXPIRED');
        expect(body.expiredAt).toBe('2026-08-04T12:00:00.000Z');
        expect(body.overdue).toBe(false);
      });
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

  it('accepts a pending Application without a feedback field', async () => {
    authenticatedActor = owner;
    await request(app.getHttpServer())
      .post(`/applications/${applicationId}/accept`)
      .set('Idempotency-Key', idempotencyKey)
      .send({})
      .expect(200)
      .expect(({ body }) => {
        expect(body.application.status).toBe('ACCEPTED');
        expect(body.ownerDecision.feedback).toBeNull();
        expect(body.assignment.applicationId).toBe(applicationId);
      });

    expect(service.accept).toHaveBeenCalledWith({
      actor: owner,
      applicationId,
      idempotencyKey,
    });
  });

  it.each(['', '   '])(
    'rejects blank decline feedback before calling the service: %j',
    async (feedback) => {
      authenticatedActor = owner;
      await request(app.getHttpServer())
        .post(`/applications/${applicationId}/decline`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ feedback })
        .expect(400)
        .expect(({ body }) =>
          expect(body.code).toBe('APPLICATION_DECISION_FEEDBACK_REQUIRED'),
        );

      expect(service.decline).not.toHaveBeenCalled();
    },
  );

  it('trims valid decline feedback before delegating', async () => {
    authenticatedActor = owner;
    await request(app.getHttpServer())
      .post(`/applications/${applicationId}/decline`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ feedback: '  The proposed approach does not address testing.  ' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.application.status).toBe('DECLINED_BY_OWNER');
        expect(body.assignment).toBeNull();
      });

    expect(service.decline).toHaveBeenCalledWith({
      actor: owner,
      applicationId,
      feedback: 'The proposed approach does not address testing.',
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

  it('requests and reads an owner-only Advisory Fit Assessment', async () => {
    authenticatedActor = owner;

    await request(app.getHttpServer())
      .post(`/applications/${applicationId}/assessment-requests`)
      .send({ idempotencyKey })
      .expect(202)
      .expect(({ body }) => {
        expect(body.requestStatus).toBe('COMPLETED');
        expect(body.fitBand).toBe('STRONG');
        expect(body.retryAvailable).toBe(false);
      });

    await request(app.getHttpServer())
      .get(`/applications/${applicationId}/assessment`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.requestStatus).toBe('NOT_REQUESTED');
        expect(body.retryAvailable).toBe(false);
      });

    expect(assessmentService.request).toHaveBeenCalledWith({
      actor: owner,
      applicationId,
      idempotencyKey,
    });
    expect(assessmentService.getAssessment).toHaveBeenCalledWith(
      owner,
      applicationId,
    );
  });

  it('records presentation only through the explicit command, never the read', async () => {
    authenticatedActor = owner;
    assessmentService.presentAssessment.mockResolvedValue({
      id: applicationId,
      applicationId,
      requestStatus: 'COMPLETED',
      fitBand: 'STRONG',
      findings: [],
      presentedAt: '2026-08-02T12:05:00.000Z',
      requestedAt: '2026-08-02T12:00:00.000Z',
      completedAt: '2026-08-02T12:00:01.000Z',
      attempts: 1,
      retryAvailable: false,
    });

    await request(app.getHttpServer())
      .get(`/applications/${applicationId}/assessment`)
      .expect(200);
    expect(assessmentService.presentAssessment).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post(`/applications/${applicationId}/assessment/presentations`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.presentedAt).toBeTruthy();
      });

    expect(assessmentService.presentAssessment).toHaveBeenCalledWith(
      owner,
      applicationId,
    );
  });

  it('validates the assessment idempotency key at the HTTP boundary', async () => {
    authenticatedActor = owner;
    await request(app.getHttpServer())
      .post(`/applications/${applicationId}/assessment-requests`)
      .send({ idempotencyKey: 'not-a-uuid' })
      .expect(400);

    expect(assessmentService.request).not.toHaveBeenCalled();
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
    expiredAt: null,
    overdue: false,
    ownerDecision: null,
    assignment: null,
    ...overrides,
  };
}

function ownerDecisionDto(overrides: Record<string, unknown> = {}) {
  return {
    application: applicationDto(),
    ownerDecision: {
      id: '66666666-6666-4666-8666-666666666666',
      applicationId,
      contributionRequestId: requestId,
      decisionType: 'ACCEPTED',
      feedback: null,
      decidedAt: '2026-07-29T12:00:00.000Z',
    },
    assignment: null,
    ...overrides,
  };
}
