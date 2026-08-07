import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ForbiddenApplicationError } from '../../../shared/errors/application.error';

export type MaterialDownloadClaims = {
  materialId: string;
  version: number;
  subjectId: string;
  expiresAt: Date;
};

type TokenPayload = {
  m: string;
  v: number;
  s: string;
  exp: number;
  jti: string;
};

/**
 * Mints and verifies short-lived download tokens.
 *
 * The token is a bearer of *identity and target*, never of authorization. It
 * says "this subject asked for this version, recently"; whether that subject
 * may still read it is decided again at redemption, against live grants and
 * live Assignments. A token that carried the decision itself would keep working
 * after a revocation, which is precisely the window that matters.
 *
 * Signed with its own secret rather than the access-token secret. Sharing one
 * would make a download token and a session token interchangeable inputs to the
 * same verifier, and the whole point of this one is that it is far weaker.
 */
@Injectable()
export class MaterialDownloadTokenService {
  constructor(private readonly config: ConfigService) {}

  issue(input: {
    materialId: string;
    version: number;
    subjectId: string;
    now?: Date;
  }): { token: string; expiresAt: Date } {
    const now = input.now ?? new Date();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds() * 1000);
    const payload: TokenPayload = {
      m: input.materialId,
      v: input.version,
      s: input.subjectId,
      exp: Math.floor(expiresAt.getTime() / 1000),
      // Distinguishes two tokens minted in the same second for the same
      // target, so an audit trail can tell one redemption from another.
      jti: randomUUID(),
    };
    const body = this.encode(payload);
    return { token: `${body}.${this.sign(body)}`, expiresAt };
  }

  verify(token: string, now = new Date()): MaterialDownloadClaims {
    const [body, signature] = (token ?? '').split('.');
    if (!body || !signature) throw this.invalid();
    if (!this.signatureMatches(body, signature)) throw this.invalid();

    let payload: TokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as TokenPayload;
    } catch {
      // Only reachable for a body that survived signature verification, so
      // this means our own encoder changed shape, not that a caller tampered.
      throw this.invalid();
    }
    if (
      typeof payload.m !== 'string' ||
      typeof payload.s !== 'string' ||
      !Number.isInteger(payload.v) ||
      !Number.isInteger(payload.exp)
    ) {
      throw this.invalid();
    }
    const expiresAt = new Date(payload.exp * 1000);
    if (expiresAt.getTime() <= now.getTime()) {
      throw new ForbiddenApplicationError(
        'Material download link has expired',
        'MATERIAL_DOWNLOAD_TOKEN_EXPIRED',
      );
    }
    return {
      materialId: payload.m,
      version: payload.v,
      subjectId: payload.s,
      expiresAt,
    };
  }

  private ttlSeconds(): number {
    return this.config.get<number>('MATERIAL_DOWNLOAD_TOKEN_TTL_SECONDS', 300);
  }

  private encode(payload: TokenPayload): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  private sign(body: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('MATERIAL_DOWNLOAD_TOKEN_SECRET'),
    )
      .update(body)
      .digest('base64url');
  }

  /**
   * Constant-time, and length-checked first because timingSafeEqual throws on
   * a length mismatch -- which would itself leak the signature length through
   * the difference between a thrown error and a false.
   */
  private signatureMatches(body: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(body), 'utf8');
    const provided = Buffer.from(signature, 'utf8');
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  }

  private invalid(): ForbiddenApplicationError {
    return new ForbiddenApplicationError(
      'Material download link is not valid',
      'MATERIAL_DOWNLOAD_TOKEN_INVALID',
    );
  }
}
