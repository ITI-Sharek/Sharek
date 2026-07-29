import { ConfigService } from '@nestjs/config';
import { ConnectionOptions } from 'bullmq';

export function getRedisConnection(config: ConfigService): ConnectionOptions {
  const redisUrl = new URL(
    config.get<string>('REDIS_URL', 'redis://localhost:6379'),
  );

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
