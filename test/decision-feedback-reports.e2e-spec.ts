import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { DecisionFeedbackReportsController } from '../src/modules/admin/controllers/decision-feedback-reports.controller';
import { DecisionFeedbackReportsService } from '../src/modules/admin/services/decision-feedback-reports.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';

const contributor = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'contributor@example.com',
  role: 'contributor',
  status: 'active',
} as const;
const ownerDecisionId = '22222222-2222-4222-8222-222222222222';

describe('Decision feedback report HTTP contract', () => {
  let app: INestApplication;
  const reports = {
    create: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DecisionFeedbackReportsController],
      providers: [
        { provide: DecisionFeedbackReportsService, useValue: reports },
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
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    reports.create.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      ownerDecisionId,
      reason: 'harassment',
      description: 'The feedback contains abusive language.',
      status: 'open',
      createdAt: new Date('2026-07-29T12:00:00.000Z'),
    });
  });

  afterAll(async () => app.close());

  it('creates a contributor report linked to the Owner Decision', async () => {
    await request(app.getHttpServer())
      .post(`/owner-decisions/${ownerDecisionId}/reports`)
      .send({
        reason: 'harassment',
        description: '  The feedback contains abusive language.  ',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.ownerDecisionId).toBe(ownerDecisionId);
        expect(body.status).toBe('open');
      });

    expect(reports.create).toHaveBeenCalledWith({
      actor: contributor,
      ownerDecisionId,
      reason: 'harassment',
      description: 'The feedback contains abusive language.',
    });
  });

  it('rejects a blank report description before calling the service', async () => {
    await request(app.getHttpServer())
      .post(`/owner-decisions/${ownerDecisionId}/reports`)
      .send({ reason: 'harassment', description: '   ' })
      .expect(400);

    expect(reports.create).not.toHaveBeenCalled();
  });
});
