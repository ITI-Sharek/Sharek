import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { GitHubAuthController } from '../src/modules/identity/controllers/github-auth.controller';
import { GoogleAuthController } from '../src/modules/identity/controllers/google-auth.controller';
import { SocialAuthService } from '../src/modules/identity/services/social-auth.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';

describe('Social auth browser callbacks', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GoogleAuthController, GitHubAuthController],
      providers: [
        {
          provide: SocialAuthService,
          useValue: {
            startGoogle: jest.fn(),
            startGitHub: jest.fn(),
            completeGoogle: jest.fn(),
            completeGitHub: jest.fn(),
            connectGitHubAccount: jest.fn(),
            disconnectGitHubAccount: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, fallback: string) => fallback),
          },
        },
      ],
    })
      .overrideGuard(AccessTokenGuard)
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

  afterAll(async () => {
    await app.close();
  });

  it('ignores Google metadata and redirects code and state to the frontend', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/google/callback')
      .query({
        code: 'google-code',
        state: '0123456789abcdef',
        iss: 'https://accounts.google.com',
        scope: 'openid email profile',
        authuser: '0',
        prompt: 'consent',
      })
      .expect(302);

    expect(response.headers.location).toBe(
      'http://localhost:3001/auth/callback?provider=google&code=google-code&state=0123456789abcdef',
    );
  });

  it('forwards provider cancellation errors to the frontend', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/google/callback')
      .query({
        error: 'access_denied',
        error_description: 'User cancelled',
        state: '0123456789abcdef',
        scope: 'openid',
      })
      .expect(302);

    expect(response.headers.location).toBe(
      'http://localhost:3001/auth/callback?provider=google&state=0123456789abcdef&error=access_denied&error_description=User+cancelled',
    );
  });

  it('keeps frontend POST callback bodies strict', async () => {
    await request(app.getHttpServer())
      .post('/auth/google/callback')
      .send({
        code: 'google-code',
        state: '0123456789abcdef',
        scope: 'openid',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toContain('property scope should not exist');
      });
  });

  it('applies the tolerant browser callback boundary to GitHub', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/github/callback')
      .query({
        code: 'github-code',
        state: '0123456789abcdef',
        provider_metadata: 'ignored',
      })
      .expect(302);

    expect(response.headers.location).toBe(
      'http://localhost:3001/auth/callback?provider=github&code=github-code&state=0123456789abcdef',
    );
  });
});
