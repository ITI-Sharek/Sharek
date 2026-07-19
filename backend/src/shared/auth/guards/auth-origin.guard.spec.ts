import { ExecutionContext, ForbiddenException } from '@nestjs/common';

import { AuthOriginGuard } from './auth-origin.guard';

describe('AuthOriginGuard', () => {
  function createGuard(corsOrigins = 'http://localhost:3001,https://sharek.app') {
    const config = {
      get: (key: string, fallback?: unknown) =>
        key === 'CORS_ORIGINS' ? corsOrigins : fallback,
    };

    return new AuthOriginGuard(config as never);
  }

  function contextWithOrigin(origin?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: origin === undefined ? {} : { origin },
        }),
      }),
    } as ExecutionContext;
  }

  it('allows requests without an Origin header', () => {
    expect(createGuard().canActivate(contextWithOrigin())).toBe(true);
  });

  it('allows requests from configured origins', () => {
    expect(
      createGuard().canActivate(contextWithOrigin('http://localhost:3001')),
    ).toBe(true);
  });

  it('rejects requests from unlisted origins', () => {
    expect(() =>
      createGuard().canActivate(contextWithOrigin('https://evil.example.com')),
    ).toThrow(ForbiddenException);
  });
});
