import { ConfigService } from '@nestjs/config';

import { MaterialDownloadTokenService } from './material-download-token.service';

describe('MaterialDownloadTokenService', () => {
  const materialId = '55555555-5555-4555-8555-555555555555';
  const subjectId = '77777777-7777-4777-8777-777777777777';
  const now = new Date('2026-08-07T12:00:00.000Z');

  const config = (secret = 'a'.repeat(32), ttl = 300) =>
    ({
      get: (key: string, fallback: unknown) =>
        key === 'MATERIAL_DOWNLOAD_TOKEN_TTL_SECONDS' ? ttl : fallback,
      getOrThrow: () => secret,
    }) as unknown as ConfigService;

  const service = new MaterialDownloadTokenService(config());

  const issued = () =>
    service.issue({ materialId, version: 2, subjectId, now });

  it('round-trips the target and the subject', () => {
    const { token, expiresAt } = issued();

    expect(service.verify(token, now)).toEqual({
      materialId,
      version: 2,
      subjectId,
      expiresAt,
    });
  });

  it('expires on the configured window', () => {
    const { expiresAt } = issued();

    expect(expiresAt.getTime() - now.getTime()).toBe(300_000);
  });

  it('refuses a token past its expiry', () => {
    const { token, expiresAt } = issued();

    expect(() => service.verify(token, new Date(expiresAt.getTime() + 1))).toThrow(
      expect.objectContaining({ code: 'MATERIAL_DOWNLOAD_TOKEN_EXPIRED' }),
    );
  });

  it('refuses a token whose claims were edited', () => {
    // The whole point of the signature: without it, a reader authorized for
    // version 1 could ask for version 5 by editing a number.
    const { token } = issued();
    const [body, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    claims.v = 99;
    const forged = `${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;

    expect(() => service.verify(forged, now)).toThrow(
      expect.objectContaining({ code: 'MATERIAL_DOWNLOAD_TOKEN_INVALID' }),
    );
  });

  it('refuses a token signed with a different secret', () => {
    const other = new MaterialDownloadTokenService(config('b'.repeat(32)));
    const { token } = other.issue({ materialId, version: 2, subjectId, now });

    expect(() => service.verify(token, now)).toThrow(
      expect.objectContaining({ code: 'MATERIAL_DOWNLOAD_TOKEN_INVALID' }),
    );
  });

  it.each([['', 'empty'], ['not-a-token', 'unstructured'], ['a.b', 'unsigned']])(
    'refuses a malformed token (%s)',
    (token) => {
      expect(() => service.verify(token, now)).toThrow(
        expect.objectContaining({ code: 'MATERIAL_DOWNLOAD_TOKEN_INVALID' }),
      );
    },
  );

  it('mints a distinct token each time for the same target', () => {
    // So an audit trail can tell one redemption from another even when two
    // links are issued within the same second.
    expect(issued().token).not.toBe(issued().token);
  });

  it('carries no authorization decision in the token', () => {
    // A token that said "allowed" would keep working after a revocation. It
    // names a subject and a target; permission is resolved again at redemption.
    const { token } = issued();
    const claims = JSON.parse(
      Buffer.from(token.split('.')[0], 'base64url').toString('utf8'),
    );

    expect(Object.keys(claims).sort()).toEqual(['exp', 'jti', 'm', 's', 'v']);
  });
});
