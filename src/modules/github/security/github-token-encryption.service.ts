import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

import { ApplicationError } from '../../../shared/errors/application.error';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const FORMAT_VERSION = 'v1';

@Injectable()
export class GitHubTokenEncryptionService {
  constructor(private readonly config: ConfigService) {}

  encrypt(token: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.getKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      FORMAT_VERSION,
      iv.toString('base64url'),
      authTag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  decrypt(encryptedToken: string): string {
    const [version, iv, authTag, encrypted] = encryptedToken.split(':');

    if (version !== FORMAT_VERSION || !iv || !authTag || !encrypted) {
      throw new ApplicationError('Invalid encrypted GitHub token format', 'GITHUB_TOKEN_DECRYPT_FAILED', 500);
    }

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.getKey(),
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(authTag, 'base64url'));

      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new ApplicationError(
        'Stored GitHub token could not be decrypted. Reconnect GitHub.',
        'GITHUB_TOKEN_DECRYPT_FAILED',
        401,
      );
    }
  }

  private getKey(): Buffer {
    const secret = this.config.get<string>('GITHUB_TOKEN_ENCRYPTION_KEY');

    if (!secret || secret.length < 32) {
      throw new ApplicationError(
        'GITHUB_TOKEN_ENCRYPTION_KEY must be configured with at least 32 characters',
        'GITHUB_TOKEN_ENCRYPTION_NOT_CONFIGURED',
        500,
      );
    }

    return createHash('sha256').update(secret).digest();
  }
}
