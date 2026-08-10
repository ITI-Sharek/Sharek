import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

import { GitHubOAuthBrowserCallbackController } from './github-oauth-browser-callback.controller';

describe('GitHubOAuthBrowserCallbackController', () => {
  function createController(frontendUrl?: string) {
    const config = new ConfigService(
      frontendUrl ? { FRONTEND_URL: frontendUrl } : {},
    );
    const redirect = jest.fn();
    return {
      controller: new GitHubOAuthBrowserCallbackController(config),
      redirect,
      response: { redirect } as unknown as Response,
    };
  }

  it('preserves the localhost fallback and forwards a successful provider callback', () => {
    const { controller, redirect, response } = createController();

    controller.redirectRepositoryConnectCallback(
      'provider-code',
      'opaque-state',
      undefined,
      undefined,
      response,
    );

    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:3001/auth/callback?provider=github&code=provider-code&state=opaque-state',
    );
  });

  it('uses configured frontend origin and forwards provider errors without success values', () => {
    const { controller, redirect, response } = createController(
      'https://frontend.example.test',
    );

    controller.redirectRepositoryConnectCallback(
      'ignored-code',
      'ignored-state',
      'access_denied',
      'User denied access',
      response,
    );

    expect(redirect).toHaveBeenCalledWith(
      'https://frontend.example.test/auth/callback?provider=github&error=access_denied&error_description=User+denied+access',
    );
  });
});
