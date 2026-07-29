import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

function readEnvironmentFile() {
  const environmentPath = path.join(repositoryRoot, '.env');
  if (!fs.existsSync(environmentPath)) return {};
  const values = {};
  for (const sourceLine of fs.readFileSync(environmentPath, 'utf8').split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).replace(/^export\s+/, '').trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function resolveServiceUrl(input, fileEnvironment, runningInDocker) {
  const rawValue = process.env[input.urlKey] ?? fileEnvironment[input.urlKey];
  if (!rawValue) {
    throw new Error(
      `${input.urlKey} must be configured through the environment or .env`,
    );
  }
  const serviceUrl = new URL(rawValue);
  if (!runningInDocker && serviceUrl.hostname === input.composeHostname) {
    serviceUrl.hostname = 'localhost';
    serviceUrl.port =
      process.env[input.hostPortKey] ??
      fileEnvironment[input.hostPortKey] ??
      input.defaultHostPort;
  }
  return serviceUrl;
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  throw new Error('A local binary command is required');
}

const fileEnvironment = readEnvironmentFile();
const runningInDocker = fs.existsSync('/.dockerenv');
const databaseUrl = resolveServiceUrl(
  {
    urlKey: 'DATABASE_URL',
    hostPortKey: 'POSTGRES_PORT',
    composeHostname: 'postgres',
    defaultHostPort: '5433',
  },
  fileEnvironment,
  runningInDocker,
);
const redisUrl = resolveServiceUrl(
  {
    urlKey: 'REDIS_URL',
    hostPortKey: 'REDIS_PORT',
    composeHostname: 'redis',
    defaultHostPort: '6379',
  },
  fileEnvironment,
  runningInDocker,
);

if (!runningInDocker) {
  console.log(
    `Using local services: PostgreSQL ${databaseUrl.hostname}:${databaseUrl.port}, Redis ${redisUrl.hostname}:${redisUrl.port}`,
  );
}

const executable = path.join(repositoryRoot, 'node_modules', '.bin', command);
const child = spawn(executable, args, {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl.toString(),
    REDIS_URL: redisUrl.toString(),
  },
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}

child.once('error', (error) => {
  console.error(`Unable to start ${command}: ${error.message}`);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  process.exitCode = signal ? 0 : (code ?? 1);
});
