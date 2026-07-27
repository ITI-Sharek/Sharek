import { ConfigService } from '@nestjs/config';
import { createHmac, generateKeyPairSync } from 'crypto';

import { GitHubAppCredentialsService } from './github-app-credentials.service';

describe('GitHubAppCredentialsService', () => {
  const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();

  function createService(overrides: Record<string, string> = {}) {
    return new GitHubAppCredentialsService(
      new ConfigService({
        GITHUB_APP_ID: '123456',
        GITHUB_APP_PRIVATE_KEY_BASE64: Buffer.from(privateKey).toString('base64'),
        GITHUB_APP_WEBHOOK_SECRET: 'test-webhook-secret-at-least-32-characters',
        ...overrides,
      }),
    );
  }

  it('signs a short-lived RS256 app JWT', () => {
    const now = new Date('2026-07-27T12:00:00.000Z');
    const token = createService().createAppJwt(now);
    const [header, payload] = token
      .split('.')
      .slice(0, 2)
      .map((part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')));

    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(payload.iss).toBe('123456');
    expect(payload.exp - payload.iat).toBe(540);
    expect(payload.exp).toBeLessThanOrEqual(Math.floor(now.getTime() / 1000) + 540);
  });

  it.each([
    ['malformed Base64', '***not-base64***'],
    ['invalid PEM', Buffer.from('not a private key').toString('base64')],
  ])('rejects %s without exposing key material', (_label, encoded) => {
    expect(() =>
      createService({ GITHUB_APP_PRIVATE_KEY_BASE64: encoded }).createAppJwt(),
    ).toThrow(expect.objectContaining({ code: 'GITHUB_APP_PRIVATE_KEY_INVALID' }));
  });

  it('uses a timing-safe digest comparison contract for valid and invalid signatures', () => {
    const service = createService();
    const body = Buffer.from('{"action":"created"}');
    const digest = createHmac(
      'sha256',
      'test-webhook-secret-at-least-32-characters',
    )
      .update(body)
      .digest('hex');

    expect(service.verifyWebhookSignature(body, `sha256=${digest}`)).toBe(true);
    expect(service.verifyWebhookSignature(body, `sha256=${'0'.repeat(64)}`)).toBe(false);
    expect(service.verifyWebhookSignature(body, 'sha256=short')).toBe(false);
    expect(service.verifyWebhookSignature(body, undefined)).toBe(false);
  });
});
