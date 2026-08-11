import { createHash } from 'node:crypto';
import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as request from 'supertest';

import { ApplicationsService } from '../src/modules/applications/applications.service';
import { ContributionTasksService } from '../src/modules/contribution-tasks/services/contribution-tasks.service';
import { DeliveryReviewsController } from '../src/modules/delivery-reviews/delivery-reviews.controller';
import { DeliveryReviewsService } from '../src/modules/delivery-reviews/delivery-reviews.service';
import { DeliveryApprovedEventsService } from '../src/modules/delivery-reviews/delivery-approved-events.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { DatabaseService } from '../src/shared/database/database.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { createApplicationValidationPipe } from '../src/shared/validation/application-validation.pipe';

const contributor = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'contributor@example.com',
  role: 'contributor',
  status: 'active',
} as const;
const owner = {
  id: '77777777-7777-4777-8777-777777777777',
  email: 'owner@example.com',
  role: 'owner',
  status: 'active',
} as const;
const applicationId = '33333333-3333-4333-8333-333333333333';
const deliveryId = '55555555-5555-4555-8555-555555555555';
const idempotencyKey = '44444444-4444-4444-8444-444444444444';

describe('Delivery Reviews HTTP contract', () => {
  let app: INestApplication;
  let authenticated = true;
  let authenticatedActor: typeof contributor | typeof owner = contributor;
  const service = {
    submit: jest.fn(),
    update: jest.fn(),
    review: jest.fn(),
    getForActor: jest.fn(),
    listReviewQueue: jest.fn(),
    listContributorLifecycle: jest.fn(),
    listOwnerLifecycle: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DeliveryReviewsController],
      providers: [{ provide: DeliveryReviewsService, useValue: service }],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!authenticated) {
            throw new UnauthorizedException('Missing bearer token');
          }
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
    service.submit.mockResolvedValue({
      id: deliveryId,
      applicationId,
      contributionRequestId: '22222222-2222-4222-8222-222222222222',
      contributorId: contributor.id,
      pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/101',
      contributorNotes: 'Ready for review.',
      status: 'SUBMITTED',
      submittedAt: '2026-08-11T12:00:00.000Z',
      reviewedAt: null,
    });
    service.update.mockResolvedValue({
      id: deliveryId,
      applicationId,
      contributionRequestId: '22222222-2222-4222-8222-222222222222',
      contributorId: contributor.id,
      pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/102',
      contributorNotes: 'Corrected pull request.',
      status: 'SUBMITTED',
      submittedAt: '2026-08-11T12:10:00.000Z',
      reviewedAt: null,
    });
    service.review.mockResolvedValue({
      id: deliveryId,
      applicationId,
      contributionRequestId: '22222222-2222-4222-8222-222222222222',
      contributorId: contributor.id,
      pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/102',
      contributorNotes: 'Corrected pull request.',
      status: 'APPROVED',
      submissionNumber: 2,
      submittedAt: '2026-08-11T12:10:00.000Z',
      reviewedAt: '2026-08-11T13:00:00.000Z',
    });
    service.getForActor.mockResolvedValue({
      id: deliveryId,
      applicationId,
      status: 'SUBMITTED',
      submissions: [],
      reviews: [],
    });
    service.listReviewQueue.mockResolvedValue({
      deliveries: [{ id: deliveryId, status: 'SUBMITTED' }],
    });
    service.listContributorLifecycle.mockResolvedValue({ contributions: [] });
    service.listOwnerLifecycle.mockResolvedValue({ contributions: [] });
  });

  afterAll(async () => app.close());

  it('submits a GitHub pull request for an accepted Application', async () => {
    await request(app.getHttpServer())
      .post(`/applications/${applicationId}/deliveries`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/101',
        contributorNotes: 'Ready for review.',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: deliveryId,
          applicationId,
          pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/101',
          status: 'SUBMITTED',
        });
      });

    expect(service.submit).toHaveBeenCalledWith({
      actor: contributor,
      applicationId,
      pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/101',
      contributorNotes: 'Ready for review.',
      idempotencyKey,
    });
  });

  it('rejects a non-GitHub pull request URL before calling the module', async () => {
    await request(app.getHttpServer())
      .post(`/applications/${applicationId}/deliveries`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        pullRequestUrl: 'https://gitlab.com/ITI-Sharek/Sharek/merge_requests/101',
      })
      .expect(400);

    expect(service.submit).not.toHaveBeenCalled();
  });

  it('updates the pull request before owner review', async () => {
    await request(app.getHttpServer())
      .patch(`/deliveries/${deliveryId}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/102',
        contributorNotes: 'Corrected pull request.',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.pullRequestUrl).toBe(
          'https://github.com/ITI-Sharek/Sharek/pull/102',
        );
      });

    expect(service.update).toHaveBeenCalledWith({
      actor: contributor,
      deliveryId,
      pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/102',
      contributorNotes: 'Corrected pull request.',
      idempotencyKey,
    });
  });

  it('approves a submitted Delivery with a required owner rating', async () => {
    authenticatedActor = owner;

    await request(app.getHttpServer())
      .post(`/deliveries/${deliveryId}/reviews`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        outcome: 'APPROVED',
        rating: 5,
        feedback: 'Clean, complete implementation.',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('APPROVED');
      });

    expect(service.review).toHaveBeenCalledWith({
      actor: owner,
      deliveryId,
      outcome: 'APPROVED',
      rating: 5,
      feedback: 'Clean, complete implementation.',
      idempotencyKey,
    });
  });

  it('exposes participant detail and the owner review queue', async () => {
    await request(app.getHttpServer())
      .get(`/deliveries/${deliveryId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.id).toBe(deliveryId);
      });
    expect(service.getForActor).toHaveBeenCalledWith(contributor, deliveryId);

    authenticatedActor = owner;
    await request(app.getHttpServer())
      .get('/owner/deliveries')
      .expect(200)
      .expect(({ body }) => {
        expect(body.deliveries).toHaveLength(1);
      });
    expect(service.listReviewQueue).toHaveBeenCalledWith(owner);

    await request(app.getHttpServer())
      .get('/owner/delivery-lifecycle')
      .expect(200);
    expect(service.listOwnerLifecycle).toHaveBeenCalledWith(owner);
  });

  it('exposes the contributor composed Delivery lifecycle', async () => {
    service.listContributorLifecycle.mockResolvedValue({
      contributions: [
        {
          applicationId,
          lifecycleStatus: 'AWAITING_DELIVERY',
          deliveryStatus: 'NOT_STARTED',
          delivery: null,
        },
      ],
    });

    await request(app.getHttpServer())
      .get('/me/deliveries')
      .expect(200)
      .expect(({ body }) => {
        expect(body.contributions[0].lifecycleStatus).toBe('AWAITING_DELIVERY');
      });
    expect(service.listContributorLifecycle).toHaveBeenCalledWith(contributor);
  });
});

describe('Delivery submission workflow through HTTP', () => {
  let app: INestApplication;
  let workflowActor: typeof contributor | typeof owner = contributor;
  const createdAt = new Date('2026-08-11T12:00:00.000Z');
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: deliveryId }]),
    delivery: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      create: jest.fn().mockResolvedValue({
        id: deliveryId,
        application_id: applicationId,
        contribution_request_id: '22222222-2222-4222-8222-222222222222',
        contributor_id: contributor.id,
        pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/101',
        contributor_notes: 'Ready for review.',
        status: 'submitted',
        submitted_at: createdAt,
        reviewed_at: null,
      }),
    },
    deliverySubmission: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    deliveryReview: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
  };
  const database = {
    $transaction: jest.fn((work: (tx: typeof transaction) => unknown) =>
      work(transaction),
    ),
    delivery: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    deliverySubmission: { findUnique: jest.fn() },
    deliveryReview: { findUnique: jest.fn() },
  };
  const applications = {
    lockDeliverySubmissionContext: jest.fn().mockResolvedValue({
      applicationId,
      contributionRequestId: '22222222-2222-4222-8222-222222222222',
      contributorId: contributor.id,
      status: 'accepted',
    }),
    listDeliveryLifecycleContextsForContributor: jest.fn().mockResolvedValue([]),
    listDeliveryLifecycleContextsForOwner: jest.fn().mockResolvedValue([]),
  };
  const contributionTasks = {
    lockContributionRequestOwnerContext: jest.fn().mockResolvedValue({
      ownerId: '77777777-7777-4777-8777-777777777777',
    }),
    completeFromDeliveryReview: jest.fn().mockResolvedValue(undefined),
    confirmOwnerDecisionActor: jest.fn().mockResolvedValue(undefined),
    listDeliveryReviewScopesForOwner: jest.fn().mockResolvedValue([]),
    listDeliveryLifecycleScopesForOwner: jest.fn().mockResolvedValue([]),
  };
  const approvedEvents = {
    append: jest.fn().mockResolvedValue(undefined),
  };
  const notifications = {
    createDeliveryNotification: jest.fn().mockResolvedValue({
      notificationId: '99999999-9999-4999-8999-999999999999',
      created: true,
      deliveredRealtime: false,
    }),
    emitNotificationCreated: jest.fn().mockResolvedValue(true),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DeliveryReviewsController],
      providers: [
        DeliveryReviewsService,
        { provide: DatabaseService, useValue: database },
        { provide: ApplicationsService, useValue: applications },
        { provide: ContributionTasksService, useValue: contributionTasks },
        { provide: NotificationsService, useValue: notifications },
        { provide: DeliveryApprovedEventsService, useValue: approvedEvents },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = workflowActor;
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
    jest.clearAllMocks();
    workflowActor = contributor;
    database.$transaction.mockImplementation(
      (work: (tx: typeof transaction) => unknown) => work(transaction),
    );
    database.delivery.findUnique.mockResolvedValue(null);
    database.delivery.findMany.mockResolvedValue([]);
    database.deliverySubmission.findUnique.mockResolvedValue(null);
    database.deliveryReview.findUnique.mockResolvedValue(null);
    transaction.delivery.findUnique.mockResolvedValue(null);
    transaction.$queryRaw.mockResolvedValue([{ id: deliveryId }]);
    transaction.deliverySubmission.findUnique.mockResolvedValue(null);
    transaction.deliveryReview.findUnique.mockResolvedValue(null);
    transaction.delivery.create.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/101',
      contributor_notes: 'Ready for review.',
      status: 'submitted',
      submitted_at: createdAt,
      reviewed_at: null,
    });
    transaction.deliverySubmission.create.mockResolvedValue({});
    transaction.deliveryReview.create.mockResolvedValue({});
    applications.lockDeliverySubmissionContext.mockResolvedValue({
      applicationId,
      contributionRequestId: '22222222-2222-4222-8222-222222222222',
      contributorId: contributor.id,
      status: 'accepted',
    });
    contributionTasks.lockContributionRequestOwnerContext.mockResolvedValue({
      ownerId: '77777777-7777-4777-8777-777777777777',
    });
    contributionTasks.listDeliveryReviewScopesForOwner.mockResolvedValue([]);
    notifications.createDeliveryNotification.mockResolvedValue({
      notificationId: '99999999-9999-4999-8999-999999999999',
      created: true,
      deliveredRealtime: false,
    });
    notifications.emitNotificationCreated.mockResolvedValue(true);
    approvedEvents.append.mockResolvedValue(undefined);
  });

  afterAll(async () => app.close());

  it('creates the Delivery and durable owner Notification atomically', async () => {
    await request(app.getHttpServer())
      .post(`/applications/${applicationId}/deliveries`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/101',
        contributorNotes: 'Ready for review.',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: deliveryId,
          applicationId,
          status: 'SUBMITTED',
        });
      });

    expect(applications.lockDeliverySubmissionContext).toHaveBeenCalledWith({
      applicationId,
      contributorId: contributor.id,
      transaction,
    });
    expect(notifications.createDeliveryNotification).toHaveBeenCalledWith(
      {
        userId: '77777777-7777-4777-8777-777777777777',
        deliveryId,
        contributionRequestId: '22222222-2222-4222-8222-222222222222',
        action: 'submitted',
        submissionNumber: 1,
      },
      { transaction, emitRealtime: false },
    );
  });

  it('requires an idempotency key before starting the Delivery transaction', async () => {
    await request(app.getHttpServer())
      .post(`/applications/${applicationId}/deliveries`)
      .send({
        pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/101',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      });

    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an owner attempting a contributor Delivery command', async () => {
    workflowActor = owner;

    await request(app.getHttpServer())
      .post(`/applications/${applicationId}/deliveries`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/101',
      })
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe('DELIVERY_NOT_AUTHORIZED');
      });

    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('maps an unresolved uniqueness race to a stable Delivery conflict', async () => {
    database.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }) as never,
    );

    await request(app.getHttpServer())
      .patch(`/deliveries/${deliveryId}`)
      .set('Idempotency-Key', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      .send({
        pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/102',
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('DELIVERY_CONCURRENT_MODIFICATION');
      });
  });

  it('maps an unresolved initial-submission uniqueness race to a stable conflict', async () => {
    database.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }) as never,
    );
    database.delivery.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post(`/applications/${applicationId}/deliveries`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/101',
        contributorNotes: 'Ready for review.',
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      });
  });

  it('replays a committed initial submission after a uniqueness race', async () => {
    database.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }) as never,
    );
    const pullRequestUrl = 'https://github.com/ITI-Sharek/Sharek/pull/101';
    const contributorNotes = 'Ready for review.';
    database.delivery.findUnique.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      pr_url: pullRequestUrl,
      contributor_notes: contributorNotes,
      status: 'submitted',
      submission_number: 1,
      submitted_at: createdAt,
      reviewed_at: null,
      submission_idempotency_key: idempotencyKey,
      submission_fingerprint: createHash('sha256')
        .update(
          JSON.stringify({ applicationId, pullRequestUrl, contributorNotes }),
        )
        .digest('hex'),
    });

    await request(app.getHttpServer())
      .post(`/applications/${applicationId}/deliveries`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ pullRequestUrl, contributorNotes })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe(deliveryId);
      });
  });

  it('replays the existing Delivery for the same idempotency key', async () => {
    transaction.delivery.findUnique.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/101',
      contributor_notes: 'Ready for review.',
      status: 'submitted',
      submitted_at: createdAt,
      reviewed_at: null,
      submission_idempotency_key: idempotencyKey,
    });

    await request(app.getHttpServer())
      .post(`/applications/${applicationId}/deliveries`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/101',
        contributorNotes: 'Ready for review.',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.id).toBe(deliveryId);
      });

    expect(transaction.delivery.create).not.toHaveBeenCalled();
    expect(notifications.createDeliveryNotification).not.toHaveBeenCalled();
  });

  it('preserves a new submission version when the contributor corrects the PR', async () => {
    transaction.delivery.findUnique.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/101',
      contributor_notes: 'Ready for review.',
      status: 'submitted',
      submission_number: 1,
      submitted_at: createdAt,
      reviewed_at: null,
      submission_idempotency_key: idempotencyKey,
      submission_fingerprint: null,
    });
    transaction.delivery.update.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/102',
      contributor_notes: 'Corrected pull request.',
      status: 'submitted',
      submission_number: 2,
      submitted_at: new Date('2026-08-11T12:10:00.000Z'),
      reviewed_at: null,
    });

    await request(app.getHttpServer())
      .patch(`/deliveries/${deliveryId}`)
      .set('Idempotency-Key', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      .send({
        pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/102',
        contributorNotes: 'Corrected pull request.',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: deliveryId,
          pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/102',
          status: 'SUBMITTED',
          submissionNumber: 2,
        });
      });

    expect(transaction.deliverySubmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        delivery_id: deliveryId,
        submission_number: 2,
        contributor_id: contributor.id,
        pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/102',
      }),
    });
  });

  it('approves the current submission, completes the Request, and notifies the contributor', async () => {
    workflowActor = owner;
    transaction.delivery.findUnique.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/102',
      contributor_notes: 'Corrected pull request.',
      status: 'resubmitted',
      submission_number: 2,
      submitted_at: new Date('2026-08-11T12:10:00.000Z'),
      reviewed_at: null,
    });
    transaction.delivery.update.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/102',
      contributor_notes: 'Corrected pull request.',
      status: 'approved',
      submission_number: 2,
      submitted_at: new Date('2026-08-11T12:10:00.000Z'),
      reviewed_at: new Date('2026-08-11T13:00:00.000Z'),
    });

    await request(app.getHttpServer())
      .post(`/deliveries/${deliveryId}/reviews`)
      .set('Idempotency-Key', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
      .send({
        outcome: 'APPROVED',
        rating: 5,
        feedback: 'Clean, complete implementation.',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('APPROVED');
      });

    expect(transaction.deliveryReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        delivery_id: deliveryId,
        reviewer_id: owner.id,
        submission_number: 2,
        rating: 5,
        outcome: 'approved',
      }),
    });
    expect(contributionTasks.completeFromDeliveryReview).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: '22222222-2222-4222-8222-222222222222',
        ownerId: owner.id,
      }),
    );
    expect(approvedEvents.append).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId,
        contributorId: contributor.id,
        rating: 5,
      }),
      transaction,
    );
    expect(notifications.createDeliveryNotification).toHaveBeenCalledWith(
      {
        userId: contributor.id,
        deliveryId,
        contributionRequestId: '22222222-2222-4222-8222-222222222222',
        action: 'approved',
        submissionNumber: 2,
        rating: 5,
        feedback: 'Clean, complete implementation.',
      },
      { transaction, emitRealtime: false },
    );
  });

  it('requires a rating before an approval transaction starts', async () => {
    workflowActor = owner;

    await request(app.getHttpServer())
      .post(`/deliveries/${deliveryId}/reviews`)
      .set('Idempotency-Key', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
      .send({ outcome: 'APPROVED' })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('DELIVERY_RATING_REQUIRED');
      });

    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('reauthorizes the current Project owner before an idempotent review replay', async () => {
    workflowActor = owner;
    transaction.delivery.findUnique.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      status: 'approved',
      submission_number: 1,
    });
    contributionTasks.lockContributionRequestOwnerContext.mockResolvedValue({
      ownerId: '99999999-9999-4999-8999-999999999999',
    });

    await request(app.getHttpServer())
      .post(`/deliveries/${deliveryId}/reviews`)
      .set('Idempotency-Key', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
      .send({ outcome: 'APPROVED', rating: 5 })
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe('DELIVERY_NOT_AUTHORIZED');
      });
    expect(transaction.deliveryReview.findUnique).not.toHaveBeenCalled();
  });

  it('maps an unresolved review uniqueness race to a stable conflict', async () => {
    workflowActor = owner;
    database.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }) as never,
    );

    await request(app.getHttpServer())
      .post(`/deliveries/${deliveryId}/reviews`)
      .set('Idempotency-Key', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
      .send({ outcome: 'APPROVED', rating: 5 })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('DELIVERY_CONCURRENT_MODIFICATION');
      });
  });

  it('reauthorizes and replays a committed review after a uniqueness race', async () => {
    workflowActor = owner;
    const reviewKey = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    database.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }) as never,
    );
    database.deliveryReview.findUnique.mockResolvedValue({
      delivery_id: deliveryId,
      command_fingerprint: createHash('sha256')
        .update(
          JSON.stringify({
            deliveryId,
            outcome: 'approved',
            rating: 5,
            feedback: null,
          }),
        )
        .digest('hex'),
    });
    database.delivery.findUnique.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/101',
      contributor_notes: 'Ready for review.',
      status: 'approved',
      submission_number: 1,
      submitted_at: createdAt,
      reviewed_at: new Date('2026-08-11T13:00:00.000Z'),
    });

    await request(app.getHttpServer())
      .post(`/deliveries/${deliveryId}/reviews`)
      .set('Idempotency-Key', reviewKey)
      .send({ outcome: 'APPROVED', rating: 5 })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('APPROVED');
      });
    expect(contributionTasks.confirmOwnerDecisionActor).toHaveBeenCalledWith({
      requestId: '22222222-2222-4222-8222-222222222222',
      ownerId: owner.id,
    });
  });

  it('requests changes with required feedback without completing the Request', async () => {
    workflowActor = owner;
    transaction.delivery.findUnique.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      status: 'submitted',
      submission_number: 1,
    });
    transaction.delivery.update.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/101',
      contributor_notes: 'Ready for review.',
      status: 'changes_requested',
      submission_number: 1,
      submitted_at: createdAt,
      reviewed_at: new Date('2026-08-11T13:00:00.000Z'),
    });

    await request(app.getHttpServer())
      .post(`/deliveries/${deliveryId}/reviews`)
      .set('Idempotency-Key', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
      .send({
        outcome: 'CHANGES_REQUESTED',
        feedback: 'Please cover the expired-token path.',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('CHANGES_REQUESTED');
      });

    expect(transaction.deliveryReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rating: null,
        feedback: 'Please cover the expired-token path.',
        outcome: 'changes_requested',
      }),
    });
    expect(contributionTasks.completeFromDeliveryReview).not.toHaveBeenCalled();
  });

  it('resubmits after requested changes and preserves the next submission version', async () => {
    transaction.delivery.findUnique.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      status: 'changes_requested',
      submission_number: 1,
    });
    transaction.delivery.update.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/102',
      contributor_notes: 'Added expired-token coverage.',
      status: 'resubmitted',
      submission_number: 2,
      submitted_at: new Date('2026-08-11T14:00:00.000Z'),
      reviewed_at: null,
    });

    await request(app.getHttpServer())
      .patch(`/deliveries/${deliveryId}`)
      .set('Idempotency-Key', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')
      .send({
        pullRequestUrl: 'https://github.com/ITI-Sharek/Sharek/pull/102',
        contributorNotes: 'Added expired-token coverage.',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'RESUBMITTED',
          submissionNumber: 2,
        });
      });

    expect(notifications.createDeliveryNotification).toHaveBeenCalledWith(
      {
        userId: owner.id,
        deliveryId,
        contributionRequestId: '22222222-2222-4222-8222-222222222222',
        action: 'resubmitted',
        submissionNumber: 2,
      },
      { transaction, emitRealtime: false },
    );
  });

  it('rejects the current submission with required feedback and no rating', async () => {
    workflowActor = owner;
    transaction.delivery.findUnique.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      status: 'submitted',
      submission_number: 1,
    });
    transaction.delivery.update.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/101',
      contributor_notes: 'Ready for review.',
      status: 'rejected',
      submission_number: 1,
      submitted_at: createdAt,
      reviewed_at: new Date('2026-08-11T13:00:00.000Z'),
    });

    await request(app.getHttpServer())
      .post(`/deliveries/${deliveryId}/reviews`)
      .set('Idempotency-Key', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
      .send({
        outcome: 'REJECTED',
        feedback: 'The submitted work does not satisfy the core requirement.',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('REJECTED');
      });

    expect(transaction.deliveryReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rating: null,
        outcome: 'rejected',
      }),
    });
    expect(contributionTasks.completeFromDeliveryReview).not.toHaveBeenCalled();
  });

  it('returns immutable submission and review history to the assigned contributor', async () => {
    database.delivery.findUnique.mockResolvedValue({
      id: deliveryId,
      application_id: applicationId,
      contribution_request_id: '22222222-2222-4222-8222-222222222222',
      contributor_id: contributor.id,
      pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/102',
      contributor_notes: 'Added expired-token coverage.',
      status: 'changes_requested',
      submission_number: 2,
      submitted_at: new Date('2026-08-11T14:00:00.000Z'),
      reviewed_at: new Date('2026-08-11T15:00:00.000Z'),
      deliverySubmissions: [
        {
          submission_number: 1,
          pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/101',
          contributor_notes: 'Ready for review.',
          submitted_at: createdAt,
        },
        {
          submission_number: 2,
          pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/102',
          contributor_notes: 'Added expired-token coverage.',
          submitted_at: new Date('2026-08-11T14:00:00.000Z'),
        },
      ],
      deliveryReviews: [
        {
          id: '12121212-1212-4121-8121-121212121212',
          submission_number: 1,
          reviewer_id: owner.id,
          outcome: 'changes_requested',
          rating: null,
          feedback: 'Please cover the expired-token path.',
          created_at: new Date('2026-08-11T13:00:00.000Z'),
        },
      ],
      contributor: {
        id: contributor.id,
        username: 'contributor',
        first_name: 'Example',
        last_name: 'Contributor',
        avatar_url: null,
      },
    });

    await request(app.getHttpServer())
      .get(`/deliveries/${deliveryId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.submissions).toHaveLength(2);
        expect(body.reviews).toEqual([
          expect.objectContaining({
            submissionNumber: 1,
            outcome: 'CHANGES_REQUESTED',
            feedback: 'Please cover the expired-token path.',
          }),
        ]);
      });
  });

  it('lists submitted Deliveries with Contribution Request context for the owner queue', async () => {
    workflowActor = owner;
    contributionTasks.listDeliveryReviewScopesForOwner.mockResolvedValue([
      {
        contributionRequestId: '22222222-2222-4222-8222-222222222222',
        title: 'Add JWT authentication',
        requirements: [
          { kind: 'required', position: 0, text: 'Handle token expiry' },
        ],
      },
    ]);
    database.delivery.findMany.mockResolvedValue([
      {
        id: deliveryId,
        application_id: applicationId,
        contribution_request_id: '22222222-2222-4222-8222-222222222222',
        contributor_id: contributor.id,
        pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/102',
        contributor_notes: 'Ready for review.',
        status: 'submitted',
        submission_number: 2,
        submitted_at: createdAt,
        reviewed_at: null,
        contributor: {
          id: contributor.id,
          username: 'contributor',
          first_name: 'Example',
          last_name: 'Contributor',
          avatar_url: null,
        },
      },
    ]);

    await request(app.getHttpServer())
      .get('/owner/deliveries')
      .expect(200)
      .expect(({ body }) => {
        expect(body.deliveries).toEqual([
          expect.objectContaining({
            id: deliveryId,
            status: 'SUBMITTED',
            contributionRequest: {
              id: '22222222-2222-4222-8222-222222222222',
              title: 'Add JWT authentication',
              requirements: [
                {
                  kind: 'REQUIRED',
                  position: 0,
                  text: 'Handle token expiry',
                },
              ],
            },
          }),
        ]);
      });
  });

  it('derives NOT_STARTED for an accepted Assignment without a Delivery row', async () => {
    applications.listDeliveryLifecycleContextsForContributor.mockResolvedValue([
      {
        applicationId,
        contributionRequestId: '22222222-2222-4222-8222-222222222222',
        contributionRequestTitle: 'Add JWT authentication',
        contributorId: contributor.id,
        contributor: {
          id: contributor.id,
          username: 'contributor',
          displayName: 'Example Contributor',
          avatarUrl: null,
        },
        applicationStatus: 'ACCEPTED',
        deliveryDueAt: new Date('2026-08-25T12:00:00.000Z'),
        assignedAt: createdAt,
      },
    ]);
    database.delivery.findMany.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/me/deliveries')
      .expect(200)
      .expect(({ body }) => {
        expect(body.contributions).toEqual([
          expect.objectContaining({
            applicationId,
            contributionRequestTitle: 'Add JWT authentication',
            lifecycleStatus: 'AWAITING_DELIVERY',
            deliveryStatus: 'NOT_STARTED',
            delivery: null,
          }),
        ]);
      });
  });

  it('composes an approved Delivery as COMPLETED for the owner dashboard', async () => {
    workflowActor = owner;
    contributionTasks.listDeliveryLifecycleScopesForOwner.mockResolvedValue([
      {
        contributionRequestId: '22222222-2222-4222-8222-222222222222',
        title: 'Add JWT authentication',
      },
    ]);
    applications.listDeliveryLifecycleContextsForOwner.mockResolvedValue([
      {
        applicationId,
        contributionRequestId: '22222222-2222-4222-8222-222222222222',
        contributionRequestTitle: 'Add JWT authentication',
        contributorId: contributor.id,
        contributor: {
          id: contributor.id,
          username: 'contributor',
          displayName: 'Example Contributor',
          avatarUrl: null,
        },
        applicationStatus: 'ACCEPTED',
        deliveryDueAt: new Date('2026-08-25T12:00:00.000Z'),
        assignedAt: createdAt,
      },
    ]);
    database.delivery.findMany.mockResolvedValue([
      {
        id: deliveryId,
        application_id: applicationId,
        contribution_request_id: '22222222-2222-4222-8222-222222222222',
        contributor_id: contributor.id,
        pr_url: 'https://github.com/ITI-Sharek/Sharek/pull/101',
        contributor_notes: 'Ready for review.',
        status: 'approved',
        submission_number: 1,
        submitted_at: createdAt,
        reviewed_at: new Date('2026-08-11T13:00:00.000Z'),
      },
    ]);

    await request(app.getHttpServer())
      .get('/owner/delivery-lifecycle')
      .expect(200)
      .expect(({ body }) => {
        expect(body.contributions[0]).toMatchObject({
          lifecycleStatus: 'COMPLETED',
          deliveryStatus: 'APPROVED',
        });
      });
    expect(
      applications.listDeliveryLifecycleContextsForOwner,
    ).toHaveBeenCalledWith([
      '22222222-2222-4222-8222-222222222222',
    ]);
  });
});
