import { createServer, Server as HttpServer } from 'node:http';

import { io as createSocket, Socket } from 'socket.io-client';
import { Server as SocketServer } from 'socket.io';

import { ConfigService } from '@nestjs/config';
import { RedisIoAdapter } from './redis-io.adapter';

const integrationDescribe =
  process.env.REALTIME_REDIS_INTEGRATION === 'true' ? describe : describe.skip;

function listen(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
}

function close(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (!error || (error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
        resolve();
        return;
      }
      reject(error);
    });
  });
}

function waitForSocketEvent<T>(
  socket: Socket,
  event: string,
  timeoutMs = 5_000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const onEvent = (value: T) => {
      clearTimeout(timeout);
      socket.off(event, onEvent);
      resolve(value);
    };
    socket.once(event, onEvent);
  });
}

integrationDescribe('Socket.IO Redis fan-out', () => {
  let httpServerA: HttpServer;
  let httpServerB: HttpServer;
  let socketServerA: SocketServer;
  let socketServerB: SocketServer;
  let client: Socket;
  let adapterA: RedisIoAdapter;
  let adapterB: RedisIoAdapter;

  beforeAll(async () => {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    adapterA = new RedisIoAdapter(
      {} as never,
      new ConfigService({ REDIS_URL: redisUrl }),
    );
    adapterB = new RedisIoAdapter(
      {} as never,
      new ConfigService({ REDIS_URL: redisUrl }),
    );
    await Promise.all([adapterA.connectToRedis(), adapterB.connectToRedis()]);

    httpServerA = createServer();
    httpServerB = createServer();
    (adapterA as unknown as { httpServer: HttpServer }).httpServer = httpServerA;
    (adapterB as unknown as { httpServer: HttpServer }).httpServer = httpServerB;
    socketServerA = adapterA.createIOServer(0);
    socketServerB = adapterB.createIOServer(0);

    socketServerB.of('/realtime').on('connection', (connectedSocket) => {
      void connectedSocket.join('user:user-1');
    });

    await Promise.all([listen(httpServerA), listen(httpServerB)]);
    const address = httpServerB.address();
    if (!address || typeof address === 'string') {
      throw new Error('Realtime integration server did not expose a port');
    }

    client = createSocket(`http://127.0.0.1:${address.port}/realtime`, {
      auth: { token: 'test-access-token' },
      transports: ['websocket'],
      autoConnect: false,
    });
    client.connect();
    await waitForSocketEvent<void>(client, 'connect');
  });

  afterAll(async () => {
    client?.disconnect();
    socketServerA?.close();
    socketServerB?.close();
    await Promise.all([
      httpServerA ? close(httpServerA) : Promise.resolve(),
      httpServerB ? close(httpServerB) : Promise.resolve(),
      adapterA?.onModuleDestroy() ?? Promise.resolve(),
      adapterB?.onModuleDestroy() ?? Promise.resolve(),
    ]);
  });

  it('fans out a stable envelope across two instances and preserves duplicate delivery', async () => {
    const envelope = {
      eventId: 'event-cross-instance-1',
      type: 'notification.created',
      version: 1,
      occurredAt: '2026-08-09T12:00:00.000Z',
      aggregateId: 'notification-cross-instance-1',
      aggregateVersion: 1,
      payload: { notification: { notificationId: 'notification-cross-instance-1' } },
    };
    const received: unknown[] = [];
    const onNotification = (value: unknown) => received.push(value);
    client.on('notification.created', onNotification);

    socketServerA.of('/realtime').to('user:user-1').emit(envelope.type, envelope);
    socketServerA.of('/realtime').to('user:user-1').emit(envelope.type, envelope);

    await new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        if (received.length === 2) return resolve();
        if (Date.now() - started > 5_000) {
          return reject(new Error(`Expected two deliveries, got ${received.length}`));
        }
        setTimeout(check, 20);
      };
      check();
    });
    client.off('notification.created', onNotification);

    expect(received).toEqual([envelope, envelope]);
  });

  it('recovers cross-instance delivery after a publisher reconnect', async () => {
    const firstEnvelope = {
      eventId: 'event-cross-instance-before-outage',
      type: 'notification.created',
      version: 1,
      occurredAt: '2026-08-09T12:01:00.000Z',
      aggregateId: 'notification-cross-instance-2',
      aggregateVersion: 1,
      payload: { notification: { notificationId: 'notification-cross-instance-2' } },
    };
    const recoveredEnvelope = {
      ...firstEnvelope,
      eventId: 'event-cross-instance-after-recovery',
      occurredAt: '2026-08-09T12:01:01.000Z',
    };
    const received: unknown[] = [];
    const onNotification = (value: unknown) => received.push(value);
    client.on('notification.created', onNotification);

    const publisherA = (
      adapterA as unknown as {
        publisher: {
          disconnect: () => Promise<void>;
          connect: () => Promise<void>;
        };
      }
    ).publisher;
    await publisherA.disconnect();
    expect(() =>
      socketServerA.of('/realtime').to('user:user-1').emit(
        firstEnvelope.type,
        firstEnvelope,
      ),
    ).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received).toHaveLength(0);

    await publisherA.connect();
    socketServerA.of('/realtime').to('user:user-1').emit(
      recoveredEnvelope.type,
      recoveredEnvelope,
    );

    await new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        if (received.length === 1) return resolve();
        if (Date.now() - started > 5_000) {
          return reject(new Error('Redis recovery delivery did not arrive'));
        }
        setTimeout(check, 20);
      };
      check();
    });
    client.off('notification.created', onNotification);

    expect(received).toEqual([recoveredEnvelope]);
  });
});
