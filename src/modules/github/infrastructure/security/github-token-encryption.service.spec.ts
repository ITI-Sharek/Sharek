import { ConfigService } from '@nestjs/config';

import { GitHubTokenEncryptionService } from './github-token-encryption.service';

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
});
