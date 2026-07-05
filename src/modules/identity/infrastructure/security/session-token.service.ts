import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

import { hashToken } from '../../../../shared/auth/token-hash';

export interface GeneratedSessionTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenHash: string;
  refreshTokenHash: string;
}

@Injectable()
export class SessionTokenService {
  generate(): GeneratedSessionTokens {
    const accessToken = randomBytes(32).toString('base64url');
    const refreshToken = randomBytes(48).toString('base64url');

    return {
      accessToken,
      refreshToken,
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
    };
  }

  hash(token: string): string {
    return hashToken(token);
  }
}
