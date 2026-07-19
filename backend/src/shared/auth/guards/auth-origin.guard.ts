import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

function parseAllowedOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/**
 * CSRF defense for cookie-authenticated auth endpoints: browser requests carry
 * an Origin header, which must match the configured CORS allowlist. Requests
 * without an Origin header (non-browser clients) pass through because they
 * cannot be forged by a cross-site page.
 */
@Injectable()
export class AuthOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;

    if (!origin) {
      return true;
    }

    const allowedOrigins = parseAllowedOrigins(
      this.config.get<string>(
        'CORS_ORIGINS',
        'http://localhost:3000,http://localhost:3001',
      ),
    );

    if (!allowedOrigins.includes(origin)) {
      throw new ForbiddenException('Request origin is not allowed');
    }

    return true;
  }
}
