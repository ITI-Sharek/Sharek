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
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import {
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

describe('Contribution Proposals HTTP contract', () => {
  let app: INestApplication;
  let authenticated = true;
  const service = {
    submit: jest.fn(),
    submitVersion: jest.fn(),
    requestRevision: jest.fn(),
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
    service.withdraw.mockResolvedValue(proposalDto({ status: 'WITHDRAWN' }));
    service.getForActor.mockResolvedValue(proposalDto());
    service.listMine.mockResolvedValue({ proposals: [] });
    service.listForProject.mockResolvedValue({ proposals: [] });
    service.setIntake.mockResolvedValue({ projectId, enabled: false });
  });

  afterAll(async () => app.close());

  it('submits a proposal with the disclosure acknowledgement', async () => {
    await request(app.getHttpServer())
      .post('/contribution-proposals')
      .send({
        projectId,
        title: 'Add a caching layer',
        body: 'Introduce a Redis caching layer for the discovery feed.',
        acknowledgesAttributionAndAssignmentDisclosure: true,
        idempotencyKey,
      })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('PENDING'));

    expect(service.submit).toHaveBeenCalledWith({
      actor: contributor,
      projectId,
      title: 'Add a caching layer',
      body: 'Introduce a Redis caching layer for the discovery feed.',
      idempotencyKey,
    });
  });

  it('rejects submission without the attribution-and-assignment disclosure', async () => {
    await request(app.getHttpServer())
      .post('/contribution-proposals')
      .send({
        projectId,
        title: 'Add a caching layer',
        body: 'Introduce a Redis caching layer for the discovery feed.',
        acknowledgesAttributionAndAssignmentDisclosure: false,
        idempotencyKey,
      })
      .expect(400);

    expect(service.submit).not.toHaveBeenCalled();
  });

  it('requires a UUID idempotency key and a non-trivial body', async () => {
    await request(app.getHttpServer())
      .post('/contribution-proposals')
      .send({
        projectId,
        title: 'Add a caching layer',
        body: 'too short',
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
        body: 'Revised: add cache invalidation when a project is published.',
        idempotencyKey,
      })
      .expect(201)
      .expect(({ body }) => expect(body.currentVersion).toBe(2));

    expect(service.submitVersion).toHaveBeenCalledWith({
      actor: contributor,
      proposalId,
      title: 'Add a caching layer v2',
      body: 'Revised: add cache invalidation when a project is published.',
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
      .get('/contribution-proposals/mine')
      .expect(200);
    await request(app.getHttpServer())
      .get(`/contribution-proposals/for-project/${projectId}`)
      .expect(200);

    expect(service.getForActor).toHaveBeenCalledWith(contributor, proposalId);
    expect(service.listMine).toHaveBeenCalledWith(contributor);
    expect(service.listForProject).toHaveBeenCalledWith(contributor, projectId);
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
      new ConflictApplicationError(
        'A pending Contribution Proposal already exists for this Project',
        'PROPOSAL_ALREADY_PENDING',
      ),
    );
    await request(app.getHttpServer())
      .post('/contribution-proposals')
      .send({
        projectId,
        title: 'Add a caching layer',
        body: 'Introduce a Redis caching layer for the discovery feed.',
        acknowledgesAttributionAndAssignmentDisclosure: true,
        idempotencyKey,
      })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('PROPOSAL_ALREADY_PENDING'));

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
        body: 'Revised: add cache invalidation when a project is published.',
        idempotencyKey,
      })
      .expect(403);

    authenticated = false;
    await request(app.getHttpServer())
      .get('/contribution-proposals/mine')
      .expect(401);
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
    latestVersion: {
      version: 1,
      title: 'Add a caching layer',
      body: 'Introduce a Redis caching layer for the discovery feed.',
      authoredBy: contributor.id,
      createdAt: '2026-07-28T09:00:00.000Z',
    },
    versions: [
      {
        version: 1,
        title: 'Add a caching layer',
        body: 'Introduce a Redis caching layer for the discovery feed.',
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
