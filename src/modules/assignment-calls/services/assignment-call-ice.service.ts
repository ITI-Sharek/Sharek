import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { IceServerDto, JoinCredentialsDto } from '../dto/assignment-call-response.dto';

/**
 * Mints ICE server credentials: two public STUN servers plus a coturn
 * REST-style ephemeral TURN credential (RFC 7635 / coturn `use-auth-secret`).
 *
 * `TURN_STATIC_AUTH_SECRET` never leaves this service -- it signs a
 * short-lived username/credential pair, and only that pair reaches the
 * browser. A spec asserts the secret itself never appears anywhere in a
 * serialized response.
 */
@Injectable()
export class AssignmentCallIceService {
  constructor(private readonly config: ConfigService) {}

  mintJoinCredentials(userId: string): JoinCredentialsDto {
    const ttlSeconds = this.config.get<number>('TURN_CREDENTIAL_TTL_SECONDS', 300);
    const unixExpiry = Math.floor(Date.now() / 1000) + ttlSeconds;
    const username = `${unixExpiry}:${userId}`;
    // SHA-1 here is mandated by coturn's `use-auth-secret` REST credential
    // scheme, used inside an HMAC -- HMAC-SHA1 is not the same primitive as
    // bare SHA-1, and swapping it for SHA-256 breaks every relayed call
    // against a standard coturn deployment. Do not "fix" this.
    const credential = createHmac(
      'sha1',
      this.config.getOrThrow<string>('TURN_STATIC_AUTH_SECRET'),
    )
      .update(username)
      .digest('base64');

    const iceServers: IceServerDto[] = [
      { urls: this.parseUrls(this.config.get<string>('STUN_URLS', '')) },
      {
        urls: this.parseUrls(this.config.get<string>('TURN_URLS', '')),
        username,
        credential,
      },
    ].filter((server) => server.urls.length > 0);

    return {
      iceServers,
      expiresAt: new Date(unixExpiry * 1000),
      maxDurationSeconds: this.config.get<number>(
        'ASSIGNMENT_CALL_MAX_DURATION_MS',
        3_600_000,
      ) / 1000,
    };
  }

  private parseUrls(configured: string): string[] {
    return configured
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }
}
