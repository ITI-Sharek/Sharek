import { ConfigService } from '@nestjs/config';

import { GitHubTokenEncryptionService } from './github-token-encryption.service';
import { ApplicationError } from '../../../shared/errors/application.error';

describe('GitHubTokenEncryptionService', () => {
  const service = new GitHubTokenEncryptionService(
    new ConfigService({
      GITHUB_TOKEN_ENCRYPTION_KEY: 'test-github-token-encryption-key-32-chars-min',
    }),
  );

  it('encrypts and decrypts a token', () => {
    const encrypted = service.encrypt('github-token-value');

    expect(encrypted).not.toEqual('github-token-value');
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(service.decrypt(encrypted)).toEqual('github-token-value');
  });

  it('returns an application error when encrypted token cannot be decrypted', () => {
    const encrypted = service.encrypt('github-token-value');
    const serviceWithDifferentKey = new GitHubTokenEncryptionService(
      new ConfigService({
        GITHUB_TOKEN_ENCRYPTION_KEY:
          'different-github-token-encryption-key-32-chars-min',
      }),
    );

    try {
      serviceWithDifferentKey.decrypt(encrypted);
      fail('Expected decrypt to throw');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'GITHUB_TOKEN_DECRYPT_FAILED',
        statusCode: 401,
      } satisfies Partial<ApplicationError>);
    }
  });
});
