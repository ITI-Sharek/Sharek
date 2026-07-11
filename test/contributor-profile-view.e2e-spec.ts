import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { ContributorProfilesController } from '../src/modules/contributor-profiles/presentation/http/controllers/contributor-profiles.controller';
import { EnsureContributorProfileUseCase } from '../src/modules/contributor-profiles/application/use-cases/ensure-contributor-profile.use-case';
import { GetContributorProfileUseCase } from '../src/modules/contributor-profiles/application/use-cases/get-contributor-profile.use-case';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';

describe('Contributor profile authenticated viewer HTTP flow', () => {
  let app: INestApplication;
  const getUseCase = {
    execute: jest.fn().mockResolvedValue({
      username: 'contributor-one',
      viewerRelationship: 'authenticated-viewer',
      completionPrompts: [],
      skills: [
        {
          name: 'NestJS',
          proficiencyLevel: 'advanced',
          confidence: 0.9,
          status: 'approved',
          evidenceSummary: null,
        },
      ],
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContributorProfilesController],
      providers: [
        {
          provide: EnsureContributorProfileUseCase,
          useValue: {
            execute: jest.fn(),
          },
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
          context.switchToHttp().getRequest().user = {
            id: 'viewer-2',
            email: 'viewer@example.com',
            role: 'owner',
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

  it('returns authenticated viewer profile shape', async () => {
    await request(app.getHttpServer())
      .get('/contributors/profiles/contributor-one')
      .expect(200)
      .expect(({ body }) => {
        expect(body.viewerRelationship).toBe('authenticated-viewer');
        expect(body.completionPrompts).toEqual([]);
        expect(body.skills).toEqual([
          {
            name: 'NestJS',
            proficiencyLevel: 'advanced',
            confidence: 0.9,
            status: 'approved',
            evidenceSummary: null,
          },
        ]);
      });
  });
});
