import fs from 'node:fs';
import path from 'node:path';

import {
  extractControllerRoutes,
  routeKey,
} from './lib/http-route-inventory.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const collectionPath = path.join(
  repositoryRoot,
  'postman/sharek-backend.postman_collection.json',
);
const environmentPath = path.join(
  repositoryRoot,
  'postman/sharek-backend.postman_environment.json',
);
const guidePath = path.join(repositoryRoot, 'docs/postman-api-guide.md');
const inventoryPath = path.join(
  repositoryRoot,
  'postman/controller-route-inventory.json',
);

const sourceCollection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
const inventory = extractControllerRoutes(repositoryRoot);
const inventoryByKey = new Map(inventory.map((route) => [route.key, route]));
const candidates = flattenRequests(sourceCollection.item);
const candidatesByKey = new Map();

for (const candidate of candidates) {
  const parsed = parseUrl(candidate.item.request.url);
  const key = routeKey(candidate.item.request.method, parsed.pathname);
  const values = candidatesByKey.get(key) ?? [];
  values.push({ ...candidate, parsed });
  candidatesByKey.set(key, values);
}

const folders = new Map();
for (const route of inventory) {
  const candidatesForRoute = candidatesByKey.get(route.key) ?? [];
  const selected =
    candidatesForRoute.length > 0
      ? selectCanonicalCandidate(route, candidatesForRoute)
      : syntheticCandidate(route);
  const item = normalizeItem(route, selected);
  const folderName = folderFor(route);
  const items = folders.get(folderName) ?? [];
  items.push(item);
  folders.set(folderName, items);
}

const orderedFolderNames = [
  'Health',
  'Identity and Sessions',
  'OAuth',
  'GitHub Evidence',
  'GitHub App',
  'Projects',
  'Contribution Requests',
  'Applications',
  'Delivery Reviews',
  'Contribution Proposals',
  'Materials',
  'Material Analysis',
  'Contributor Profiles',
  'Skill Profiles',
  'Assignment Conversations',
  'Notifications',
  'Subscriptions',
  'Admin',
];

const collection = {
  info: {
    _postman_id:
      sourceCollection.info?._postman_id ??
      'f45dc702-c21c-4a79-a3b8-2c3535af5988',
    name: 'Share-k Backend — Complete Controller Coverage',
    description:
      'Canonical Postman Collection v2.1 coverage for every implemented NestJS HTTP method/path pair. Controllers and validated DTOs are the source of truth. Provider callbacks and webhooks require external setup; all committed values are fictional placeholders.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: bearerAuth('accessToken'),
  event: [
    scriptEvent('prerequest', [
      "const uuidVariables = ['applicationIdempotencyKey', 'assessmentIdempotencyKey', 'acceptIdempotencyKey', 'declineIdempotencyKey', 'withdrawalIdempotencyKey', 'createRequestIdempotencyKey', 'updateRequestIdempotencyKey', 'discardRequestIdempotencyKey', 'publishRequestIdempotencyKey', 'cancelRequestIdempotencyKey', 'projectCommandIdempotencyKey', 'proposalSubmissionIdempotencyKey', 'proposalRevisionIdempotencyKey', 'proposalVersionIdempotencyKey', 'proposalWithdrawalIdempotencyKey', 'proposalAcceptIdempotencyKey', 'proposalDeclineIdempotencyKey', 'proposalMisuseIdempotencyKey', 'materialIdempotencyKey', 'materialAnalysisIdempotencyKey', 'messageIdempotencyKey', 'deliverySubmissionIdempotencyKey', 'deliveryUpdateIdempotencyKey', 'deliveryReviewIdempotencyKey'];",
      'uuidVariables.forEach(function (name) {',
      "  if (!pm.environment.get(name)) pm.environment.set(name, pm.variables.replaceIn('{{$guid}}'));",
      '});',
      "if (!pm.environment.get('applicationsCloseTime')) {",
      '  pm.environment.set(\'applicationsCloseTime\', new Date(Date.now() + 14 * 86400000).toISOString());',
      '}',
      "if (!pm.environment.get('targetCompletionDate')) {",
      '  pm.environment.set(\'targetCompletionDate\', new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));',
      '}',
    ]),
  ],
  item: orderedFolderNames
    .filter((name) => folders.has(name))
    .map((name) => ({
      name,
      description: folderDescription(name),
      item: folders
        .get(name)
        .sort((left, right) => left.name.localeCompare(right.name)),
    })),
};

const referencedVariables = collectVariables(collection);
const environment = {
  id:
    JSON.parse(fs.readFileSync(environmentPath, 'utf8')).id ??
    '658527b8-65c3-4eaa-a846-096621972348',
  name: 'Share-k Local — Safe Placeholders',
  values: [...referencedVariables]
    .sort()
    .map((key) => ({ key, value: safeEnvironmentValue(key), enabled: true })),
  _postman_variable_scope: 'environment',
  _postman_exported_at: new Date(0).toISOString(),
  _postman_exported_using: 'Share-k deterministic Postman artifact generator',
};

fs.writeFileSync(collectionPath, `${JSON.stringify(collection, null, 2)}\n`);
fs.writeFileSync(environmentPath, `${JSON.stringify(environment, null, 2)}\n`);
fs.writeFileSync(
  inventoryPath,
  `${JSON.stringify(
    {
      generatedFrom: 'src/**/*.ts files containing @Controller',
      routeCount: inventory.length,
      routes: inventory,
    },
    null,
    2,
  )}\n`,
);
fs.writeFileSync(guidePath, buildGuide(collection, inventoryByKey));

console.log(
  `Synchronized ${inventory.length} canonical Postman requests, ${referencedVariables.size} environment variables, the normalized controller inventory, and the guide.`,
);

function flattenRequests(items, parents = []) {
  return (items ?? []).flatMap((item) => [
    ...(item.request ? [{ item, parents }] : []),
    ...flattenRequests(item.item, [...parents, item.name]),
  ]);
}

function parseUrl(requestUrl) {
  const raw =
    typeof requestUrl === 'string'
      ? requestUrl
      : requestUrl?.raw ??
        `{{baseUrl}}/${(requestUrl?.path ?? []).join('/')}`;
  const normalized = raw.replace('{{base_url}}', '{{baseUrl}}');
  const withoutBase = normalized.replace(/^\{\{baseUrl\}\}/, '');
  const [pathname, queryString = ''] = withoutBase.split('?');
  const query = [];
  for (const pair of queryString.split('&').filter(Boolean)) {
    const separator = pair.indexOf('=');
    query.push({
      key: separator === -1 ? pair : pair.slice(0, separator),
      value: separator === -1 ? '' : pair.slice(separator + 1),
    });
  }
  if (typeof requestUrl !== 'string') {
    for (const entry of requestUrl?.query ?? []) {
      const existing = query.find((candidate) => candidate.key === entry.key);
      if (existing) Object.assign(existing, entry);
      else query.push({ ...entry });
    }
  }
  return { pathname: pathname || '/', query };
}

function selectCanonicalCandidate(route, candidatesForRoute) {
  const preferred = candidatesForRoute
    .map((candidate) => ({
      candidate,
      score:
        (candidate.parsed.pathname.includes('{{base_url}}') ? -100 : 0) +
        (candidate.item.name.includes('Register Owner') ? 20 : 0) +
        (candidate.parents[0] === 'Auth' ? 10 : 0) +
        (candidate.item.name.includes('Import GitHub Project') ? 10 : 0),
    }))
    .sort((left, right) => right.score - left.score)[0];
  if (!preferred) throw new Error(`No Postman candidate for ${route.key}`);
  return preferred.candidate;
}

function syntheticCandidate(route) {
  const pathname = route.path.replace(
    /:([A-Za-z0-9_]+)/g,
    (_match, parameter) => `{{${parameter}}}`,
  );
  const name = route.handler
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (value) => value.toUpperCase());
  return {
    item: {
      name,
      request: {
        method: route.method,
        header: [],
        url: {
          raw: `{{baseUrl}}${pathname}`,
          host: ['{{baseUrl}}'],
          path: pathname.split('/').filter(Boolean),
        },
      },
    },
    parents: [],
    parsed: { pathname, query: [] },
  };
}

function normalizeItem(route, selected) {
  const item = structuredClone(selected.item);
  delete item.response;
  delete item.event;
  item.name = canonicalRequestName(route, item.name);
  item.request.method = route.method;
  item.request.url = normalizeUrl(route, selected.parsed);
  item.request.header = normalizeHeaders(route, item.request.header ?? []);
  item.request.auth = requestAuth(route);
  if (item.request.auth === null) delete item.request.auth;
  item.request.description = requestDescription(route, item.name);
  applyBodyCorrections(route, item.request);
  item.event = [
    scriptEvent('test', [
      `pm.test('Status is ${route.successStatus}', function () {`,
      `  pm.response.to.have.status(${route.successStatus});`,
      '});',
      ...(expectsJson(route)
        ? [
            "pm.test('Response is JSON', function () {",
            "  pm.expect(pm.response.headers.get('Content-Type') || '').to.include('application/json');",
            '  const body = pm.response.json();',
            "  pm.expect(body === null || typeof body === 'object').to.eql(true);",
            '});',
          ]
        : []),
      ...captureScript(route),
    ]),
  ];
  return item;
}

function normalizeUrl(route, parsed) {
  const queryByName = new Map(route.queryParameters.map((query) => [query.name, query]));
  const query = parsed.query.map((entry) => ({
    key: entry.key,
    value: normalizeQueryValue(entry.key, entry.value),
    ...(queryByName.get(entry.key)?.optional ? { disabled: true } : {}),
  }));
  for (const queryParameter of route.queryParameters) {
    if (!query.some((entry) => entry.key === queryParameter.name)) {
      query.push({
        key: queryParameter.name,
        value: defaultQueryValue(queryParameter.name),
        ...(queryParameter.optional ? { disabled: true } : {}),
      });
    }
  }
  const rawQuery = query
    .filter((entry) => !entry.disabled)
    .map((entry) => `${entry.key}=${entry.value}`)
    .join('&');
  return {
    raw: `{{baseUrl}}${parsed.pathname}${rawQuery ? `?${rawQuery}` : ''}`,
    host: ['{{baseUrl}}'],
    path: parsed.pathname.split('/').filter(Boolean),
    ...(query.length > 0 ? { query } : {}),
  };
}

function normalizeQueryValue(key, value) {
  if (key === 'author') return '{{githubAuthor}}';
  if (key === 'fullName') return '{{repositoryFullName}}';
  if (key === 'code') return value.includes('google') ? '{{googleCode}}' : value;
  return String(value).replace('abdullah', '{{githubAuthor}}');
}

function defaultQueryValue(name) {
  const values = {
    author: '{{githubAuthor}}',
    code: '{{githubCode}}',
    state: '{{githubState}}',
    error: '',
    error_description: '',
    fullName: '{{repositoryFullName}}',
    page: '1',
    perPage: '20',
    limit: '20',
    cursor: '{{cursor}}',
    query: 'NestJS',
    token: '{{materialDownloadToken}}',
    installationLinkId: '{{installationLinkId}}',
  };
  return values[name] ?? '';
}

function normalizeHeaders(route, headers) {
  const normalized = headers
    .filter((header) => header.key?.toLowerCase() !== 'authorization')
    .filter((header) => header.key?.toLowerCase() !== 'content-type');
  if (route.contentType === 'application/json') {
    normalized.push({ key: 'Content-Type', value: 'application/json' });
  }
  if (
    route.headers.some(
      (header) => header.name.toLowerCase() === 'idempotency-key',
    ) &&
    !normalized.some(
      (header) => header.key?.toLowerCase() === 'idempotency-key',
    )
  ) {
    normalized.push({
      key: 'Idempotency-Key',
      value: idempotencyVariableFor(route),
    });
  }
  return normalized;
}

function idempotencyVariableFor(route) {
  if (route.path.endsWith('/deliveries')) {
    return '{{deliverySubmissionIdempotencyKey}}';
  }
  if (route.path.endsWith('/reviews')) {
    return '{{deliveryReviewIdempotencyKey}}';
  }
  if (route.path.startsWith('/deliveries/')) {
    return '{{deliveryUpdateIdempotencyKey}}';
  }
  if (route.path.includes('/projects/') && route.path.includes('/contribution-requests')) {
    return '{{createRequestIdempotencyKey}}';
  }
  if (route.path.endsWith('/discard')) return '{{discardRequestIdempotencyKey}}';
  if (route.path.endsWith('/publish')) return '{{publishRequestIdempotencyKey}}';
  if (route.path.endsWith('/cancel')) return '{{cancelRequestIdempotencyKey}}';
  if (route.path.endsWith('/withdraw')) return '{{withdrawalIdempotencyKey}}';
  if (route.path.endsWith('/accept')) return '{{acceptIdempotencyKey}}';
  if (route.path.endsWith('/decline')) return '{{declineIdempotencyKey}}';
  return '{{projectCommandIdempotencyKey}}';
}

function applyBodyCorrections(route, request) {
  const key = route.key;
  const bodies = new Map([
    ['POST /auth/register', {
      email: '{{ownerEmail}}', password: '{{ownerPassword}}', username: '{{ownerUsername}}',
      firstName: 'Sharek', lastName: 'Owner', role: 'owner', preferredLanguage: 'en',
    }],
    ['POST /auth/verify-email', { email: '{{ownerEmail}}', code: '{{ownerOtp}}' }],
    ['POST /auth/login', { email: '{{ownerEmail}}', password: '{{ownerPassword}}' }],
    ['POST /auth/reset-password', {
      email: '{{ownerEmail}}', code: '{{passwordResetOtp}}', newPassword: '{{newPassword}}',
    }],
    ['POST /projects/:parameter/material-analysis/sets', {
      materialVersions: [{ materialId: '{{materialId}}', version: 1 }],
    }],
    ['POST /material-analysis/suggestions/:parameter/adopt-project', {
      expectedRevision: 1, idempotencyKey: '{{materialAnalysisIdempotencyKey}}',
    }],
    ['POST /material-analysis/suggestions/:parameter/adopt-contribution-request', {
      applicationsCloseTime: '{{applicationsCloseTime}}',
      targetCompletionDate: '{{targetCompletionDate}}',
      rewardCents: 5000,
      rewardCurrency: 'USD',
      idempotencyKey: '{{materialAnalysisIdempotencyKey}}',
    }],
    ['POST /assignment-conversations/:parameter/messages', {
      idempotencyKey: '{{messageIdempotencyKey}}',
      body: 'Hello from the Assignment conversation.',
    }],
    ['POST /applications/:parameter/deliveries', {
      pullRequestUrl: 'https://github.com/octocat/Hello-World/pull/1',
      contributorNotes: 'Ready for owner review.',
    }],
    ['PATCH /deliveries/:parameter', {
      pullRequestUrl: 'https://github.com/octocat/Hello-World/pull/2',
      contributorNotes: 'Updated after review.',
    }],
    ['POST /deliveries/:parameter/reviews', {
      outcome: 'APPROVED',
      rating: 5,
      feedback: 'The delivery meets the request requirements.',
    }],
    ['POST /contributors/me/skill-gap-guidance', {
      contributionRequestId: '{{contributionRequestId}}',
    }],
    // Block-triggered guidance (P0-B05). Scoped to a recorded evaluation, not
    // to a Contribution Request: under a hard block no Application exists.
    ['POST /contributors/me/eligibility-guidance', {
      eligibilityEvaluationId: '{{eligibilityEvaluationId}}',
    }],
    // Replaces the whole set, so the example sends both kinds: only `required`
    // rows can block, and `preferred` is advisory. No `source` or `confidence`
    // — an owner write is always the override, and the API rejects both fields.
    ['PUT /contribution-requests/:parameter/skill-requirements', {
      skillRequirements: [
        { skillName: 'NestJS', requiredLevel: 'intermediate', kind: 'required' },
        { skillName: 'PostgreSQL', requiredLevel: 'beginner', kind: 'preferred' },
      ],
    }],
    ['PATCH /me/notification-preferences', {
      expectedRevision: 1,
      retentionDays: 90,
      quietHours: { enabled: true, startLocal: '22:00', endLocal: '07:00', timeZone: 'Africa/Cairo' },
      categories: [{ type: 'match_found', inAppEnabled: false, browserEnabled: false }],
    }],
  ]);
  if (bodies.has(key)) request.body = jsonBody(bodies.get(key));
  if (
    key === 'POST /projects/import/github' ||
    key === 'POST /notifications/mark-all-read' ||
    key === 'POST /material-analysis/suggestions/:parameter/reject'
  ) {
    delete request.body;
    request.header = request.header.filter(
      (header) => header.key?.toLowerCase() !== 'content-type',
    );
  }
  if (request.body?.mode === 'raw' && !request.body.options) {
    request.body.options = { raw: { language: 'json' } };
  }
}

function jsonBody(value) {
  return {
    mode: 'raw',
    raw: JSON.stringify(value, null, 2),
    options: { raw: { language: 'json' } },
  };
}

function canonicalRequestName(route, currentName) {
  const overrides = new Map([
    ['POST /auth/register', 'Register Account'],
    ['POST /auth/login', 'Login'],
    ['POST /projects/import/github', 'Retired GitHub Import Compatibility Route'],
  ]);
  return (
    overrides.get(route.key) ??
    currentName.replace(/^\d+[a-z]?\s*-\s*/i, '').replace(/^M\d+\s*-\s*/i, '')
  );
}

function folderFor(route) {
  const routePath = route.path;
  if (routePath === '/health') return 'Health';
  if (routePath.startsWith('/admin/')) return 'Admin';
  if (routePath.startsWith('/auth/google') || routePath.startsWith('/auth/github')) return 'OAuth';
  if (routePath.startsWith('/auth/')) return 'Identity and Sessions';
  if (routePath.startsWith('/webhooks/github') || routePath.startsWith('/github/app')) return 'GitHub App';
  if (routePath.startsWith('/github/')) return 'GitHub Evidence';
  if (routePath.startsWith('/public/projects') || routePath.startsWith('/projects')) {
    if (routePath.includes('/contribution-requests')) return 'Contribution Requests';
    if (routePath.includes('/materials')) return 'Materials';
    if (routePath.includes('/material-analysis')) return 'Material Analysis';
    return 'Projects';
  }
  if (
    routePath.startsWith('/deliveries') ||
    routePath.startsWith('/owner/deliveries') ||
    routePath.startsWith('/owner/delivery-lifecycle') ||
    routePath.startsWith('/me/deliveries') ||
    (routePath.startsWith('/applications/') && routePath.endsWith('/deliveries'))
  ) return 'Delivery Reviews';
  if (routePath.startsWith('/applications') || routePath.startsWith('/owner-decisions')) return 'Applications';
  if (routePath.startsWith('/tasks')) {
    return routePath.includes('/applications') ? 'Applications' : 'Contribution Requests';
  }
  if (routePath.startsWith('/contribution-requests')) {
    return routePath.includes('/materials') ? 'Materials' : 'Contribution Requests';
  }
  if (routePath.startsWith('/contribution-proposals')) return 'Contribution Proposals';
  if (routePath.startsWith('/materials') || routePath.startsWith('/material-')) {
    return routePath.startsWith('/material-analysis') ? 'Material Analysis' : 'Materials';
  }
  if (routePath.startsWith('/contributors')) return 'Contributor Profiles';
  if (routePath.startsWith('/skill-profiles')) return 'Skill Profiles';
  if (routePath.startsWith('/assignment-conversations')) return 'Assignment Conversations';
  if (routePath.startsWith('/notifications') || routePath.startsWith('/me/notification')) return 'Notifications';
  if (routePath.startsWith('/me/subscription')) return 'Subscriptions';
  throw new Error(`No Postman folder mapping for ${route.key}`);
}

function requestAuth(route) {
  if (route.authentication === 'public') return { type: 'noauth' };
  const token = tokenVariableFor(route);
  return token === 'accessToken' ? null : bearerAuth(token);
}

function tokenVariableFor(route) {
  if (route.roles.includes('admin')) return 'adminAccessToken';
  const pathValue = route.path;
  if (pathValue.startsWith('/owner/deliveries')) return 'ownerAccessToken';
  if (pathValue.startsWith('/owner/delivery-lifecycle')) return 'ownerAccessToken';
  if (pathValue.startsWith('/me/deliveries')) return 'contributorAccessToken';
  if (pathValue.includes('/deliveries') && route.handler.includes('review')) {
    return 'ownerAccessToken';
  }
  if (
    pathValue.endsWith('/deliveries') ||
    (pathValue.startsWith('/deliveries/') && route.method === 'PATCH')
  ) return 'contributorAccessToken';
  if (
    pathValue.startsWith('/projects/me') ||
    pathValue.startsWith('/projects/github') ||
    pathValue.startsWith('/projects/:projectId/contribution-requests') ||
    pathValue.startsWith('/contribution-requests') ||
    pathValue.includes('/material-analysis')
  ) return 'ownerAccessToken';
  if (
    pathValue.startsWith('/skill-profiles') ||
    pathValue.startsWith('/contributors/profiles/me')
  ) return 'contributorAccessToken';
  if (pathValue.startsWith('/applications') || pathValue.includes('/applications')) {
    if (route.handler.includes('submit') || route.handler.includes('withdraw') || pathValue.startsWith('/owner-decisions')) {
      return 'contributorAccessToken';
    }
    return 'ownerAccessToken';
  }
  return 'accessToken';
}

function bearerAuth(variableName) {
  return {
    type: 'bearer',
    bearer: [{ key: 'token', value: `{{${variableName}}}`, type: 'string' }],
  };
}

function requestDescription(route, name) {
  const auth =
    route.authentication === 'public'
      ? 'Public; no bearer token is required.'
      : route.roles.length > 0
        ? `Requires an active bearer session with role: ${route.roles.join(' or ')}.`
        : 'Requires an active bearer session and any resource ownership/participant checks enforced by the owning service.';
  const prerequisites = route.pathParameters.length
    ? `Set ${route.pathParameters.map((parameter) => `the ${parameter} route ID`).join(' and ')} to an existing authorized resource.`
    : 'No route identifier prerequisite.';
  const external =
    route.path.includes('/callback') || route.path.includes('/webhooks/')
      ? ' Provider-driven: a successful call requires real external provider setup and fresh callback/signature values.'
      : '';
  const retired = route.successStatus === 410
    ? ' This compatibility route is intentionally retired and returns the stable 410 error without writing.'
    : '';
  return `${name}. ${auth} ${prerequisites} Expected status: ${route.successStatus}. ${importantErrors(route)}${external}${retired}`;
}

function importantErrors(route) {
  if (route.path === '/webhooks/github/app') {
    return 'Important errors: 400 for missing provider headers and 401 for an invalid raw-body signature.';
  }
  const failures = [];
  if (
    route.bodyDto ||
    route.queryParameters.length > 0 ||
    route.headers.length > 0 ||
    route.pathParameters.length > 0
  ) {
    failures.push('400 for invalid validated input');
  }
  if (route.authentication === 'bearer') {
    failures.push('401 for an invalid or expired session');
  }
  if (route.roles.length > 0) {
    failures.push('403 for an unauthorized role');
  } else if (route.authentication === 'bearer' && route.pathParameters.length > 0) {
    failures.push('owning-service authorization/not-found application errors');
  }
  return failures.length > 0
    ? `Important errors: ${failures.join('; ')}.`
    : 'Important errors use the global stable application-error envelope.';
}

function expectsJson(route) {
  return (
    route.successStatus !== 302 &&
    route.path !== '/material-downloads' &&
    !route.path.endsWith('/avatar')
  );
}

function captureScript(route) {
  const lines = [];
  if ([
    'POST /auth/verify-email',
    'POST /auth/login',
    'POST /auth/google/callback',
    'POST /auth/github/callback',
  ].includes(route.key)) {
    lines.push(
      `if (pm.response.code === ${route.successStatus}) {`,
      '  const body = pm.response.json();',
      '  if (body.tokens) {',
      "    pm.environment.set('accessToken', body.tokens.accessToken);",
      "    pm.environment.set('refreshToken', body.tokens.refreshToken);",
      "    if (body.user && body.user.id) pm.environment.set('userId', body.user.id);",
      "    if (body.user && ['owner', 'contributor', 'admin'].includes(body.user.role)) {",
      "      pm.environment.set(body.user.role + 'AccessToken', body.tokens.accessToken);",
      '    }',
      '  }',
      '}',
    );
  }
  if (route.key === 'POST /auth/refresh') {
    lines.push(
      'if (pm.response.code === 201) {',
      '  const body = pm.response.json();',
      "  pm.environment.set('accessToken', body.accessToken);",
      "  pm.environment.set('refreshToken', body.refreshToken);",
      '}',
    );
  }
  const captures = new Map([
    ['POST /projects', ['projectId', 'id']],
    ['POST /projects/:parameter/contribution-requests', ['contributionRequestId', 'id']],
    ['POST /tasks/:parameter/applications', ['applicationId', 'id']],
    ['POST /applications/:parameter/deliveries', ['deliveryId', 'id']],
    ['POST /contribution-proposals', ['contributionProposalId', 'id']],
    ['POST /projects/:parameter/materials', ['materialId', 'id']],
    ['POST /contribution-requests/:parameter/materials', ['materialId', 'id']],
    ['POST /skill-profiles/me/generations', ['generationId', 'generationId']],
    ['POST /projects/:parameter/material-analysis/sets', ['materialAnalysisSetId', 'id']],
    ['POST /material-analysis/sets/:parameter/runs', ['materialAnalysisRunId', 'id']],
  ]);
  const capture = captures.get(route.key);
  if (capture) {
    lines.push(
      `if (pm.response.code === ${route.successStatus}) {`,
      '  const body = pm.response.json();',
      `  if (body.${capture[1]}) pm.environment.set('${capture[0]}', body.${capture[1]});`,
      '}',
    );
  }
  if (route.key === 'POST /projects/github/preview') {
    lines.push(
      'if (pm.response.code === 200) {',
      "  pm.environment.set('previewFingerprint', pm.response.json().previewFingerprint);",
      '}',
    );
  }
  if (route.key === 'POST /applications/:parameter/decline') {
    lines.push(
      'if (pm.response.code === 200) {',
      "  pm.environment.set('ownerDecisionId', pm.response.json().ownerDecision.id);",
      '}',
    );
  }
  if (route.key === 'GET /assignment-conversations') {
    lines.push(
      'if (pm.response.code === 200) {',
      '  const items = pm.response.json().items;',
      "  if (items && items[0]) pm.environment.set('assignmentConversationId', items[0].conversationId);",
      '}',
    );
  }
  if (route.key === 'GET /notifications') {
    lines.push(
      'if (pm.response.code === 200) {',
      '  const items = pm.response.json().items;',
      "  if (items && items[0]) pm.environment.set('notificationId', items[0].notificationId);",
      '}',
    );
  }
  if (route.key === 'GET /material-analysis/runs/:parameter') {
    lines.push(
      'if (pm.response.code === 200) {',
      '  const suggestions = pm.response.json().suggestions;',
      "  if (suggestions && suggestions[0]) pm.environment.set('materialAnalysisSuggestionId', suggestions[0].id);",
      '}',
    );
  }
  return lines;
}

function scriptEvent(listen, exec) {
  return { listen, script: { type: 'text/javascript', exec } };
}

function collectVariables(value, variables = new Set()) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g)) {
      variables.add(match[1]);
    }
    for (const match of value.matchAll(/pm\.environment\.(?:get|set)\(\s*['"]([^'"]+)['"]/g)) {
      variables.add(match[1]);
    }
  } else if (Array.isArray(value)) {
    value.forEach((entry) => collectVariables(entry, variables));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => collectVariables(entry, variables));
  }
  ['ownerAccessToken', 'contributorAccessToken', 'adminAccessToken'].forEach((key) => variables.add(key));
  return variables;
}

function safeEnvironmentValue(key) {
  const exact = {
    baseUrl: 'http://localhost:4000',
    ownerEmail: 'owner@example.test',
    contributorEmail: 'contributor@example.test',
    adminEmail: 'admin@example.test',
    ownerUsername: 'sharek-owner-demo',
    contributorUsername: 'sharek-contributor-demo',
    repositoryFullName: 'octocat/Hello-World',
    repositoryReference: 'octocat/Hello-World',
    githubAuthor: 'octocat',
    previewFingerprint: '0'.repeat(64),
    projectSlug: 'sharek-demo-project',
    projectRevision: '1',
    materialVersion: '1',
    providerInstallationId: '123456789',
    repositoryId: '987654321',
    userIdToPromote: '00000000-0000-4000-8000-000000000001',
    applicationsCloseTime: '',
    targetCompletionDate: '',
  };
  if (key in exact) return exact[key];
  if (/password|token|secret|signature|otp|code|state/i.test(key)) return '';
  if (/idempotencykey/i.test(key)) return '';
  if (/id$/i.test(key)) return '00000000-0000-4000-8000-000000000001';
  if (key === 'cursor') return '';
  return '';
}

function folderDescription(name) {
  const descriptions = {
    Health: 'Public process health.',
    'Identity and Sessions': 'Manual authentication, session rotation, current-user reads, preferences, and admin role assignment.',
    OAuth: 'Google and GitHub identity flows plus browser/provider callbacks. Callback examples need real provider setup.',
    'GitHub Evidence': 'Connected-account and repository evidence endpoints.',
    'GitHub App': 'Selected-repository GitHub App authorization and signed provider webhook handling.',
    Projects: 'Canonical Project preview, draft, owner lifecycle, discovery, and public reads.',
    'Contribution Requests': 'Owner-managed Contribution Request lifecycle and public actionable discovery.',
    Applications: 'Application submission, review, decisions, advisory assessment, and feedback-report workflows.',
    'Delivery Reviews': 'Contributor Delivery submission and immutable revisions, owner review queue, review outcomes, and participant-visible history.',
    'Contribution Proposals': 'Private contributor-authored Proposal lifecycle and owner responses.',
    Materials: 'Multipart upload, immutable versions, grants, visibility, downloads, listing, and deletion.',
    'Material Analysis': 'Owner-authorized version-fixed Analysis Sets, Runs, and explicit suggestion review/adoption.',
    'Contributor Profiles': 'Contributor profile/catalog/avatar APIs.',
    'Skill Profiles': 'Explicit-consent GitHub-backed skill generation and retry.',
    'Assignment Conversations': 'Assignment participant conversation history and durable Message commands.',
    Notifications: 'Durable inbox, read state, preferences, and localized presentation.',
    Admin: 'Admin-only review/catalog/overview endpoints.',
  };
  return descriptions[name];
}

function buildGuide(collectionValue, inventoryMap) {
  const lines = [
    '# Share-k Backend Postman API Guide',
    '',
    'This guide and the collection are generated from the NestJS controllers and validated DTO-backed requests. The canonical local base URL is `http://localhost:4000`; backend routes are deliberately unprefixed.',
    '',
    '## Import and local validation',
    '',
    'Import `postman/sharek-backend.postman_collection.json` and `postman/sharek-backend.postman_environment.json`, select the environment, and fill only the credentials needed for your local test accounts. Committed email values use the reserved `.test` domain; passwords, tokens, OAuth values, and webhook signatures are empty.',
    '',
    'Run the deterministic offline coverage gate from `server/`:',
    '',
    '```bash',
    'npm run test:postman',
    '```',
    '',
    'The gate discovers every file under `src` containing `@Controller`, compares normalized method/path pairs, rejects duplicates and obsolete routes, validates URL/base-variable use, compiles Postman scripts, and verifies environment/credential safety. It does not start NestJS or contact PostgreSQL, Redis, GitHub, email, AI, or Postman.',
    '',
    '## Recommended workflow',
    '',
    '1. Start with Health, registration, email verification, and login.',
    '2. Save role-specific bearer tokens (`ownerAccessToken`, `contributorAccessToken`, `adminAccessToken`). The auth test scripts populate them from the confirmed response role.',
    '3. Use GitHub App/provider callback requests only after external setup; placeholders are intentionally nonfunctional.',
    '4. Create a Project, Contribution Request, Application, Proposal, Material, and Analysis Set in dependency order so response scripts capture the IDs used downstream.',
    '5. Multipart requests require selecting a local file in Postman; the collection never commits a local path.',
    '',
    '## Complete HTTP endpoint catalog',
    '',
    `Unique controller method/path pairs: **${inventoryMap.size}**. WebSocket events are excluded from this HTTP count.`,
    '',
  ];
  for (const folder of collectionValue.item) {
    lines.push(`### ${folder.name}`, '', '| Method | Path | Auth | Success | Purpose |', '| --- | --- | --- | ---: | --- |');
    for (const item of folder.item) {
      const parsed = parseUrl(item.request.url);
      const route = inventoryMap.get(routeKey(item.request.method, parsed.pathname));
      const auth = route.authentication === 'public'
        ? 'Public'
        : route.roles.length > 0
          ? route.roles.join(' / ')
          : 'Bearer / resource-scoped';
      lines.push(`| \`${route.method}\` | \`${route.path}\` | ${auth} | ${route.successStatus} | ${item.name} |`);
    }
    lines.push('');
  }
  lines.push(
    '## Realtime events (not HTTP endpoints)',
    '',
    '- Socket.IO namespace: `/realtime` with bearer authentication in `auth.token`.',
    '- Notification events: `notification.created`, `notification.read_state_changed`.',
    '- Assignment conversation event: `conversation.message.created`.',
    '- PostgreSQL HTTP reads remain authoritative; clients deduplicate stable event IDs and reconcile gaps through the HTTP endpoints above.',
    '',
    '## Explicit Postman upload',
    '',
    'Local validation is the default and never uploads. To update an existing Postman workspace, set `POSTMAN_API_KEY`, `POSTMAN_COLLECTION_ID`, and optionally `POSTMAN_ENVIRONMENT_ID`, then run:',
    '',
    '```bash',
    'npm run postman:upload',
    '```',
    '',
    'The command refuses upload without the explicit `--upload` operation and environment variables. No API key is read from repository or developer-specific files.',
  );
  return `${lines.join('\n')}\n`;
}
