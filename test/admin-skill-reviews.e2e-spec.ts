import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AdminSkillReviewsController } from '../src/modules/admin/controllers/admin-skill-reviews.controller';
import { SkillProfilesReviewService } from '../src/modules/skill-profiles/services/skill-profiles-review.service';
import { AuthenticatedUser } from '../src/shared/auth/authenticated-request';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { RolesGuard } from '../src/shared/auth/guards/roles.guard';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';

const skillProfileId = '11111111-1111-4111-8111-111111111111';

describe('Admin skill review HTTP routes', () => {
  let app: INestApplication;
  let currentUser: AuthenticatedUser;
  const skillReviews = {
    listPendingReviews: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 }),
    approve: jest.fn().mockResolvedValue({ skill: { skillProfileId }, decision: { decisionId: 'decision-1' } }),
    reject: jest.fn().mockResolvedValue({ skill: { skillProfileId }, decision: { decisionId: 'decision-2' } }),
    adjustProficiency: jest.fn().mockResolvedValue({ skill: { skillProfileId }, decision: { decisionId: 'decision-3' } }),
  };

  beforeAll(async () => {
    currentUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
      status: 'active',
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminSkillReviewsController],
      providers: [
        RolesGuard,
        {
          provide: SkillProfilesReviewService,
          useValue: skillReviews,
        },
      ],
      })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = currentUser;
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
    jest.clearAllMocks();
    currentUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
      status: 'active',
    };
  });

  afterAll(async () => {
    await app?.close();
  });

  it('lists pending reviews for admins with validated pagination', async () => {
    await request(app.getHttpServer())
      .get('/admin/skill-reviews/pending?page=2&limit=5')
      .expect(200);

    expect(skillReviews.listPendingReviews).toHaveBeenCalledWith({
      admin: currentUser,
      page: 2,
      limit: 5,
    });
  });

  it('blocks non-admin users at the route layer', async () => {
    currentUser = {
      id: 'user-1',
      email: 'contributor@example.com',
      role: 'contributor',
      status: 'active',
    };

    await request(app.getHttpServer())
      .get('/admin/skill-reviews/pending')
      .expect(403);
    expect(skillReviews.listPendingReviews).not.toHaveBeenCalled();
  });

  it('routes approve, reject, and proficiency adjustment actions', async () => {
    await request(app.getHttpServer())
      .post(`/admin/skill-reviews/${skillProfileId}/approve`)
      .send({ proficiency: 'advanced', notes: 'Strong evidence' })
      .expect(200);
    expect(skillReviews.approve).toHaveBeenCalledWith({
      admin: currentUser,
      skillProfileId,
      proficiency: 'advanced',
      notes: 'Strong evidence',
    });

    await request(app.getHttpServer())
      .post(`/admin/skill-reviews/${skillProfileId}/reject`)
      .send({ notes: 'Weak evidence' })
      .expect(200);
    expect(skillReviews.reject).toHaveBeenCalledWith({
      admin: currentUser,
      skillProfileId,
      notes: 'Weak evidence',
    });

    await request(app.getHttpServer())
      .patch(`/admin/skill-reviews/${skillProfileId}/proficiency`)
      .send({ proficiency: 'intermediate' })
      .expect(200);
    expect(skillReviews.adjustProficiency).toHaveBeenCalledWith({
      admin: currentUser,
      skillProfileId,
      proficiency: 'intermediate',
      notes: undefined,
    });
  });
});
