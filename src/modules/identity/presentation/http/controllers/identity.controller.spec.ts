import { Response } from 'express';

import { IdentityController } from './identity.controller';

describe('IdentityController social auth callbacks', () => {
  const identityService = {};
  const socialAuthService = {
    completeGitHub: jest.fn(),
    completeGoogle: jest.fn(),
  };
  const config = {
    get: jest.fn(),
  };

  let controller: IdentityController;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue('http://localhost:3001');
    controller = new IdentityController(
      identityService as never,
      socialAuthService as never,
      config as never,
    );
  });

  it('redirects browser GitHub callbacks to the frontend handoff route', () => {
    const response = makeRedirectResponse();

    controller.completeGitHubGet(
      { code: 'github-code', state: 'github-state-value' },
      response,
    );

    expect(response.redirect).toHaveBeenCalledWith(
      'http://localhost:3001/auth/callback?provider=github&code=github-code&state=github-state-value',
    );
    expect(socialAuthService.completeGitHub).not.toHaveBeenCalled();
  });

  it('redirects browser Google callbacks to the frontend handoff route', () => {
    const response = makeRedirectResponse();

    controller.completeGoogleGet(
      { code: 'google-code', state: 'google-state-value' },
      response,
    );

    expect(response.redirect).toHaveBeenCalledWith(
      'http://localhost:3001/auth/callback?provider=google&code=google-code&state=google-state-value',
    );
    expect(socialAuthService.completeGoogle).not.toHaveBeenCalled();
  });
});

function makeRedirectResponse(): Response {
  return {
    redirect: jest.fn(),
  } as unknown as Response;
}
