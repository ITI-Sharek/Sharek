import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

import { AssignmentCallIceService } from './assignment-call-ice.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TURN_STATIC_AUTH_SECRET = 'unit-test-turn-secret-at-least-32-chars-long';

const configValues: Record<string, unknown> = {
  TURN_CREDENTIAL_TTL_SECONDS: 300,
  TURN_STATIC_AUTH_SECRET,
  STUN_URLS: 'stun:stun.example.com:19302',
  TURN_URLS: 'turn:turn.example.com:3478',
  ASSIGNMENT_CALL_MAX_DURATION_MS: 3_600_000,
};

function config(overrides: Record<string, unknown> = {}) {
  const values = { ...configValues, ...overrides };
  return {
    get: jest.fn((key: string, fallback: unknown) => (key in values ? values[key] : fallback)),
    getOrThrow: jest.fn((key: string) => {
      if (key in values) return values[key];
      throw new Error(`missing config ${key}`);
    }),
  } as unknown as ConfigService;
}

describe('AssignmentCallIceService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('mints a TURN credential matching a hand-computed HMAC-SHA1 test vector', () => {
    const service = new AssignmentCallIceService(config());

    const result = service.mintJoinCredentials(USER_ID);

    const unixExpiry = Math.floor(Date.now() / 1000) + 300;
    const expectedUsername = `${unixExpiry}:${USER_ID}`;
    const expectedCredential = createHmac('sha1', TURN_STATIC_AUTH_SECRET)
      .update(expectedUsername)
      .digest('base64');

    const turnServer = result.iceServers.find((server) => server.username !== undefined);
    expect(turnServer).toBeDefined();
    expect(turnServer?.username).toBe(expectedUsername);
    expect(turnServer?.credential).toBe(expectedCredential);
  });

  it('formats the TURN username as "{unixExpiry}:{userId}"', () => {
    const service = new AssignmentCallIceService(config());

    const result = service.mintJoinCredentials(USER_ID);

    const turnServer = result.iceServers.find((server) => server.username !== undefined);
    const [expiryPart, userIdPart] = (turnServer?.username ?? '').split(':');
    expect(Number.isInteger(Number(expiryPart))).toBe(true);
    expect(userIdPart).toBe(USER_ID);
  });

  it('never leaks the raw TURN_STATIC_AUTH_SECRET into a serialized response', () => {
    const service = new AssignmentCallIceService(config());

    const result = service.mintJoinCredentials(USER_ID);

    expect(JSON.stringify(result)).not.toContain(TURN_STATIC_AUTH_SECRET);
  });

  it('sets expiresAt to now + TURN_CREDENTIAL_TTL_SECONDS', () => {
    const service = new AssignmentCallIceService(config({ TURN_CREDENTIAL_TTL_SECONDS: 120 }));

    const result = service.mintJoinCredentials(USER_ID);

    expect(result.expiresAt.getTime()).toBe(Date.now() + 120_000);
  });

  it('derives maxDurationSeconds from ASSIGNMENT_CALL_MAX_DURATION_MS / 1000', () => {
    const service = new AssignmentCallIceService(
      config({ ASSIGNMENT_CALL_MAX_DURATION_MS: 1_800_000 }),
    );

    const result = service.mintJoinCredentials(USER_ID);

    expect(result.maxDurationSeconds).toBe(1_800);
  });

  it('omits an ICE server entry whose configured urls are empty', () => {
    const service = new AssignmentCallIceService(config({ STUN_URLS: '' }));

    const result = service.mintJoinCredentials(USER_ID);

    expect(result.iceServers.every((server) => server.urls.length > 0)).toBe(true);
    expect(result.iceServers.some((server) => server.username !== undefined)).toBe(true);
  });

  it('parses comma-separated URLs and trims whitespace', () => {
    const service = new AssignmentCallIceService(
      config({ STUN_URLS: ' stun:one.example.com , stun:two.example.com ' }),
    );

    const result = service.mintJoinCredentials(USER_ID);

    const stunServer = result.iceServers.find((server) => server.username === undefined);
    expect(stunServer?.urls).toEqual(['stun:one.example.com', 'stun:two.example.com']);
  });
});
