import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { SkillGapGuidanceController } from '../src/modules/skill-guidance/skill-guidance.controller';
import { SkillGapGuidanceService } from '../src/modules/skill-guidance/skill-guidance.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import { createApplicationValidationPipe } from '../src/shared/validation/application-validation.pipe';

const contributor = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'contributor@example.com',
  role: 'contributor',
  status: 'active',
} as const;
const contributionRequestId = '22222222-2222-4222-8222-222222222222';

describe('Skill-gap guidance HTTP contract', () => {
  let app: INestApplication;
  let authenticated = true;
  const service = {
    generate: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SkillGapGuidanceController],
      providers: [{ provide: SkillGapGuidanceService, useValue: service }],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!authenticated) {
            throw new UnauthorizedException('Missing bearer token');
          }
          context.switchToHttp().getRequest().user = contributor;
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
    jest.resetAllMocks();
    service.generate.mockResolvedValue(guidanceResult());
  });

  afterAll(async () => app.close());

  it('returns structured guidance for an authenticated contributor request', async () => {
    await request(app.getHttpServer())
      .post('/contributors/me/skill-gap-guidance')
      .send({ contributionRequestId })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          kind: 'completed',
          missingSkills: [
            expect.objectContaining({
              skillName: 'Apache Airflow',
              gap: 'not_evidenced',
            }),
          ],
          learningResources: [
            expect.objectContaining({
              url: 'https://airflow.apache.org/docs/',
            }),
          ],
          sources: [
            {
              evidenceId: 'requirement:requirement-1',
              label: 'Data pipeline requirement',
              type: 'contribution_requirement',
            },
          ],
        });
      });

    expect(service.generate).toHaveBeenCalledWith(
      contributor,
      contributionRequestId,
    );
  });

  it('emits the final structured result through the SSE interface', async () => {
    await request(app.getHttpServer())
      .get(
        `/contributors/me/skill-gap-guidance/stream?contributionRequestId=${contributionRequestId}`,
      )
      .expect(200)
      .expect('Content-Type', /text\/event-stream/)
      .expect(({ text }) => {
        expect(text).toContain('event: guidance.completed');
        expect(text).toContain('"kind":"completed"');
        expect(text).toContain('Apache Airflow');
      });

    expect(service.generate).toHaveBeenCalledWith(
      contributor,
      contributionRequestId,
    );
  });

  it('rejects malformed request IDs before invoking guidance', async () => {
    await request(app.getHttpServer())
      .post('/contributors/me/skill-gap-guidance')
      .send({ contributionRequestId: 'not-a-uuid' })
      .expect(400);

    await request(app.getHttpServer())
      .get(
        '/contributors/me/skill-gap-guidance/stream?contributionRequestId=not-a-uuid',
      )
      .expect(400);

    expect(service.generate).not.toHaveBeenCalled();
  });

  it('requires authentication for both guidance transports', async () => {
    authenticated = false;

    await request(app.getHttpServer())
      .post('/contributors/me/skill-gap-guidance')
      .send({ contributionRequestId })
      .expect(401);
    await request(app.getHttpServer())
      .get(
        `/contributors/me/skill-gap-guidance/stream?contributionRequestId=${contributionRequestId}`,
      )
      .expect(401);
  });
});

function guidanceResult() {
  return {
    kind: 'completed' as const,
    missingSkills: [
      {
        requirementId: 'requirement-1',
        skillName: 'Apache Airflow',
        gap: 'not_evidenced' as const,
        explanation: 'Airflow is required but not in approved evidence.',
        evidenceIds: ['requirement:requirement-1'],
        uncertainty: [],
      },
    ],
    recommendedTechnologies: [
      {
        name: 'Apache Airflow',
        rationale: 'The published requirement names Airflow.',
        evidenceIds: ['requirement:requirement-1'],
      },
    ],
    learningResources: [
      {
        title: 'Apache Airflow documentation',
        resourceType: 'documentation' as const,
        url: 'https://airflow.apache.org/docs/',
        rationale: 'Primary documentation for the missing technology.',
        evidenceIds: ['requirement:requirement-1'],
      },
    ],
    practiceProjects: [
      {
        title: 'Build a scheduled pipeline',
        description: 'Create a small DAG with retries and monitoring.',
        technologies: ['Apache Airflow', 'Python'],
        evidenceIds: ['requirement:requirement-1'],
      },
    ],
    improvementPath: [
      {
        step: 'Learn DAG fundamentals',
        focus: 'Scheduling and retries',
        estimatedDuration: '2 weeks',
        evidenceIds: ['requirement:requirement-1'],
      },
    ],
    sources: [
      {
        evidenceId: 'requirement:requirement-1',
        label: 'Data pipeline requirement',
        type: 'contribution_requirement' as const,
      },
    ],
    metadata: {
      provider: 'fixture',
      model: 'fixture',
      promptVersion: 'skill-gap-guidance-v1',
      schemaVersion: 'skill-gap-guidance-v1',
      serviceVersion: 'test',
    },
  };
}
