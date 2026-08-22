import fs from 'node:fs';
import path from 'node:path';

import { extractControllerRoutes } from './lib/http-route-inventory.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(repositoryRoot, 'docs/api-route-reference.md');

const MODULE_TITLES = {
  admin: 'Admin',
  applications: 'Applications, Assessments & Owner Decisions',
  'assignment-conversations': 'Assignment Conversations',
  'chat-attachments': 'Chat Attachments',
  'contribution-proposals': 'Contribution Proposals',
  'contribution-tasks': 'Contribution Requests',
  'contributor-profiles': 'Contributor Profiles',
  dashboard: 'Contributor Dashboard',
  'delivery-reviews': 'Deliveries & Reviews',
  eligibility: 'Eligibility Gate',
  github: 'GitHub Connection',
  health: 'Health',
  identity: 'Identity, Auth & Session',
  matching: 'Matching & Recommendations',
  materials: 'Materials & Material Analysis',
  notifications: 'Notifications',
  payments: 'Payments',
  projects: 'Projects',
  'skill-guidance': 'Skill Gap & Eligibility Guidance',
  'skill-profiles': 'Skill Profiles',
  subscriptions: 'Subscriptions',
};

const routes = extractControllerRoutes(repositoryRoot);
const byModule = new Map();

for (const route of routes) {
  const segments = route.source.split('/');
  const moduleName = segments[1] === 'modules' ? segments[2] : segments[1];
  const bucket = byModule.get(moduleName) ?? [];
  bucket.push(route);
  byModule.set(moduleName, bucket);
}

const moduleNames = [...byModule.keys()].sort((a, b) =>
  (MODULE_TITLES[a] ?? a).localeCompare(MODULE_TITLES[b] ?? b),
);

function authCell(route) {
  if (route.authentication !== 'bearer') return 'public';
  if (route.roles.length > 0) return `bearer · ${route.roles.join(', ')}`;
  return 'bearer';
}

function notesCell(route) {
  const notes = [];
  if (route.idempotency) notes.push('idempotency key');
  if (route.acceptsRawBody) notes.push('raw body');
  if (route.multipartFields.length > 0) notes.push('multipart');
  if (route.queryParameters.length > 0) {
    const names = route.queryParameters.map((parameter) =>
      typeof parameter === 'string' ? parameter : parameter.name,
    );
    notes.push(`query: ${names.join(', ')}`);
  }
  return notes.length > 0 ? notes.join(' · ') : '—';
}

const lines = [];
lines.push('# API Route Reference');
lines.push('');
lines.push(
  '<!-- GENERATED FILE. Run `npm run docs:routes` to regenerate. Do not edit by hand. -->',
);
lines.push('');
lines.push(
  `Every HTTP route the NestJS backend serves: **${routes.length} routes** across ` +
    `**${moduleNames.length} modules**, extracted from the \`@Controller\` classes in \`src/\`.`,
);
lines.push('');
lines.push(
  'There is no global route prefix. Paths are served from the application root ' +
    '(`PORT`, default `4000`).',
);
lines.push('');
lines.push('Column meanings:');
lines.push('');
lines.push(
  '- **Auth** — `public` means no `AccessTokenGuard`; `bearer` means an opaque ' +
    'access token is required; roles listed after `·` come from `@Roles(...)`.',
);
lines.push(
  '- **Notes** — `idempotency key` marks commands that accept a client-supplied ' +
    'UUID and are safe to retry; `multipart` and `raw body` mark non-JSON bodies.',
);
lines.push('');
lines.push(
  'For behaviour, error codes, and payload rules see [`api-contracts.md`](./api-contracts.md). ' +
    'For runnable examples see [`postman-api-guide.md`](./postman-api-guide.md) and `sharek-api.http`.',
);
lines.push('');
lines.push('## Contents');
lines.push('');
for (const moduleName of moduleNames) {
  const title = MODULE_TITLES[moduleName] ?? moduleName;
  // Mirror GitHub's anchor rules: lowercase, drop punctuation, then map each
  // remaining space to one hyphen. Collapsing runs of spaces would produce a
  // single hyphen where GitHub emits two, and the link would not resolve.
  const anchor = title
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-');
  const count = byModule.get(moduleName).length;
  lines.push(
    `- [${title}](#${anchor}) — ${count} ${count === 1 ? 'route' : 'routes'}`,
  );
}
lines.push('');

for (const moduleName of moduleNames) {
  const title = MODULE_TITLES[moduleName] ?? moduleName;
  const moduleRoutes = byModule
    .get(moduleName)
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  lines.push(`## ${title}`);
  lines.push('');
  lines.push(`Module: \`src/modules/${moduleName}/\``);
  lines.push('');
  lines.push('| Method | Path | Auth | Status | Handler | Notes |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const route of moduleRoutes) {
    lines.push(
      `| \`${route.method}\` | \`${route.path}\` | ${authCell(route)} | ${route.successStatus} | ` +
        `\`${route.controller}.${route.handler}\` | ${notesCell(route)} |`,
    );
  }
  lines.push('');
}

lines.push('## Not covered by the table above');
lines.push('');
lines.push(
  'The shared extractor reads `@Get`/`@Post`/`@Put`/`@Patch`/`@Delete` only, so ' +
    'one streaming route is invisible to it and is listed here by hand:',
);
lines.push('');
lines.push('| Method | Path | Auth | Handler | Notes |');
lines.push('| --- | --- | --- | --- | --- |');
lines.push(
  '| `GET` | `/contributors/me/skill-gap-guidance/stream` | bearer | ' +
    '`SkillGapGuidanceController.stream` | `@Sse` — Server-Sent Events, ' +
    'query: `contributionRequestId` |',
);
lines.push('');
lines.push('## Realtime surface');
lines.push('');
lines.push(
  'Not an HTTP route, but part of the same API contract. Namespace `/realtime`, ' +
    'WebSocket transport only, authenticated with the same opaque access token via ' +
    '`auth.token` or an `Authorization: Bearer` header.',
);
lines.push('');
lines.push('| Event | Direction | Payload |');
lines.push('| --- | --- | --- |');
lines.push(
  '| `notification.created` | server → client | `RealtimeEventEnvelope` v1, room `user:<id>` |',
);
lines.push(
  '| `notification.read_state_changed` | server → client | `RealtimeEventEnvelope` v1, room `user:<id>` |',
);
lines.push(
  '| `conversation.message.created` | server → client | `RealtimeEventEnvelope` v1, room `user:<id>` |',
);
lines.push(
  '| `realtime.error` | server → client | `REALTIME_UNAUTHORIZED`, emitted before disconnect |',
);
lines.push('');

fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
console.log(
  `Wrote ${path.relative(repositoryRoot, outputPath)} with ${routes.length} routes across ${moduleNames.length} modules.`,
);
