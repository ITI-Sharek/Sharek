import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHmac,
  createPrivateKey,
  createSign,
  timingSafeEqual,
} from 'crypto';

import { ApplicationError } from '../../../shared/errors/application.error';

@Injectable()
export class GitHubAppCredentialsService {
  constructor(private readonly config: ConfigService) {}

  createAppJwt(now = new Date()): string {
    const appId = this.required('GITHUB_APP_ID');
    const issuedAt = Math.floor(now.getTime() / 1000) - 60;
    const expiresAt = issuedAt + 9 * 60;
    const header = this.encodeJson({ alg: 'RS256', typ: 'JWT' });
    const payload = this.encodeJson({ iat: issuedAt, exp: expiresAt, iss: appId });
    const unsigned = `${header}.${payload}`;

    try {
      const signer = createSign('RSA-SHA256');
      signer.update(unsigned);
      signer.end();
      return `${unsigned}.${signer.sign(this.getPrivateKey()).toString('base64url')}`;
    } catch {
      throw new ApplicationError(
        'GitHub App private key is invalid',
        'GITHUB_APP_PRIVATE_KEY_INVALID',
        500,
      );
    }
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
      return false;
    }

    const expected = Buffer.from(
      createHmac('sha256', this.required('GITHUB_APP_WEBHOOK_SECRET'))
        .update(rawBody)
        .digest('hex'),
      'hex',
    );
    const received = Buffer.from(signature.slice('sha256='.length), 'hex');

    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  private getPrivateKey() {
    const encoded = this.required('GITHUB_APP_PRIVATE_KEY_BASE64');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
      throw new ApplicationError(
        'GitHub App private key encoding is invalid',
        'GITHUB_APP_PRIVATE_KEY_INVALID',
        500,
      );
    }

    const decoded = Buffer.from(encoded, 'base64');
    if (decoded.toString('base64') !== encoded || !decoded.toString('utf8').includes('PRIVATE KEY')) {
      throw new ApplicationError(
        'GitHub App private key encoding is invalid',
        'GITHUB_APP_PRIVATE_KEY_INVALID',
        500,
      );
    }

    try {
      return createPrivateKey(decoded);
    } catch {
      throw new ApplicationError(
        'GitHub App private key is invalid',
        'GITHUB_APP_PRIVATE_KEY_INVALID',
        500,
      );
    }
  }

  private encodeJson(value: Record<string, string | number>): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private required(name: string): string {
    const value = this.config.get<string>(name)?.trim();
    if (!value) {
      throw new ApplicationError(
        'GitHub App is not configured',
        'GITHUB_APP_NOT_CONFIGURED',
        503,
      );
    }
    return value;
  }
}
