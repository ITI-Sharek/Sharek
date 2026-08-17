import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AccessTokenGuard } from '../../../shared/auth/guards/access-token.guard';
import { createApplicationValidationPipe } from '../../../shared/validation/application-validation.pipe';
import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import { AccountSettingsService } from '../services/account-settings.service';
import { SessionController } from './session.controller';

interface TestRequest {
  headers?: { authorization?: string };
  user?: Record<string, unknown>;
}

describe('SessionController preferences', () => {
  let app: INestApplication;
  const session = {
    updateCurrentUserPreferences: jest.fn().mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      preferredLanguage: 'ar',
    }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SessionController],
      providers: [
        { provide: AuthService, useValue: { getCurrentUser: jest.fn() } },
        { provide: SessionService, useValue: session },
        { provide: AccountSettingsService, useValue: {} },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: { switchToHttp: () => { getRequest: () => TestRequest } }) => {
          const request = context.switchToHttp().getRequest();
          if (request.headers && !request.headers.authorization) {
            throw new UnauthorizedException();
          }
          request.user = { id: '11111111-1111-4111-8111-111111111111' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(createApplicationValidationPipe());
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => jest.clearAllMocks());

  it('updates only the authenticated user language with an exact allowlist', async () => {
    await request(app.getHttpServer())
      .patch('/auth/me/preferences')
      .set('Authorization', 'Bearer token')
      .send({ preferredLanguage: 'ar', unexpected: true })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/auth/me/preferences')
      .set('Authorization', 'Bearer token')
      .send({ preferredLanguage: 'ar' })
      .expect(200);

    expect(session.updateCurrentUserPreferences).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      { preferredLanguage: 'ar' },
    );
  });
});
