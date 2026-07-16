import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { ContributorProfilesController } from '../src/modules/contributor-profiles/contributor-profiles.controller';
import { ContributorProfilesService } from '../src/modules/contributor-profiles/contributor-profiles.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';
import {
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../src/shared/errors/application.error';

describe('Contributor profile protected HTTP errors', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContributorProfilesController],
      providers: [
        {
          provide: ContributorProfilesService,
          useValue: {
            ensure: jest.fn().mockRejectedValue(
              new ForbiddenApplicationError(
                'Only contributors can create contributor profiles',
                'CONTRIBUTOR_PROFILE_FORBIDDEN',
              ),
            ),
            getByUsername: jest.fn().mockRejectedValue(
              new NotFoundApplicationError(
                'Contributor profile was not found',
                'PROFILE_NOT_FOUND',
              ),
            ),
          },
        },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().user = {
            id: 'owner-1',
            email: 'owner@example.com',
            role: 'owner',
            status: 'active',
          };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 for malformed username route params', async () => {
    await request(app.getHttpServer())
      .get('/contributors/profiles/BadName')
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('MALFORMED_USERNAME');
      });
  });

  it('maps ensure denial to 403 and hidden profile lookup to 404', async () => {
    await request(app.getHttpServer())
      .post('/contributors/profiles/me/ensure')
      .expect(403);

    await request(app.getHttpServer())
      .get('/contributors/profiles/missing-profile')
      .expect(404);
  });
});
