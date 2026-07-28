import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { ContributorProfilesController } from '../src/modules/contributor-profiles/contributor-profiles.controller';
import { ContributorProfilesService } from '../src/modules/contributor-profiles/contributor-profiles.service';
import { ManualAuthController } from '../src/modules/identity/controllers/manual-auth.controller';
import { AuthService } from '../src/modules/identity/services/auth.service';
import { PasswordResetService } from '../src/modules/identity/services/password-reset.service';
import { ProjectsController } from '../src/modules/projects/projects.controller';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { ProjectPublicationService } from '../src/modules/projects/services/project-publication.service';
import { SkillProfileSummaryService } from '../src/modules/skill-profiles/services/skill-profile-summary.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { RolesGuard } from '../src/shared/auth/guards/roles.guard';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';

describe('Optional GitHub contributor journey', () => {
  let app: INestApplication;
  const activeContributor = {
    id: 'user-1',
    email: 'contributor@example.com',
    username: 'contributor-one',
    role: 'contributor',
    status: 'active',
  };
  const authService = {
    verifyEmail: jest.fn().mockResolvedValue({ user: activeContributor }),
  };
  const profilesService = {
    ensure: jest.fn().mockResolvedValue({
      username: 'contributor-one',
      githubInstallations: [],
      skills: [],
    }),
    update: jest.fn().mockResolvedValue({
      username: 'contributor-one',
      bio: 'Backend contributor',
      githubInstallations: [],
    }),
    getByUsername: jest.fn().mockResolvedValue({
      username: 'contributor-one',
      bio: 'Backend contributor',
      githubInstallations: [],
      skills: [],
    }),
  };
  const projectsService = {
    discoverPublishedProjects: jest.fn().mockResolvedValue({
      items: [{ id: 'project-1', title: 'Open project' }],
      page: 1,
      limit: 20,
      total: 1,
    }),
  };
  const eligibilityDatabase = {
    skillProfile: { findMany: jest.fn().mockResolvedValue([]) },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        ManualAuthController,
        ContributorProfilesController,
        ProjectsController,
      ],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PasswordResetService, useValue: {} },
        { provide: ContributorProfilesService, useValue: profilesService },
        { provide: ProjectsService, useValue: projectsService },
        { provide: ProjectPublicationService, useValue: {} },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = activeContributor;
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
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

  it('activates by email and keeps profile/discovery usable without any GitHub provider', async () => {
    const verify = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ email: 'contributor@example.com', code: '123456' })
      .expect(201);
    expect(verify.body.user.status).toBe('active');

    await request(app.getHttpServer())
      .post('/contributors/profiles/me/ensure')
      .expect(201)
      .expect(({ body }) => expect(body.githubInstallations).toEqual([]));
    await request(app.getHttpServer())
      .patch('/contributors/profiles/me')
      .send({ bio: 'Backend contributor' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/contributors/profiles/contributor-one')
      .expect(200);
    await request(app.getHttpServer())
      .get('/projects/discover')
      .expect(200)
      .expect(({ body }) => expect(body.items).toHaveLength(1));
  });

  it('returns no eligibility skills while leaving ordinary routes unaffected', async () => {
    const eligibility = new SkillProfileSummaryService(
      eligibilityDatabase as never,
    );
    await expect(
      eligibility.listApprovedSkillsForEligibility('user-1'),
    ).resolves.toEqual([]);
    expect(eligibilityDatabase.skillProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: 'user-1', status: 'approved' }),
      }),
    );

    await request(app.getHttpServer())
      .get('/projects/discover')
      .expect(200);
  });
});
