import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'sharek_refresh_token';
export const REFRESH_COOKIE_PATH = '/auth';

type RefreshCookieSameSite = 'lax' | 'strict';

@Injectable()
export class RefreshCookieService {
  constructor(private readonly config: ConfigService) {}

  issue(response: Response, refreshToken: string, refreshExpiresAt: Date): void {
    response.cookie(
      REFRESH_COOKIE_NAME,
      refreshToken,
      this.buildOptions(refreshExpiresAt),
    );
  }

  clear(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.buildOptions());
  }

  read(request: Request): string | null {
    const header = request.headers.cookie;

    if (!header) {
      return null;
    }

    for (const part of header.split(';')) {
      const separatorIndex = part.indexOf('=');

      if (separatorIndex === -1) {
        continue;
      }

      const name = part.slice(0, separatorIndex).trim();

      if (name !== REFRESH_COOKIE_NAME) {
        continue;
      }

      const rawValue = part.slice(separatorIndex + 1).trim();

      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }

    return null;
  }

  buildOptions(expiresAt?: Date): CookieOptions {
    const options: CookieOptions = {
      httpOnly: true,
      path: REFRESH_COOKIE_PATH,
      sameSite: this.getSameSite(),
      secure: this.isSecure(),
    };
    const domain = this.config.get<string>('AUTH_REFRESH_COOKIE_DOMAIN', '');

    if (domain) {
      options.domain = domain;
    }

    if (expiresAt) {
      options.expires = expiresAt;
    }

    return options;
  }

  private getSameSite(): RefreshCookieSameSite {
    const sameSite = this.config.get<string>('AUTH_REFRESH_COOKIE_SAMESITE', 'lax');

    return sameSite === 'strict' ? 'strict' : 'lax';
  }

  private isSecure(): boolean {
    const configured = this.config.get<string | boolean>('AUTH_REFRESH_COOKIE_SECURE');

    if (configured !== undefined && configured !== '') {
      return configured === true || configured === 'true';
    }

    return this.config.get<string>('NODE_ENV', 'development') === 'production';
  }
}
