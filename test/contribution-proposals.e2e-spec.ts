import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { ContributionProposalsController } from '../src/modules/contribution-proposals/contribution-proposals.controller';
import { ContributionProposalsService } from '../src/modules/contribution-proposals/contribution-proposals.service';
import { ContributionTasksService } from '../src/modules/contribution-tasks/services/contribution-tasks.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { DatabaseService } from '../src/shared/database/database.service';
import {
  ApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../src/shared/errors/application.error';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';

const contributor = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'contributor@example.com',
  role: 'contributor',
  status: 'active',
};
const projectId = '22222222-2222-4222-8222-222222222222';
const proposalId = '33333333-3333-4333-8333-333333333333';
const idempotencyKey = '44444444-4444-4444-8444-444444444444';
const proposalContent = {
  problemOrOpportunity:
    'The discovery feed repeats expensive repository-derived lookups.',
  proposedOutcome:
    'Introduce a Redis cache with explicit invalidation on publication.',
  projectBenefit:
    'Owners and contributors receive faster, more reliable discovery results.',
};
const revisedProposalContent = {
  problemOrOpportunity:
    'The discovery feed still repeats expensive repository-derived lookups.',
  proposedOutcome:
    'Add cache invalidation whenever a published Project changes.',
  projectBenefit:
    'Discovery remains fast without presenting stale Project information.',
};

describe('Contribution Proposals HTTP contract', () => {
  let app: INestApplication;
  let authenticated = true;
  const service = {
    submit: jest.fn(),
    submitVersion: jest.fn(),
    requestRevision: jest.fn(),
    accept: jest.fn(),
    decline: jest.fn(),
    reportMisuse: jest.fn(),
    withdraw: jest.fn(),
    getForActor: jest.fn(),
    listMine: jest.fn(),
    listForProject: jest.fn(),
    setIntake: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContributionProposalsController],
      providers: [
        { provide: ContributionProposalsService, useValue: service },
      ],
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
    service.submit.mockResolvedValue(proposalDto());
    service.submitVersion.mockResolvedValue(proposalDto({ currentVersion: 2 }));
    service.requestRevision.mockResolvedValue(
      proposalDto({ revisionRequestedAt: '2026-07-28T12:00:00.000Z' }),
    );
    service.accept.mockResolvedValue(
      proposalDto({
        status: 'ACCEPTED',
        acceptedAt: '2026-07-29T09:00:00.000Z',
        resultingContributionRequestId:
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        resultingContributionRequestStatus: 'DRAFT',
      }),
    );
    service.decline.mockResolvedValue(
      proposalDto({
        status: 'DECLINED',
        declinedAt: '2026-07-29T09:00:00.000Z',
        declineReason: 'Out of scope for this Project right now.',
      }),
    );
    service.reportMisuse.mockResolvedValue({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      proposalId,
      reporterId: contributor.id,
      reportedVersion: 1,
      reason: 'This proposal appears to copy another contributor’s work.',
      createdAt: '2026-07-29T09:00:00.000Z',
    });
    service.withdraw.mockResolvedValue(proposalDto({ status: 'WITHDRAWN' }));
    service.getForActor.mockResolvedValue(proposalDto());
    service.listMine.mockResolvedValue({
      proposals: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    service.listForProject.mockResolvedValue({
      proposals: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    service.setIntake.mockResolvedValue({ projectId, enabled: false });
  });

  afterAll(async () => app.close());

  it('submits a proposal with the disclosure acknowledgement', async () => {
    await request(app.getHttpServer())
      .post('/contribution-proposals')
      .send({
        projectId,
        title: 'Add a caching layer',
        ...proposalContent,
        acknowledgesAttributionAndAssignmentDisclosure: true,
        idempotencyKey,
      })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('PENDING'));

    expect(service.submit).toHaveBeenCalledWith({
      actor: contributor,
      projectId,
      title: 'Add a caching layer',
      ...proposalContent,
      idempotencyKey,
    });
  });

  it('rejects submission without the attribution-and-assignment disclosure', async () => {
    await request(app.getHttpServer())
      .post('/contribution-proposals')
      .send({
        projectId,
        title: 'Add a caching layer',
        ...proposalContent,
        acknowledgesAttributionAndAssignmentDisclosure: false,
        idempotencyKey,
      })
      .expect(400);

    expect(service.submit).not.toHaveBeenCalled();
  });

  it('requires every canonical proposal field and a UUID idempotency key', async () => {
    await request(app.getHttpServer())
      .post('/contribution-proposals')
      .send({
        projectId,
        title: 'Add a caching layer',
        ...proposalContent,
        proposedOutcome: 'too short',
        acknowledgesAttributionAndAssignmentDisclosure: true,
        idempotencyKey: 'not-a-uuid',
      })
      .expect(400);

    expect(service.submit).not.toHaveBeenCalled();
  });

  it('submits a new version to answer an owner revision request', async () => {
    await request(app.getHttpServer())
      .post(`/contribution-proposals/${proposalId}/versions`)
      .send({
        title: 'Add a caching layer v2',
        ...revisedProposalContent,
        idempotencyKey,
      })
      .expect(201)
      .expect(({ body }) => expect(body.currentVersion).toBe(2));

    expect(service.submitVersion).toHaveBeenCalledWith({
      actor: contributor,
      proposalId,
      title: 'Add a caching layer v2',
      ...revisedProposalContent,
      idempotencyKey,
    });
  });

  it('records an owner revision request', async () => {
    await request(app.getHttpServer())
      .post(`/contribution-proposals/${proposalId}/revision-requests`)
      .send({ reason: 'Please clarify the delivery scope.', idempotencyKey })
      .expect(201);

    expect(service.requestRevision).toHaveBeenCalledWith({
      actor: contributor,
      proposalId,
      reason: 'Please clarify the delivery scope.',
      idempotencyKey,
    });
  });

  it('withdraws a pending proposal idempotently', async () => {
    await request(app.getHttpServer())
      .post(`/contribution-proposals/${proposalId}/withdraw`)
      .set('Idempotency-Key', idempotencyKey)
      .send({})
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('WITHDRAWN'));

    expect(service.withdraw).toHaveBeenCalledWith({
      actor: contributor,
      proposalId,
      idempotencyKey,
    });
  });

  it('reads private proposal detail and scoped lists', async () => {
    await request(app.getHttpServer())
      .get(`/contribution-proposals/${proposalId}`)
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(proposalId));
    await request(app.getHttpServer())
      .get('/contribution-proposals/mine?limit=10')
      .expect(200);
    await request(app.getHttpServer())
      .get(`/contribution-proposals/for-project/${projectId}`)
      .expect(200);

    expect(service.getForActor).toHaveBeenCalledWith(contributor, proposalId);
    expect(service.listMine).toHaveBeenCalledWith(contributor, { limit: 10 });
    expect(service.listForProject).toHaveBeenCalledWith(
      contributor,
      projectId,
      {},
    );
  });

  it('rejects invalid proposal pagination input before calling the service', async () => {
    await request(app.getHttpServer())
      .get('/contribution-proposals/mine?limit=51')
      .expect(400);

    expect(service.listMine).not.toHaveBeenCalled();
  });

  it('toggles proposal intake for a project', async () => {
    await request(app.getHttpServer())
      .put(`/contribution-proposals/for-project/${projectId}/intake`)
      .send({ enabled: false })
      .expect(200)
      .expect(({ body }) => expect(body.enabled).toBe(false));

    expect(service.setIntake).toHaveBeenCalledWith(contributor, projectId, false);
  });

  it('serializes stable workflow errors and requires authentication', async () => {
    service.submit.mockRejectedValue(
      new ApplicationError(
        'Daily Contribution Proposal submission limit reached',
        'PROPOSAL_RATE_LIMITED',
        429,
        { dailyLimit: 10 },
      ),
    );
    await request(app.getHttpServer())
      .post('/contribution-proposals')
      .send({
        projectId,
        title: 'Add a caching layer',
        ...proposalContent,
        acknowledgesAttributionAndAssignmentDisclosure: true,
        idempotencyKey,
      })
      .expect(429)
      .expect(({ body }) => {
        expect(body.code).toBe('PROPOSAL_RATE_LIMITED');
        expect(body.metadata.dailyLimit).toBe(10);
      });

    service.submit.mockRejectedValue(
      new ConflictApplicationError(
        'Contribution Proposal intake is disabled for this Project',
        'PROPOSAL_INTAKE_DISABLED',
      ),
    );
    await request(app.getHttpServer())
      .post('/contribution-proposals')
      .send({
        projectId,
        title: 'Add a caching layer',
        ...proposalContent,
        acknowledgesAttributionAndAssignmentDisclosure: true,
        idempotencyKey,
      })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('PROPOSAL_INTAKE_DISABLED'));

    service.getForActor.mockRejectedValue(
      new NotFoundApplicationError(
        'Contribution Proposal was not found',
        'PROPOSAL_NOT_FOUND',
      ),
    );
    await request(app.getHttpServer())
      .get(`/contribution-proposals/${proposalId}`)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('PROPOSAL_NOT_FOUND'));

    service.submitVersion.mockRejectedValue(
      new ForbiddenApplicationError(
        'An active contributor account is required',
        'PROPOSAL_NOT_AUTHORIZED',
      ),
    );
    await request(app.getHttpServer())
      .post(`/contribution-proposals/${proposalId}/versions`)
      .send({
        title: 'Add a caching layer v2',
        ...revisedProposalContent,
        idempotencyKey,
      })
      .expect(403);

    authenticated = false;
    await request(app.getHttpServer())
      .get('/contribution-proposals/mine')
      .expect(401);
  });

  it('accepts a proposal and returns the resulting draft Request id', async () => {
    await request(app.getHttpServer())
      .post(`/contribution-proposals/${proposalId}/accept`)
      .send({ idempotencyKey })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ACCEPTED');
        expect(body.resultingContributionRequestId).toBe(
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        );
        expect(body.resultingContributionRequestStatus).toBe('DRAFT');
      });

    expect(service.accept).toHaveBeenCalledWith({
      actor: contributor,
      proposalId,
      idempotencyKey,
    });
  });

  it('declines a proposal with a contributor-visible reason', async () => {
    await request(app.getHttpServer())
      .post(`/contribution-proposals/${proposalId}/decline`)
      .send({
        reason: 'Out of scope for this Project right now.',
        idempotencyKey,
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('DECLINED');
        expect(body.declineReason).toBe(
          'Out of scope for this Project right now.',
        );
      });

    expect(service.decline).toHaveBeenCalledWith({
      actor: contributor,
      proposalId,
      reason: 'Out of scope for this Project right now.',
      idempotencyKey,
    });
  });

  it('rejects a decline without a reason', async () => {
    await request(app.getHttpServer())
      .post(`/contribution-proposals/${proposalId}/decline`)
      .send({ idempotencyKey })
      .expect(400);

    expect(service.decline).not.toHaveBeenCalled();
  });

  it('files a misuse report and echoes the preserved evidence pointer', async () => {
    await request(app.getHttpServer())
      .post(`/contribution-proposals/${proposalId}/misuse-reports`)
      .send({
        reason: 'This proposal appears to copy another contributor’s work.',
        idempotencyKey,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.proposalId).toBe(proposalId);
        expect(body.reportedVersion).toBe(1);
      });

    expect(service.reportMisuse).toHaveBeenCalledWith({
      actor: contributor,
      proposalId,
      reason: 'This proposal appears to copy another contributor’s work.',
      idempotencyKey,
    });
  });

  it('serializes the accept conflict when a proposal is already terminal', async () => {
    service.accept.mockRejectedValue(
      new ConflictApplicationError(
        'Only a pending Contribution Proposal can be accepted',
        'PROPOSAL_TERMINAL',
      ),
    );
    await request(app.getHttpServer())
      .post(`/contribution-proposals/${proposalId}/accept`)
      .send({ idempotencyKey })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('PROPOSAL_TERMINAL'));
  });
});

describe('Contribution Proposals HTTP-to-service transaction seam', () => {
  let app: INestApplication;
  const database = {
    contributionProposal: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    contributionProposalVersion: { create: jest.fn() },
    contributionProposalAudit: { findFirst: jest.fn(), create: jest.fn() },
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const projects = {
    lockProposalProjectContext: jest.fn(),
  };
  const contributionTasks = {
    createDraftFromAcceptedProposal: jest.fn(),
  };
  const notifications = {
    createProposalNotification: jest.fn(),
    emitProposalNotifications: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContributionProposalsController],
      providers: [
        ContributionProposalsService,
        { provide: DatabaseService, useValue: database },
        { provide: ProjectsService, useValue: projects },
        { provide: ContributionTasksService, useValue: contributionTasks },
        { provide: NotificationsService, useValue: notifications },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
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
    jest.resetAllMocks();
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) =>
        callback(database),
    );
    database.contributionProposalAudit.findFirst.mockResolvedValue(null);
    database.contributionProposal.findFirst.mockResolvedValue(null);
    database.contributionProposal.count.mockResolvedValue(0);
    database.contributionProposal.create.mockResolvedValue({});
    database.contributionProposalVersion.create.mockResolvedValue({});
    database.contributionProposalAudit.create.mockResolvedValue({});
    database.$executeRaw.mockResolvedValue(1);
    database.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ enabled: true }]);
    database.contributionProposal.findUniqueOrThrow.mockResolvedValue(
      proposalPersistenceRecord(),
    );
    projects.lockProposalProjectContext.mockResolvedValue({
      id: projectId,
      ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'published',
    });
  });

  afterAll(async () => app.close());

  it('reaches the transactional invariant checks before persisting an HTTP submission', async () => {
    await request(app.getHttpServer())
      .post('/contribution-proposals')
      .send({
        projectId,
        title: 'Add a caching layer',
        ...proposalContent,
        acknowledgesAttributionAndAssignmentDisclosure: true,
        idempotencyKey,
      })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('PENDING'));

    expect(database.$transaction).toHaveBeenCalledTimes(1);
    expect(projects.lockProposalProjectContext).toHaveBeenCalledWith(
      projectId,
      database,
    );
    expect(database.contributionProposal.count).toHaveBeenCalledTimes(1);
    expect(database.contributionProposal.create).toHaveBeenCalledTimes(1);
  });
});

function proposalDto(overrides: Record<string, unknown> = {}) {
  return {
    id: proposalId,
    projectId,
    proposerId: contributor.id,
    status: 'PENDING',
    currentVersion: 1,
    disclosure: {
      version: '2026-07-attribution-assignment',
      acknowledgedAt: '2026-07-28T09:00:00.000Z',
    },
    revisionRequestedAt: null,
    acceptedAt: null,
    declinedAt: null,
    declineReason: null,
    resultingContributionRequestId: null,
    resultingContributionRequestStatus: null,
    latestVersion: {
      version: 1,
      title: 'Add a caching layer',
      ...proposalContent,
      authoredBy: contributor.id,
      createdAt: '2026-07-28T09:00:00.000Z',
    },
    versions: [
      {
        version: 1,
        title: 'Add a caching layer',
        ...proposalContent,
        authoredBy: contributor.id,
        createdAt: '2026-07-28T09:00:00.000Z',
      },
    ],
    revisionRequests: [],
    createdAt: '2026-07-28T09:00:00.000Z',
    updatedAt: '2026-07-28T09:00:00.000Z',
    ...overrides,
  };
}

function proposalPersistenceRecord() {
  const timestamp = new Date('2026-07-28T09:00:00.000Z');
  return {
    id: proposalId,
    project_id: projectId,
    proposer_id: contributor.id,
    status: 'pending',
    current_version: 1,
    revision_request_sequence: 0,
    disclosure_version: '2026-07-attribution-assignment',
    disclosure_acknowledged_at: timestamp,
    revision_requested_at: null,
    withdrawn_at: null,
    proposer: {
      id: contributor.id,
      username: 'nour',
      first_name: 'Nour',
      last_name: 'Hassan',
    },
    created_at: timestamp,
    updated_at: timestamp,
    versions: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        proposal_id: proposalId,
        version: 1,
        title: 'Add a caching layer',
        problem_or_opportunity: proposalContent.problemOrOpportunity,
        proposed_outcome: proposalContent.proposedOutcome,
        project_benefit: proposalContent.projectBenefit,
        authored_by: contributor.id,
        created_at: timestamp,
      },
    ],
    auditEvents: [],
  };
}
