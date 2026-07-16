import { Response } from 'express';

import { IdentityController } from './identity.controller';

describe('IdentityController social auth callbacks', () => {
  const identityService = {
    checkUsernameAvailability: jest.fn(),
  };
  const socialAuthService = {
    completeGitHub: jest.fn(),
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


  it('delegates username availability checks to identity service', () => {
    identityService.checkUsernameAvailability.mockReturnValue({
      available: true,
      suggestion: null,
      reason: null,
    });

    expect(
      controller.checkUsernameAvailability({ username: 'sara-dev' }),
    ).toEqual({
      available: true,
      suggestion: null,
      reason: null,
    });
    expect(identityService.checkUsernameAvailability).toHaveBeenCalledWith(
      'sara-dev',
    );
  });
});

function makeRedirectResponse(): Response {
  return {
    redirect: jest.fn(),
  } as unknown as Response;
}
