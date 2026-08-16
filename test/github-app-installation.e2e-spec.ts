import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { GitHubAppCallbackController } from '../src/modules/github/controllers/github-app-callback.controller';
import { GitHubAppController } from '../src/modules/github/controllers/github-app.controller';
import { GitHubAppService } from '../src/modules/github/services/github-app.service';
import { AccessTokenGuard } from '../src/shared/auth/guards/access-token.guard';
import { ApplicationError } from '../src/shared/errors/application.error';
import { HttpExceptionFilter } from '../src/shared/errors/http-exception.filter';

const linkId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';

describe('GitHub App installation HTTP contract', () => {
  let app: INestApplication;
  const service = {
    startConnection: jest.fn().mockResolvedValue({
      installationUrl: 'https://github.com/apps/share-k/installations/new?state=opaque-state',
      expiresAt: new Date('2026-07-27T12:10:00Z'),
    }),
    processBrowserCallback: jest.fn().mockResolvedValue(attemptId),
    getConnectionAttempt: jest.fn().mockResolvedValue({
      attemptId,
      expiresAt: new Date('2026-07-27T12:10:00Z'),
      candidates: [
        {
          providerInstallationId: '987',
          accountLogin: 'sharek-org',
          accountType: 'organization',
        },
      ],
    }),
    completeConnection: jest.fn().mockResolvedValue({ installationLinkId: linkId }),
    listInstallationLinks: jest.fn().mockResolvedValue([]),
    listSelectedRepositories: jest.fn().mockResolvedValue({
      items: [],
      page: 1,
      perPage: 30,
      hasNextPage: false,
      verifiedAt: new Date(),
    }),
    disconnect: jest.fn().mockResolvedValue({
      success: true,
      manageUrl: 'https://github.com/settings/installations',
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GitHubAppController, GitHubAppCallbackController],
      providers: [
        { provide: GitHubAppService, useValue: service },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            GITHUB_APP_FRONTEND_RETURN_URL: 'http://localhost:3001/profile/github',
          }),
        },
      ],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = {
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app?.close());

  it('returns a state-bearing installation URL and never a setup URL', async () => {
    const response = await request(app.getHttpServer())
      .post('/github/app/installations/start')
      .send({ flowType: 'install_and_authorize' })
      .expect(201);
    expect(new URL(response.body.installationUrl).searchParams.get('state')).toBe(
      'opaque-state',
    );
    expect(response.body.installationUrl).not.toContain('setup');
    expect(service.startConnection).toHaveBeenCalledWith(
      'user-1',
      'install_and_authorize',
      undefined,
    );
  });

  it('returns a stable conflict when no GitHub sign-in identity is linked', async () => {
    service.startConnection.mockRejectedValueOnce(
      new ApplicationError(
        'Connect the GitHub account used to sign in before linking repositories',
        'GITHUB_APP_IDENTITY_REQUIRED',
        409,
      ),
    );

    const response = await request(app.getHttpServer())
      .post('/github/app/installations/start')
      .send({ flowType: 'install_and_authorize' })
      .expect(409);

    expect(response.body).toMatchObject({
      statusCode: 409,
      code: 'GITHUB_APP_IDENTITY_REQUIRED',
    });
  });

  it('redirects callback with only an opaque attempt ID, never code or tokens', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/github/app/callback?code=single-use-code&state=opaque-state')
      .expect(302);
    const location = new URL(response.headers.location);
    expect(location.searchParams.get('attemptId')).toBe(attemptId);
    expect(location.searchParams.has('code')).toBe(false);
    expect(location.searchParams.has('access_token')).toBe(false);
    expect(location.searchParams.has('refresh_token')).toBe(false);
  });

  it('handles cancellation with a provider-safe error and no code exchange', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/github/app/callback?error=access_denied')
      .expect(302);
    expect(new URL(response.headers.location).searchParams.get('error')).toBe(
      'GITHUB_APP_STATE_INVALID',
    );
    expect(service.processBrowserCallback).not.toHaveBeenCalled();
  });

  it('redirects an account mismatch using only the stable safe error code', async () => {
    service.processBrowserCallback.mockRejectedValueOnce(
      new ApplicationError(
        'Use the same GitHub account for Sharek sign-in and repository access',
        'GITHUB_APP_ACCOUNT_MISMATCH',
        409,
      ),
    );

    const response = await request(app.getHttpServer())
      .get('/auth/github/app/callback?code=single-use-code&state=opaque-state')
      .expect(302);
    const location = new URL(response.headers.location);

    expect(location.searchParams.get('error')).toBe(
      'GITHUB_APP_ACCOUNT_MISMATCH',
    );
    expect(location.searchParams.has('code')).toBe(false);
    expect(location.searchParams.has('message')).toBe(false);
  });

  it('protects completion and passes one opaque attempt/provider choice', async () => {
    const attemptResponse = await request(app.getHttpServer())
      .get(`/github/app/installations/attempts/${attemptId}`)
      .expect(200);
    expect(attemptResponse.body.candidates).toEqual([
      {
        providerInstallationId: '987',
        accountLogin: 'sharek-org',
        accountType: 'organization',
      },
    ]);
    expect(service.getConnectionAttempt).toHaveBeenCalledWith(
      'user-1',
      attemptId,
    );

    await request(app.getHttpServer())
      .post('/github/app/installations/callback')
      .send({ attemptId, providerInstallationId: '987' })
      .expect(201);
    expect(service.completeConnection).toHaveBeenCalledWith(
      'user-1',
      attemptId,
      '987',
    );
  });

  it('scopes status, repository pagination, and disconnect to the authenticated user', async () => {
    await request(app.getHttpServer()).get('/github/app/installations').expect(200);
    await request(app.getHttpServer())
      .get(`/github/app/repositories?installationLinkId=${linkId}&page=2&perPage=10`)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/github/app/installations/${linkId}`)
      .expect(200);
    expect(service.listInstallationLinks).toHaveBeenCalledWith('user-1');
    expect(service.listSelectedRepositories).toHaveBeenCalledWith(
      'user-1',
      linkId,
      2,
      10,
    );
    expect(service.disconnect).toHaveBeenCalledWith('user-1', linkId);
  });
});
