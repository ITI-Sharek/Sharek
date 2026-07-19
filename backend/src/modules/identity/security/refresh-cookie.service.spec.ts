import { Request } from 'express';

import { REFRESH_COOKIE_NAME, RefreshCookieService } from './refresh-cookie.service';

describe('RefreshCookieService', () => {
  function createService(env: Record<string, string> = {}) {
    const config = {
      get: (key: string, fallback?: unknown) =>
        key in env ? env[key] : fallback,
    };

    return new RefreshCookieService(config as never);
  }

  function requestWithCookieHeader(header?: string): Request {
    return { headers: header === undefined ? {} : { cookie: header } } as Request;
  }

  it('builds httpOnly options scoped to the auth path', () => {
    const service = createService({ NODE_ENV: 'development' });
    const expiresAt = new Date('2030-01-01T00:00:00Z');

    expect(service.buildOptions(expiresAt)).toEqual({
      httpOnly: true,
      path: '/auth',
      sameSite: 'lax',
      secure: false,
      expires: expiresAt,
    });
  });

  it('defaults to secure cookies in production', () => {
    const service = createService({ NODE_ENV: 'production' });

    expect(service.buildOptions().secure).toBe(true);
  });

  it('honors explicit secure and strict same-site configuration', () => {
    const service = createService({
      NODE_ENV: 'development',
      AUTH_REFRESH_COOKIE_SECURE: 'true',
      AUTH_REFRESH_COOKIE_SAMESITE: 'strict',
    });
    const options = service.buildOptions();

    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe('strict');
  });

  it('reads the refresh cookie from the cookie header', () => {
    const service = createService();
    const request = requestWithCookieHeader(
      `other=value; ${REFRESH_COOKIE_NAME}=refresh-token-value`,
    );

    expect(service.read(request)).toBe('refresh-token-value');
  });

  it('returns null when the refresh cookie is absent', () => {
    const service = createService();

    expect(service.read(requestWithCookieHeader())).toBeNull();
    expect(service.read(requestWithCookieHeader('other=value'))).toBeNull();
  });
});
