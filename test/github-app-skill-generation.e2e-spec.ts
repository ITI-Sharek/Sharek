import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { SkillProfilesController } from '../src/modules/skill-profiles/controllers/skill-profiles.controller';
import { SkillProfilesService } from '../src/modules/skill-profiles/skill-profiles.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';

const installationLinkId = '11111111-1111-4111-8111-111111111111';
const priorGenerationId = '22222222-2222-4222-8222-222222222222';
const newGenerationId = '33333333-3333-4333-8333-333333333333';
const consent = { accepted: true, version: 'github-skill-analysis-v1' };

describe('GitHub App explicit skill-generation HTTP contract', () => {
  let app: INestApplication;
  const service = {
    startGeneration: jest.fn().mockResolvedValue({
      generationId: priorGenerationId,
      status: 'queued',
    }),
    retryGeneration: jest.fn().mockResolvedValue({
      generationId: newGenerationId,
      retryOfGenerationId: priorGenerationId,
      status: 'queued',
    }),
    getLatestGeneration: jest.fn().mockResolvedValue({
      generationId: priorGenerationId,
      status: 'queued',
    }),
    getGeneration: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SkillProfilesController],
      providers: [{ provide: SkillProfilesService, useValue: service }],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = {
            id: 'user-1',
            email: 'contributor@example.com',
            role: 'contributor',
            status: 'active',
          };
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

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app?.close());

  it('does not generate anything merely because registration, linking, or installation occurred', () => {
    expect(service.startGeneration).not.toHaveBeenCalled();
    expect(service.retryGeneration).not.toHaveBeenCalled();
  });

  it('requires explicit versioned consent and repository IDs', async () => {
    await request(app.getHttpServer())
      .post('/skill-profiles/me/generations')
      .send({ installationLinkId, repositoryIds: ['101'] })
      .expect(400);
    expect(service.startGeneration).not.toHaveBeenCalled();
  });

  it('accepts an explicit start and returns durable queued state within three seconds', async () => {
    const startedAt = Date.now();
    const response = await request(app.getHttpServer())
      .post('/skill-profiles/me/generations')
      .send({ installationLinkId, repositoryIds: ['101', '202'], consent })
      .expect(201);

    expect(Date.now() - startedAt).toBeLessThan(3_000);
    expect(response.body).toMatchObject({
      generationId: priorGenerationId,
      status: 'queued',
    });
    expect(service.startGeneration).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: 'user-1' }),
      installationLinkId,
      repositoryIds: ['101', '202'],
      consent,
    });
  });

  it('recovers the latest generation after frontend state is lost', async () => {
    const response = await request(app.getHttpServer())
      .get('/skill-profiles/me/generations/latest')
      .expect(200);

    expect(response.body).toMatchObject({
      generationId: priorGenerationId,
      status: 'queued',
    });
    expect(service.getLatestGeneration).toHaveBeenCalledWith('user-1');
    expect(service.getGeneration).not.toHaveBeenCalled();
  });

  it('reconfirms consent and returns a new generation without reconnecting', async () => {
    const response = await request(app.getHttpServer())
      .post(`/skill-profiles/me/generations/${priorGenerationId}/retry`)
      .send({ consent })
      .expect(201);

    expect(response.body).toMatchObject({
      generationId: newGenerationId,
      retryOfGenerationId: priorGenerationId,
      status: 'queued',
    });
    expect(service.retryGeneration).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: 'user-1' }),
      generationId: priorGenerationId,
      consent,
    });
    expect(service.startGeneration).not.toHaveBeenCalled();
  });
});
