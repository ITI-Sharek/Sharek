import { ConfigService } from '@nestjs/config';

import { RedisIoAdapter } from './redis-io.adapter';

const connect = jest.fn();
const quit = jest.fn();
const on = jest.fn();
const duplicate = jest.fn();
const publish = jest.fn();
const createClient = jest.fn();
const createAdapter = jest.fn();

jest.mock('redis', () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));

jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: (...args: unknown[]) => createAdapter(...args),
}));

describe('RedisIoAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connect.mockResolvedValue(undefined);
    quit.mockResolvedValue(undefined);
    publish.mockResolvedValue(1);
    on.mockReturnThis();
    duplicate.mockReturnValue({ connect, quit, on, isOpen: true });
    createClient.mockReturnValue({
      connect,
      quit,
      on,
      publish,
      duplicate,
      isOpen: true,
    });
    createAdapter.mockReturnValue(jest.fn());
  });

  it('connects a publisher and duplicated subscriber and reports readiness', async () => {
    const adapter = new RedisIoAdapter(
      {} as never,
      new ConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );

    await expect(adapter.connectToRedis()).resolves.toBe(true);
    expect(createClient).toHaveBeenCalledWith({ url: 'redis://localhost:6379' });
    expect(duplicate).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('keeps the adapter usable with local delivery when Redis is unavailable', async () => {
    connect.mockRejectedValueOnce(new Error('redis unavailable'));
    const adapter = new RedisIoAdapter(
      {} as never,
      new ConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );

    await expect(adapter.connectToRedis()).resolves.toBe(false);
    expect(quit).toHaveBeenCalled();
  });

  it('installs the Redis adapter on newly created Socket.IO servers', async () => {
    const adapter = new RedisIoAdapter(
      {} as never,
      new ConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );
    await adapter.connectToRedis();
    const server = { adapter: jest.fn() };
    jest.spyOn(Object.getPrototypeOf(RedisIoAdapter.prototype), 'createIOServer').mockReturnValue(server);

    expect(adapter.createIOServer(4000)).toBe(server);
    expect(createAdapter).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(server.adapter).toHaveBeenCalledWith(createAdapter.mock.results[0]?.value);
  });

  it('contains asynchronous Redis publish failures so local delivery survives an outage', async () => {
    const adapter = new RedisIoAdapter(
      {} as never,
      new ConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );
    await adapter.connectToRedis();
    publish.mockRejectedValueOnce(new Error('redis unavailable'));

    const publisher = createClient.mock.results[0]?.value as {
      publish: (channel: string, message: string) => Promise<number>;
    };

    await expect(publisher.publish('room', 'event')).resolves.toBe(0);
  });

  it('closes both Redis clients during shutdown', async () => {
    const adapter = new RedisIoAdapter(
      {} as never,
      new ConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );
    await adapter.connectToRedis();

    await adapter.onModuleDestroy();

    expect(quit).toHaveBeenCalledTimes(2);
  });
});
