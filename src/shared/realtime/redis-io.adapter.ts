import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ServerOptions } from 'socket.io';

type RedisClient = ReturnType<typeof createClient>;

export class RedisIoAdapter extends IoAdapter {
  private publisher?: RedisClient;
  private subscriber?: RedisClient;

  constructor(
    app: INestApplicationContext,
    private readonly config: ConfigService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<boolean> {
    if (this.publisher && this.subscriber) return true;

    let publisher: RedisClient | undefined;
    let subscriber: RedisClient | undefined;
    try {
      const url = this.config.getOrThrow<string>('REDIS_URL');
      publisher = createClient({ url });
      subscriber = publisher.duplicate();
      this.attachSafeErrorHandler(publisher);
      this.attachSafeErrorHandler(subscriber);
      this.protectPublisherRejections(publisher);
      await Promise.all([publisher.connect(), subscriber.connect()]);
      this.publisher = publisher;
      this.subscriber = subscriber;
      return true;
    } catch {
      await Promise.allSettled([
        publisher?.quit() ?? Promise.resolve(),
        subscriber?.quit() ?? Promise.resolve(),
      ]);
      return false;
    }
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.publisher && this.subscriber) {
      server.adapter(createAdapter(this.publisher, this.subscriber));
    }
    return server;
  }

  async onModuleDestroy(): Promise<void> {
    const publisher = this.publisher;
    const subscriber = this.subscriber;
    this.publisher = undefined;
    this.subscriber = undefined;

    await Promise.allSettled([
      publisher?.quit() ?? Promise.resolve(),
      subscriber?.quit() ?? Promise.resolve(),
    ]);
  }

  private attachSafeErrorHandler(client: RedisClient): void {
    client.on('error', () => undefined);
  }

  private protectPublisherRejections(client: RedisClient): void {
    const publish = client.publish.bind(client);
    const mutableClient = client as Omit<RedisClient, 'publish'> & {
      publish: RedisClient['publish'];
    };
    mutableClient.publish = ((channel: string, message: string) =>
      publish(channel, message).catch(() => 0)) as RedisClient['publish'];
  }
}
