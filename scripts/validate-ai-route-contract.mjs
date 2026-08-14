/**
 * Fails when the AI service no longer serves a route this backend calls.
 *
 * The two repositories test each other with mocks, so a renamed or dropped
 * FastAPI route is invisible on both sides until a real request is made in a
 * real environment. That is not hypothetical: `/advisory-fit/assess` was
 * renamed to `/advisory-fit/analyze` on one AI branch while these clients still
 * called `/assess`, and nothing failed until the service was actually run.
 *
 * The backend's own code is the source of truth for what it calls — a manifest
 * that can drift from the code is worth nothing — so the called set is
 * extracted from `src/modules/ai/integrations/*.client.ts` and the configured
 * defaults in `env.validation.ts`. The manifest is only the assertion.
 *
 * Two modes:
 *
 * - `AI_SERVICE_URL` reachable  → compare against the live `/openapi.json`,
 *   which tests reality rather than a copy.
 * - otherwise (the normal CI case) → compare against
 *   `docs/ai-service-routes.json`, and fail if that manifest disagrees with
 *   the code.
 *
 * Extra routes on the AI service are fine: it may serve more than we use. Only
 * a route we call and it does not serve is a failure.
 */
import fs from 'node:fs';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const integrationsDir = path.join(repositoryRoot, 'src/modules/ai/integrations');
const envValidationPath = path.join(
  repositoryRoot,
  'src/shared/config/env.validation.ts',
);
const manifestPath = path.join(repositoryRoot, 'docs/ai-service-routes.json');

const errors = [];

/**
 * Paths the clients build directly, e.g. `` `${baseUrl}/skill-profiles/generate` ``.
 * Template literals are why a naive search for quoted strings misses one.
 */
function literalClientPaths() {
  const found = new Set();
  for (const file of fs.readdirSync(integrationsDir)) {
    if (!file.endsWith('.client.ts')) continue;
    const source = fs.readFileSync(path.join(integrationsDir, file), 'utf8');
    for (const match of source.matchAll(/\$\{baseUrl\}(\/[a-zA-Z0-9/_-]+)/g)) {
      found.add(match[1]);
    }
  }
  return found;
}

/**
 * Paths that are configurable, read from their `AI_*_PATH` default. The default
 * is what ships, so it is what must exist on the other side.
 */
function configuredClientPaths() {
  const found = new Set();
  const clientSources = fs
    .readdirSync(integrationsDir)
    .filter((file) => file.endsWith('.client.ts'))
    .map((file) => fs.readFileSync(path.join(integrationsDir, file), 'utf8'))
    .join('\n');
  const envSource = fs.readFileSync(envValidationPath, 'utf8');

  // Only keys the clients actually read; an unused env key is not a contract.
  const usedKeys = new Set(
    [...clientSources.matchAll(/'(AI_[A-Z0-9_]*PATH)'/g)].map((m) => m[1]),
  );
  for (const key of usedKeys) {
    const declaration = new RegExp(
      `${key}:[\\s\\S]{0,400}?\\.default\\(\\s*'([^']+)'`,
    ).exec(envSource);
    if (!declaration) {
      errors.push(
        `${key} is read by an AI client but has no default in env.validation.ts, ` +
          'so there is nothing to check the AI service against.',
      );
      continue;
    }
    found.add(declaration[1]);
  }
  return found;
}

function calledRoutes() {
  return new Set([...literalClientPaths(), ...configuredClientPaths()]);
}

async function servedRoutesFromService(baseUrl) {
  const response = await fetch(new URL('/openapi.json', baseUrl), {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`openapi.json returned ${response.status}`);
  const document = await response.json();
  return new Set(Object.keys(document.paths ?? {}));
}

function servedRoutesFromManifest() {
  if (!fs.existsSync(manifestPath)) {
    errors.push(
      `Missing ${path.relative(repositoryRoot, manifestPath)}. It records the ` +
        'AI routes this backend depends on; regenerate it from the AI service.',
    );
    return new Set();
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return new Set(manifest.routes ?? []);
}

const called = calledRoutes();
if (called.size === 0) {
  errors.push(
    'No AI routes were extracted from the clients. The extraction is stale — ' +
      'fix this script rather than letting it pass vacuously.',
  );
}

const baseUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8010';
let served;
let source;
try {
  served = await servedRoutesFromService(baseUrl);
  source = `the live AI service at ${baseUrl}`;
} catch {
  served = servedRoutesFromManifest();
  source = `docs/ai-service-routes.json (the AI service at ${baseUrl} was unreachable)`;
}

// The manifest is an assertion about the code, so it must not drift from it.
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const recorded = new Set(manifest.calledByBackend ?? []);
  const undocumented = [...called].filter((route) => !recorded.has(route));
  const stale = [...recorded].filter((route) => !called.has(route));
  for (const route of undocumented) {
    errors.push(
      `The backend calls ${route} but docs/ai-service-routes.json does not ` +
        'record it. Add it, and make sure the AI service serves it.',
    );
  }
  for (const route of stale) {
    errors.push(
      `docs/ai-service-routes.json records ${route} as called, but no AI ` +
        'client calls it any more. Remove it.',
    );
  }
}

const missing = [...called].filter((route) => !served.has(route)).sort();
for (const route of missing) {
  errors.push(
    `The AI service does not serve ${route}, which this backend calls. ` +
      'Change the AI service (ITI-Sharek/AI_Agents) first, or this feature ' +
      'returns 404 at runtime.',
  );
}

if (errors.length > 0) {
  console.error('AI route contract check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `AI route contract passed: ${called.size} route(s) called by the backend, ` +
    `all served, checked against ${source}.`,
);
