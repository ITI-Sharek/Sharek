import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';
import { AuthenticatedRequest } from '../authenticated-request';
import { hashToken } from '../token-hash';

function canUseSession(user: {
  role: string;
  status: string;
}): boolean {
  return user.status === 'active' || (user.role === 'contributor' && user.status === 'pending');
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const session = await this.database.authSession.findFirst({
      where: {
        access_token_hash: hashToken(token),
        revoked_at: null,
        expires_at: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!session || !canUseSession(session.user)) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    request.authSessionId = session.id;
    request.user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
      status: session.user.status,
    };

    return true;
  }

  private extractBearerToken(request: AuthenticatedRequest): string | null {
    const authorization = request.headers.authorization;

    if (!authorization) {
      return null;
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    return token;
  }
}
