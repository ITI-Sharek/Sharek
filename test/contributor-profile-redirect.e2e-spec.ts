import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { ContributorProfilesController } from '../src/modules/contributor-profiles/presentation/http/controllers/contributor-profiles.controller';
import { EnsureContributorProfileUseCase } from '../src/modules/contributor-profiles/application/use-cases/ensure-contributor-profile.use-case';
import { GetContributorProfileUseCase } from '../src/modules/contributor-profiles/application/use-cases/get-contributor-profile.use-case';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';

describe('Contributor profile redirect HTTP flow', () => {
  let app: INestApplication;
  const ensureUseCase = {
    execute: jest.fn().mockResolvedValue({
      username: 'contributor-one',
      viewerRelationship: 'owner',
    }),
  };
  const getUseCase = {
    execute: jest.fn().mockResolvedValue({
      username: 'contributor-one',
      viewerRelationship: 'owner',
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContributorProfilesController],
      providers: [
        {
          provide: EnsureContributorProfileUseCase,
          useValue: ensureUseCase,
        },
        {
          provide: GetContributorProfileUseCase,
          useValue: getUseCase,
        },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: any) => {
          const requestContext = context.switchToHttp().getRequest();
          requestContext.user = {
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
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('ensures then loads the owner profile by returned username', async () => {
    await request(app.getHttpServer())
      .post('/contributors/profiles/me/ensure')
      .expect(201)
      .expect(({ body }) => {
        expect(body.username).toBe('contributor-one');
      });

    await request(app.getHttpServer())
      .get('/contributors/profiles/contributor-one')
      .expect(200)
      .expect(({ body }) => {
        expect(body.viewerRelationship).toBe('owner');
      });
  });
});
