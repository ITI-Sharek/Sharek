import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { io } from 'socket.io-client';

const DEFAULT_EVENT_TYPE = 'notification.created';
const DEFAULT_SOCKET_COUNT = 500;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_PUBLICATION_TIMEOUT_MS = 5_000;
const DEFAULT_ISOLATION_WINDOW_MS = 1_000;
const DEFAULT_RECOVERY_MIN_ITEMS = 100;

function integerEnv(name, fallback, { minimum = 1, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((percentileValue / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, index)];
}

function isEnvelope(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.eventId === 'string' &&
    typeof value.occurredAt === 'string'
  );
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function waitUntil(predicate, timeoutMs, description) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Timed out waiting for ${description}`));
        return;
      }
      setTimeout(check, 10);
    };
    check();
  });
}

function createSocket(baseUrl, token, timeoutMs) {
  const socket = io(`${baseUrl.replace(/\/$/, '')}/realtime`, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: false,
    reconnection: false,
    timeout: timeoutMs,
  });

  const connectStartedAt = Date.now();
  const connected = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Socket connection timed out'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('realtime.error', onRealtimeError);
    };
    const onConnect = () => {
      cleanup();
      resolve(Date.now() - connectStartedAt);
    };
    const onConnectError = (error) => {
      cleanup();
      reject(new Error(`Socket connection failed: ${error.message}`));
    };
    const onRealtimeError = (error) => {
      cleanup();
      reject(new Error(`Realtime rejected the socket: ${JSON.stringify(error)}`));
    };

    socket.once('connect', onConnect);
    socket.once('connect_error', onConnectError);
    socket.once('realtime.error', onRealtimeError);
  });

  socket.connect();
  return { socket, connected };
}

async function connectSockets({ baseUrl, token, count, timeoutMs, batchSize }) {
  const sockets = [];
  const connectionLatencies = [];
  try {
    for (let offset = 0; offset < count; offset += batchSize) {
      const batch = Array.from(
        { length: Math.min(batchSize, count - offset) },
        () => createSocket(baseUrl, token, timeoutMs),
      );
      sockets.push(...batch.map(({ socket }) => socket));
      connectionLatencies.push(...(await Promise.all(batch.map(({ connected }) => connected))));
    }
    return { sockets, connectionLatencies };
  } catch (error) {
    await closeSockets(sockets);
    throw error;
  }
}

async function closeSockets(sockets) {
  for (const socket of sockets) socket.disconnect();
}

function resolveUrl(baseUrl, configuredUrl) {
  return new URL(configuredUrl, `${baseUrl.replace(/\/$/, '')}/`).toString();
}

function interpolate(value, runId) {
  return value.replaceAll('__PROFILE_RUN_ID__', runId);
}

function parseHeaders() {
  const configured = process.env.REALTIME_PROFILE_TRIGGER_HEADERS;
  if (!configured) return {};
  let headers;
  try {
    headers = JSON.parse(configured);
  } catch (error) {
    throw new Error(`REALTIME_PROFILE_TRIGGER_HEADERS must be valid JSON: ${error.message}`);
  }
  if (!headers || Array.isArray(headers) || typeof headers !== 'object') {
    throw new Error('REALTIME_PROFILE_TRIGGER_HEADERS must be a JSON object');
  }
  return headers;
}

async function triggerNotification({ baseUrl, token, url, body, runId }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    ...parseHeaders(),
  };
  const interpolatedBody = body ? interpolate(body, runId) : undefined;
  if (interpolatedBody) headers['Content-Type'] ??= 'application/json';

  const response = await fetch(resolveUrl(baseUrl, interpolate(url, runId)), {
    method: process.env.REALTIME_PROFILE_TRIGGER_METHOD?.trim() || 'POST',
    headers,
    body: interpolatedBody,
  });
  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(
      `Notification trigger failed with HTTP ${response.status}: ${responseBody.slice(0, 500)}`,
    );
  }
  return { status: response.status, body: responseBody };
}

async function measurePublication({ sockets, baseUrl, trigger, eventType, timeoutMs }) {
  const receivedSocketIds = new Set();
  const latencies = [];
  let eventId = null;
  let occurredAt = null;
  const handlers = sockets.map((socket) => {
    const handler = (value) => {
      if (!isEnvelope(value) || (value.type && value.type !== eventType)) return;
      if (eventId === null) {
        eventId = value.eventId;
        occurredAt = value.occurredAt;
      }
      if (value.eventId !== eventId || receivedSocketIds.has(socket.id)) return;
      receivedSocketIds.add(socket.id);
      const occurredAtMs = Date.parse(value.occurredAt);
      if (Number.isFinite(occurredAtMs)) latencies.push(Math.max(0, Date.now() - occurredAtMs));
    };
    socket.on(eventType, handler);
    return { socket, handler };
  });

  const runId = randomUUID();
  const triggerStartedAt = Date.now();
  try {
    await triggerNotification({ ...trigger, baseUrl, runId });
    await waitUntil(
      () => receivedSocketIds.size === sockets.length,
      timeoutMs,
      `the ${eventType} event on ${sockets.length} sockets`,
    );
  } finally {
    for (const { socket, handler } of handlers) socket.off(eventType, handler);
  }

  return {
    eventId,
    occurredAt,
    triggerToFirstPresentationMs: Math.max(0, Date.now() - triggerStartedAt),
    deliveries: receivedSocketIds.size,
    latencyMs: {
      count: latencies.length,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: Math.max(...latencies),
    },
  };
}

async function measureRecovery({ baseUrl, token, timeoutMs, minimumItems }) {
  const socketResult = createSocket(baseUrl, token, timeoutMs);
  const startedAt = Date.now();
  const [recoveryResponse] = await Promise.all([
    fetch(`${baseUrl.replace(/\/$/, '')}/notifications?limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    socketResult.connected,
  ]);
  const body = await recoveryResponse.json();
  socketResult.socket.disconnect();
  if (!recoveryResponse.ok) {
    throw new Error(`Notification recovery failed with HTTP ${recoveryResponse.status}`);
  }
  const itemCount = Array.isArray(body.items) ? body.items.length : 0;
  if (itemCount < minimumItems) {
    throw new Error(
      `Notification recovery returned ${itemCount} items; at least ${minimumItems} are required for the first-100 gate`,
    );
  }
  return { itemCount, elapsedMs: Date.now() - startedAt, nextCursor: body.nextCursor ?? null };
}

async function measureIsolation({ baseUrl, primaryToken, secondaryToken, trigger, eventType, timeoutMs, isolationWindowMs }) {
  const primary = createSocket(baseUrl, primaryToken, timeoutMs);
  const secondary = createSocket(baseUrl, secondaryToken, timeoutMs);
  await Promise.all([primary.connected, secondary.connected]);

  let primaryEvents = 0;
  let secondaryEvents = 0;
  const primaryHandler = (value) => {
    if (isEnvelope(value) && (!value.type || value.type === eventType)) primaryEvents += 1;
  };
  const secondaryHandler = (value) => {
    if (isEnvelope(value)) secondaryEvents += 1;
  };
  primary.socket.on(eventType, primaryHandler);
  secondary.socket.on('notification.created', secondaryHandler);
  secondary.socket.on('notification.read_state_changed', secondaryHandler);

  try {
    await triggerNotification({
      ...trigger,
      baseUrl,
      runId: randomUUID(),
    });
    await waitUntil(() => primaryEvents > 0, timeoutMs, `the primary isolation event`);
    await sleep(isolationWindowMs);
  } finally {
    primary.socket.off(eventType, primaryHandler);
    secondary.socket.off('notification.created', secondaryHandler);
    secondary.socket.off('notification.read_state_changed', secondaryHandler);
    primary.socket.disconnect();
    secondary.socket.disconnect();
  }

  if (secondaryEvents > 0) {
    throw new Error(`Cross-user leakage detected: secondary user received ${secondaryEvents} event(s)`);
  }
  return { primaryEvents, secondaryEvents };
}

function printHelp() {
  console.log(`Realtime profile gate

Required environment:
  REALTIME_PROFILE_RECIPIENT_TOKEN  token for the notification recipient
  REALTIME_PROFILE_SECONDARY_TOKEN  token for a different user
  REALTIME_PROFILE_TRIGGER_TOKEN    token authorized to run the trigger action
  REALTIME_PROFILE_TRIGGER_URL      relative or absolute endpoint that creates one Notification

Optional environment:
  REALTIME_PROFILE_TRIGGER_METHOD   default POST
  REALTIME_PROFILE_TRIGGER_BODY     JSON/text body; __PROFILE_RUN_ID__ is replaced per run
  REALTIME_PROFILE_TRIGGER_HEADERS  JSON object of extra headers
  REALTIME_PROFILE_ISOLATION_TRIGGER_URL/BODY  optional second trigger for isolation
  REALTIME_PROFILE_BASE_URL         default http://localhost:4000
  REALTIME_PROFILE_SOCKET_COUNT     default 500
  REALTIME_PROFILE_CONNECT_BATCH    default 50
  REALTIME_PROFILE_TIMEOUT_MS       default 10000
  REALTIME_PROFILE_PUBLICATION_TIMEOUT_MS default 5000
  REALTIME_PROFILE_ISOLATION_WINDOW_MS default 1000
  REALTIME_PROFILE_RECOVERY_MIN_ITEMS default 100
`);
}

async function main() {
  if (process.argv.includes('--help')) {
    printHelp();
    return;
  }

  const baseUrl = process.env.REALTIME_PROFILE_BASE_URL?.trim() || 'http://localhost:4000';
  const recipientToken = requiredEnv('REALTIME_PROFILE_RECIPIENT_TOKEN');
  const secondaryToken = requiredEnv('REALTIME_PROFILE_SECONDARY_TOKEN');
  const triggerToken = requiredEnv('REALTIME_PROFILE_TRIGGER_TOKEN');
  const triggerUrl = requiredEnv('REALTIME_PROFILE_TRIGGER_URL');
  const trigger = {
    token: triggerToken,
    url: triggerUrl,
    body: process.env.REALTIME_PROFILE_TRIGGER_BODY,
  };
  const isolationTrigger = {
    ...trigger,
    url: process.env.REALTIME_PROFILE_ISOLATION_TRIGGER_URL?.trim() || trigger.url,
    body: process.env.REALTIME_PROFILE_ISOLATION_TRIGGER_BODY ?? trigger.body,
  };
  const eventType = process.env.REALTIME_PROFILE_EVENT_TYPE?.trim() || DEFAULT_EVENT_TYPE;
  const socketCount = integerEnv('REALTIME_PROFILE_SOCKET_COUNT', DEFAULT_SOCKET_COUNT, {
    maximum: 2_000,
  });
  const batchSize = integerEnv('REALTIME_PROFILE_CONNECT_BATCH', 50, { maximum: socketCount });
  const timeoutMs = integerEnv('REALTIME_PROFILE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  const publicationTimeoutMs = integerEnv(
    'REALTIME_PROFILE_PUBLICATION_TIMEOUT_MS',
    DEFAULT_PUBLICATION_TIMEOUT_MS,
  );
  const isolationWindowMs = integerEnv(
    'REALTIME_PROFILE_ISOLATION_WINDOW_MS',
    DEFAULT_ISOLATION_WINDOW_MS,
  );
  const recoveryMinimumItems = integerEnv(
    'REALTIME_PROFILE_RECOVERY_MIN_ITEMS',
    DEFAULT_RECOVERY_MIN_ITEMS,
    { maximum: 100 },
  );

  let sockets = [];
  const startedAt = Date.now();
  try {
    const connection = await connectSockets({
      baseUrl,
      token: recipientToken,
      count: socketCount,
      timeoutMs,
      batchSize,
    });
    sockets = connection.sockets;
    const publication = await measurePublication({
      sockets,
      baseUrl,
      trigger,
      eventType,
      timeoutMs: publicationTimeoutMs,
    });
    await closeSockets(sockets);
    sockets = [];

    const recovery = await measureRecovery({
      baseUrl,
      token: recipientToken,
      timeoutMs,
      minimumItems: recoveryMinimumItems,
    });
    const isolation = await measureIsolation({
      baseUrl,
      primaryToken: recipientToken,
      secondaryToken,
      trigger: isolationTrigger,
      eventType,
      timeoutMs,
      isolationWindowMs,
    });

    console.log(
      JSON.stringify(
        {
          status: 'passed',
          baseUrl,
          socketCount,
          connection: {
            p50: percentile(connection.connectionLatencies, 50),
            p95: percentile(connection.connectionLatencies, 95),
            max: Math.max(...connection.connectionLatencies),
          },
          publication,
          recovery,
          isolation,
          elapsedMs: Date.now() - startedAt,
        },
        null,
        2,
      ),
    );
  } finally {
    await closeSockets(sockets);
  }
}

main().catch((error) => {
  console.error(`Realtime profile failed: ${error.message}`);
  process.exitCode = 1;
});
