import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { ProjectsController } from '../src/modules/projects/projects.controller';
import { PublicProjectsController } from '../src/modules/projects/public-projects.controller';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { ProjectPublicationService } from '../src/modules/projects/services/project-publication.service';
import { PublicProjectsService } from '../src/modules/projects/services/public-projects.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { RolesGuard } from '../src/shared/auth/guards/roles.guard';
import { ApplicationError } from '../src/shared/errors/application.error';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';

describe('Project publication HTTP contract', () => {
  let app: INestApplication;
  const actor = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'owner@example.com',
    role: 'owner',
    status: 'active',
  };
  const publication = {
    preview: jest.fn().mockResolvedValue({ previewFingerprint: 'a'.repeat(64) }),
    createDraft: jest.fn().mockResolvedValue({ id: 'project-id', status: 'draft' }),
    getOwnerProject: jest.fn().mockResolvedValue({ id: 'project-id', revision: 1 }),
    updateProject: jest.fn().mockResolvedValue({ id: 'project-id', revision: 2 }),
    refreshSource: jest.fn().mockResolvedValue({ id: 'project-id', revision: 2 }),
    publish: jest.fn().mockResolvedValue({
      projectId: 'project-id',
      status: 'published',
      revision: 2,
    }),
    archive: jest.fn().mockResolvedValue({
      projectId: 'project-id',
      status: 'archived',
      revision: 3,
    }),
  };
  const projects = {
    getMyProjectsForActor: jest.fn().mockResolvedValue({
      projects: [],
      quota: { used: 0, monthlyLimit: 20 },
      pageInfo: { nextCursor: null, hasNextPage: false },
    }),
    discoverPublishedProjects: jest.fn().mockResolvedValue({ projects: [] }),
    rejectRetiredImportRoute: jest.fn(() => {
      throw new ApplicationError(
        'The combined GitHub import route has been retired',
        'PROJECT_IMPORT_ROUTE_RETIRED',
        410,
      );
    }),
  };
  const publicProjects = {
    list: jest.fn().mockResolvedValue({
      items: [],
      pageInfo: { nextCursor: null, hasNextPage: false },
    }),
    getBySlug: jest.fn().mockResolvedValue({ id: 'project-id', slug: 'project' }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectsController, PublicProjectsController],
      providers: [
        { provide: ProjectsService, useValue: projects },
        { provide: ProjectPublicationService, useValue: publication },
        { provide: PublicProjectsService, useValue: publicProjects },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          context.switchToHttp().getRequest().user = actor;
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

  afterAll(async () => app.close());

  it('previews without accepting client authorization fields', async () => {
    await request(app.getHttpServer())
      .post('/projects/github/preview')
      .send({ repositoryReference: 'sharek/example' })
      .expect(200);
    expect(publication.preview).toHaveBeenCalledWith(actor, 'sharek/example');

    await request(app.getHttpServer())
      .post('/projects/github/preview')
      .send({ repositoryReference: 'sharek/example', ownerId: 'attacker' })
      .expect(400);
  });

  it('binds idempotency and explicit publish confirmation', async () => {
    await request(app.getHttpServer())
      .post('/projects/me/project-id/publish')
      .set('Idempotency-Key', 'publish-contract-001')
      .send({ expectedRevision: 1, confirm: true })
      .expect(200);

    expect(publication.publish).toHaveBeenCalledWith(
      actor,
      'project-id',
      { expectedRevision: 1, confirm: true },
      'publish-contract-001',
    );
  });

  it('exposes published reads publicly and retires the combined write', async () => {
    await request(app.getHttpServer()).get('/public/projects').expect(200);
    await request(app.getHttpServer())
      .get('/public/projects/project')
      .expect(200);
    await request(app.getHttpServer())
      .post('/projects/import/github')
      .send({ fullName: 'sharek/example' })
      .expect(410);
  });
});
