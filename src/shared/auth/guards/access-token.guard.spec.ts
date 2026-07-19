import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  ALLOW_INACTIVE_AUTHENTICATED_USERS_KEY,
} from '../allow-inactive-authenticated-users.decorator';
import { AccessTokenGuard } from './access-token.guard';
import { hashToken } from '../token-hash';

function createContext(options: {
  authorization?: string;
  allowInactive?: boolean;
}) {
  const request = {
    headers: {
      authorization: options.authorization,
    },
  };
  const handler = function handler() {};
  const controller = class Controller {};
  Reflect.defineMetadata(
    ALLOW_INACTIVE_AUTHENTICATED_USERS_KEY,
    options.allowInactive,
    handler,
  );

  return {
    request,
    context: {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => handler,
      getClass: () => controller,
    } as unknown as ExecutionContext,
  };
}

describe('AccessTokenGuard', () => {
  it('rejects inactive sessions by default', async () => {
    const guard = new AccessTokenGuard(
      {
        authSession: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'session-1',
            user: {
              id: 'user-1',
              email: 'contributor@example.com',
              role: 'contributor',
              status: 'suspended',
            },
          }),
        },
      } as never,
      new Reflector(),
    );
    const { context } = createContext({
      authorization: 'Bearer valid-token',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('allows route-specific inactive sessions so use cases can return 403', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'session-1',
      user: {
        id: 'user-1',
        email: 'contributor@example.com',
        role: 'contributor',
        status: 'suspended',
      },
    });
    const guard = new AccessTokenGuard(
      {
        authSession: {
          findFirst,
        },
      } as never,
      new Reflector(),
    );
    const { context, request } = createContext({
      authorization: 'Bearer valid-token',
      allowInactive: true,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        access_token_hash: hashToken('valid-token'),
        revoked_at: null,
        expires_at: {
          gt: expect.any(Date),
        },
      },
      include: {
        user: true,
      },
    });
    expect(request).toMatchObject({
      authSessionId: 'session-1',
      user: {
        id: 'user-1',
        email: 'contributor@example.com',
        role: 'contributor',
        status: 'suspended',
      },
    });
  });
});
