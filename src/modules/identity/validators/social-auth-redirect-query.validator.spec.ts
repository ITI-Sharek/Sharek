import { ApplicationError } from '../../../shared/errors/application.error';

import { parseSocialAuthRedirectQuery } from './social-auth-redirect-query.validator';

describe('parseSocialAuthRedirectQuery', () => {
  it('extracts code and state while ignoring provider metadata', () => {
    expect(
      parseSocialAuthRedirectQuery({
        code: 'google-code',
        state: '0123456789abcdef',
        iss: 'https://accounts.google.com',
        scope: 'openid email profile',
        authuser: '0',
        prompt: 'consent',
      }),
    ).toEqual({
      code: 'google-code',
      state: '0123456789abcdef',
      error: undefined,
      errorDescription: undefined,
    });
  });

  it('accepts a provider cancellation error without a code', () => {
    expect(
      parseSocialAuthRedirectQuery({
        error: 'access_denied',
        error_description: 'The user cancelled sign-in.',
        state: '0123456789abcdef',
      }),
    ).toEqual({
      code: undefined,
      state: '0123456789abcdef',
      error: 'access_denied',
      errorDescription: 'The user cancelled sign-in.',
    });
  });

  it('rejects missing code and state when no provider error exists', () => {
    expect(() => parseSocialAuthRedirectQuery({ scope: 'openid' })).toThrow(
      ApplicationError,
    );
  });

  it('rejects repeated or otherwise non-string callback values', () => {
    expect(() =>
      parseSocialAuthRedirectQuery({
        code: ['first-code', 'second-code'],
        state: '0123456789abcdef',
      }),
    ).toThrow(ApplicationError);
  });
});
