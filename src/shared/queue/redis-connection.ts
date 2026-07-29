import { ConfigService } from '@nestjs/config';
import { ConnectionOptions } from 'bullmq';

export function getRedisConnection(config: ConfigService): ConnectionOptions {
  const redisUrl = new URL(config.getOrThrow<string>('REDIS_URL'));

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : 0,
    tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
