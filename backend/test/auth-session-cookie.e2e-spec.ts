import { ExecutionContext, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { SessionController } from '../src/modules/identity/controllers/session.controller';
import { ManualAuthController } from '../src/modules/identity/controllers/manual-auth.controller';
import { AuthService } from '../src/modules/identity/services/auth.service';
import { PasswordResetService } from '../src/modules/identity/services/password-reset.service';
import { SessionService } from '../src/modules/identity/services/session.service';
import {
  REFRESH_COOKIE_NAME,
  RefreshCookieService,
} from '../src/modules/identity/security/refresh-cookie.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { ApplicationError } from '../src/shared/errors/application.error';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';

const ALLOWED_ORIGIN = 'http://localhost:3001';

describe('Auth session cookie transport', () => {
  let app: INestApplication;

  const issuedTokens = {
    accessToken: 'issued-access-token',
    refreshToken: 'issued-refresh-token',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    refreshExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
  const authUser = {
    id: 'user-1',
    email: 'user@example.com',
    username: 'user-one',
  };

  const authService = {
    login: jest.fn().mockResolvedValue({ user: authUser, tokens: issuedTokens }),
    verifyEmail: jest
      .fn()
      .mockResolvedValue({ user: authUser, tokens: issuedTokens }),
    getCurrentUser: jest.fn(),
    assignRole: jest.fn(),
    register: jest.fn(),
    checkUsernameAvailability: jest.fn(),
    resendEmailVerification: jest.fn(),
  };
  const sessionService = {
    refresh: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
  };
  const passwordResetService = {
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SessionController, ManualAuthController],
      providers: [
        RefreshCookieService,
        { provide: AuthService, useValue: authService },
        { provide: SessionService, useValue: sessionService },
        { provide: PasswordResetService, useValue: passwordResetService },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) => {
              const values: Record<string, unknown> = {
                CORS_ORIGINS: ALLOWED_ORIGIN,
                AUTH_REFRESH_COOKIE_SAMESITE: 'lax',
                AUTH_REFRESH_COOKIE_SECURE: 'false',
                NODE_ENV: 'test',
              };

              return key in values ? values[key] : fallback;
            },
          },
        },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const httpRequest = context.switchToHttp().getRequest();
          httpRequest.authSessionId = 'session-1';
          httpRequest.user = {
            id: 'user-1',
            email: 'user@example.com',
            role: 'contributor',
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

  beforeEach(() => {
    sessionService.refresh.mockReset();
    sessionService.logout.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  function getRefreshSetCookie(response: request.Response): string | undefined {
    const header = response.headers['set-cookie'] as unknown as
      | string[]
      | undefined;

    return header?.find((cookie) => cookie.startsWith(`${REFRESH_COOKIE_NAME}=`));
  }

  it('sets an httpOnly refresh cookie on login and omits the refresh token from JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'password-123' })
      .expect(201);

    const cookie = getRefreshSetCookie(response);
    expect(cookie).toBeDefined();
    expect(cookie).toContain('issued-refresh-token');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/auth');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Expires=');

    expect(response.body.tokens.accessToken).toBe('issued-access-token');
    expect(response.body.tokens.refreshToken).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('issued-refresh-token');
  });

  it('sets the refresh cookie on email verification', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ email: 'user@example.com', code: '123456' })
      .expect(201);

    expect(getRefreshSetCookie(response)).toContain('issued-refresh-token');
    expect(response.body.tokens.refreshToken).toBeUndefined();
  });

  it('rotates server and cookie state on refresh', async () => {
    const rotatedTokens = {
      ...issuedTokens,
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
    };
    sessionService.refresh.mockResolvedValue(rotatedTokens);

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=issued-refresh-token`)
      .expect(201);

    expect(sessionService.refresh).toHaveBeenCalledWith('issued-refresh-token');
    expect(getRefreshSetCookie(response)).toContain('rotated-refresh-token');
    expect(response.body.tokens.accessToken).toBe('rotated-access-token');
    expect(response.body.tokens.refreshToken).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('rotated-refresh-token');
  });

  it('rejects refresh without the cookie', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe('REFRESH_TOKEN_MISSING');
      });

    expect(sessionService.refresh).not.toHaveBeenCalled();
  });

  it('rejects replayed or revoked refresh credentials', async () => {
    sessionService.refresh.mockRejectedValue(
      new ApplicationError(
        'Invalid or expired refresh token',
        'INVALID_REFRESH_TOKEN',
        401,
      ),
    );

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=stale-refresh-token`)
      .expect(401);
  });

  it('rejects refresh from a disallowed origin', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', 'https://evil.example.com')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=issued-refresh-token`)
      .expect(403);

    expect(sessionService.refresh).not.toHaveBeenCalled();
  });

  it('accepts refresh from an allowed origin', async () => {
    sessionService.refresh.mockResolvedValue(issuedTokens);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', `${REFRESH_COOKIE_NAME}=issued-refresh-token`)
      .expect(201);
  });

  it('revokes the session and clears the cookie on logout', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', 'Bearer any-access-token')
      .expect(201);

    expect(sessionService.logout).toHaveBeenCalledWith('session-1');

    const cookie = getRefreshSetCookie(response);
    expect(cookie).toBeDefined();
    expect(cookie).toContain(`${REFRESH_COOKIE_NAME}=;`);
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
  });
});
