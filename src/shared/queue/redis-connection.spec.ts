import { ConfigService } from '@nestjs/config';

import { getRedisConnection } from './redis-connection';

describe('getRedisConnection', () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    delete process.env.REDIS_URL;
  });

  afterAll(() => {
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
  });

  it('requires the validated REDIS_URL configuration instead of inventing a fallback', () => {
    expect(() => getRedisConnection(new ConfigService())).toThrow('REDIS_URL');
  });

  it('maps the configured Redis URL into BullMQ connection options', () => {
    expect(
      getRedisConnection(
        new ConfigService({
          REDIS_URL: 'rediss://queue-user:queue-pass@redis.example:6380/2',
        }),
      ),
    ).toEqual({
      host: 'redis.example',
      port: 6380,
      username: 'queue-user',
      password: 'queue-pass',
      db: 2,
      tls: {},
      maxRetriesPerRequest: null,
    });
  });
});
