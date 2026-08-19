import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { MatchingService } from '../src/modules/matching/matching.service';
import { RecommendationsController } from '../src/modules/matching/recommendations.controller';
import { RecommendedTasksService } from '../src/modules/matching/recommended-tasks.service';
import { AuthenticatedUser } from '../src/shared/auth/authenticated-request';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { RolesGuard } from '../src/shared/auth/guards/roles.guard';
import { DatabaseService } from '../src/shared/database/database.service';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';

/**
 * Asserted against the frontend's
 * `Frontend/src/modules/matching/types/matching.types.ts`, which the settings
 * and dashboard surfaces already type this route with.
 *
 * `RecommendedTaskDto` there has no `matchScore`, by DEC-010. These tests treat
 * its absence as part of the contract rather than an implementation detail.
 */
const FRONTEND_TASK_FIELDS = [
  'requestId',
  'projectName',
  'title',
  'rank',
  'confidence',
  'justification',
  'matchedSkills',
  'requiredSkillNames',
  'matchedRequiredSkillNames',
  'matchedRequiredCount',
  'requiredSkillCount',
  'applicationsCloseAt',
  'targetCompletionDate',
  'difficulty',
  'reward',
  'rewardCurrency',
].sort();
const FRONTEND_MATCHED_SKILL_FIELDS = [
  'name',
  'proficiency',
  'evidenceIds',
].sort();

const contributor: AuthenticatedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'contributor@example.com',
  role: 'contributor',
  status: 'active',
};
const owner: AuthenticatedUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'owner@example.com',
  role: 'owner',
  status: 'active',
};

describe('GET /contributors/me/recommended-tasks HTTP integration', () => {
  let app: INestApplication;
  let currentUser: AuthenticatedUser | null = contributor;

  const matching = { shortlistForContributor: jest.fn() };
  const database = {
    aiMatchResult: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RecommendationsController],
      providers: [
        RecommendedTasksService,
        Reflector,
        RolesGuard,
        { provide: MatchingService, useValue: matching },
        { provide: DatabaseService, useValue: database },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!currentUser) {
            throw new UnauthorizedException('Missing bearer token');
          }
          context.switchToHttp().getRequest().user = currentUser;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    jest.resetAllMocks();
    currentUser = contributor;
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) =>
        callback(database),
    );
    database.aiMatchResult.deleteMany.mockResolvedValue({ count: 0 });
    database.aiMatchResult.createMany.mockResolvedValue({ count: 1 });
    matching.shortlistForContributor.mockResolvedValue({
      planType: 'gold',
      reason: null,
      matches: [
        {
          request: {
            id: '33333333-3333-4333-8333-333333333331',
            projectId: '44444444-4444-4444-8444-444444444441',
            projectName: 'Share-k API',
            ownerId: owner.id,
            title: 'Build the ingestion worker',
            technologyTags: ['NestJS'],
            requirementTexts: ['Write tested services.'],
            difficulty: 'intermediate',
            applicationsCloseAt: new Date('2026-09-01T00:00:00.000Z'),
            targetCompletionDate: null,
            reward: null,
            rewardCurrency: null,
            publishedAt: new Date('2026-08-10T00:00:00.000Z'),
          },
          rank: 1,
          matchedSkills: [
            {
              name: 'NestJS',
              proficiency: 'advanced',
              evidenceIds: ['github:sharek/api'],
            },
          ],
          exceededSkills: [],
          requiredSkillNames: ['NestJS', 'PostgreSQL'],
          matchedRequiredSkillNames: ['NestJS'],
          matchedRequiredCount: 1,
          requiredSkillCount: 2,
          confidence: 'HIGH',
        },
      ],
    });
  });

  it('matches the frontend RecommendedTaskDto field for field', async () => {
    await request(app.getHttpServer())
      .get('/contributors/me/recommended-tasks')
      .expect(200)
      .expect(({ body }) => {
        expect(Object.keys(body).sort()).toEqual(
          ['planType', 'recommendations', 'reason'].sort(),
        );
        for (const recommendation of body.recommendations) {
          expect(Object.keys(recommendation).sort()).toEqual(
            FRONTEND_TASK_FIELDS,
          );
          for (const skill of recommendation.matchedSkills) {
            expect(Object.keys(skill).sort()).toEqual(
              FRONTEND_MATCHED_SKILL_FIELDS,
            );
          }
          expect(['HIGH', 'MEDIUM', 'LOW']).toContain(recommendation.confidence);
        }
      });
  });

  it('carries the fit gauge as two counts of the required bar', async () => {
    await request(app.getHttpServer())
      .get('/contributors/me/recommended-tasks')
      .expect(200)
      .expect((response) => {
        const [task] = response.body.recommendations;
        // The numerator is the required bar, not the matched-skill list. The
        // dashboard gauge divides these two, and feeding it the same number
        // twice drew every match as a complete one.
        expect(task.matchedRequiredCount).toBe(1);
        expect(task.requiredSkillCount).toBe(2);
        expect(task.requiredSkillNames).toEqual(['NestJS', 'PostgreSQL']);
        expect(task.matchedRequiredSkillNames).toEqual(['NestJS']);
        expect(task.matchedRequiredCount).toBeLessThanOrEqual(
          task.requiredSkillCount,
        );
      });
  });

  it('carries a rank and a confidence band, and never a score', async () => {
    await request(app.getHttpServer())
      .get('/contributors/me/recommended-tasks')
      .expect(200)
      .expect(({ body, text }) => {
        expect(body.recommendations[0].rank).toBe(1);
        expect(text).not.toContain('matchScore');
        expect(text).not.toContain('match_score');
        expect(text).not.toContain('%');
      });
  });

  it('answers a free contributor 200 with an empty list, not 403', async () => {
    matching.shortlistForContributor.mockResolvedValue({
      planType: 'free',
      matches: [],
      reason: 'MATCHING_REQUIRES_SUBSCRIPTION',
    });

    await request(app.getHttpServer())
      .get('/contributors/me/recommended-tasks')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          planType: 'free',
          recommendations: [],
          reason: 'MATCHING_REQUIRES_SUBSCRIPTION',
        });
      });
  });

  it('refuses an unauthenticated caller', async () => {
    currentUser = null;

    await request(app.getHttpServer())
      .get('/contributors/me/recommended-tasks')
      .expect(401);
  });

  it('refuses an owner: this is a contributor benefit', async () => {
    currentUser = owner;

    await request(app.getHttpServer())
      .get('/contributors/me/recommended-tasks')
      .expect(403);
  });

  it('reads the caller and exposes no route to another contributor', async () => {
    await request(app.getHttpServer())
      .get(`/contributors/me/recommended-tasks?contributorId=${owner.id}`)
      .expect(200);

    expect(matching.shortlistForContributor).toHaveBeenCalledWith(
      expect.objectContaining({ contributorId: contributor.id }),
    );
  });
});
