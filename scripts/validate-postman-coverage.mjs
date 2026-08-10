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
const inventoryPath = path.join(
  repositoryRoot,
  'postman/controller-route-inventory.json',
);
const guidePath = path.join(repositoryRoot, 'docs/postman-api-guide.md');
const errors = [];

const collection = readJson(collectionPath, 'Postman collection');
const environment = readJson(environmentPath, 'Postman environment');
const storedInventory = readJson(inventoryPath, 'controller route inventory');
const controllerRoutes = extractControllerRoutes(repositoryRoot);
const controllerByKey = uniqueRouteMap(controllerRoutes, 'controllers');

validateCollectionShape(collection);
validateEnvironmentShape(environment);

const postmanRequests = flattenRequests(collection.item);
const postmanByKey = new Map();
for (const entry of postmanRequests) {
  const parsed = validateRequestUrl(entry);
  if (!parsed) continue;
  const key = routeKey(entry.item.request.method, parsed.pathname);
  const values = postmanByKey.get(key) ?? [];
  values.push(entry);
  postmanByKey.set(key, values);
  validateRequestContract(entry, controllerByKey.get(key));
}

compareCoverage(controllerByKey, postmanByKey);
validateStoredInventory(storedInventory, controllerRoutes);
validateGuide(guidePath, controllerByKey);
validateVariables(collection, environment);
validateScripts(collection);
validateCommittedValues(collection, environment);

if (errors.length > 0) {
  console.error(`Postman coverage validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Postman coverage passed: ${controllerByKey.size} controller routes, ${postmanByKey.size} canonical Postman routes, 0 missing, 0 obsolete, 0 duplicates, and ${environment.values.length} safe environment variables.`,
);

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`${label} is not valid JSON: ${error.message}`);
    process.exit(1);
  }
}

function validateCollectionShape(value) {
  if (!value?.info || !Array.isArray(value.item)) {
    errors.push('Collection must contain info and item fields.');
  }
  if (
    value?.info?.schema !==
    'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  ) {
    errors.push('Collection info.schema must be Postman Collection v2.1.');
  }
  if (value.variable?.length) {
    errors.push('Collection-scoped variable defaults are not allowed; use the audited environment.');
  }
}

function validateEnvironmentShape(value) {
  if (!Array.isArray(value?.values)) {
    errors.push('Postman environment must contain a values array.');
  }
  if (value?._postman_variable_scope !== 'environment') {
    errors.push('Postman environment scope must be "environment".');
  }
}

function flattenRequests(items, parents = [], inheritedAuth = null) {
  return (items ?? []).flatMap((item) => {
    const auth = item.auth ?? inheritedAuth;
    return [
      ...(item.request
        ? [{ item, parents, inheritedAuth: auth }]
        : []),
      ...flattenRequests(item.item, [...parents, item.name], auth),
    ];
  });
}

function uniqueRouteMap(routes, label) {
  const result = new Map();
  for (const route of routes) {
    if (result.has(route.key)) {
      errors.push(`Duplicate ${label} route: ${route.key}.`);
    }
    result.set(route.key, route);
  }
  return result;
}

function validateRequestUrl(entry) {
  const { request } = entry.item;
  if (!request || typeof request.method !== 'string') {
    errors.push(`${requestLabel(entry)} has no HTTP method.`);
    return null;
  }
  if (!request.url || typeof request.url === 'string') {
    errors.push(`${requestLabel(entry)} must use a structured Postman URL object.`);
    return null;
  }
  const raw = request.url.raw;
  if (typeof raw !== 'string' || !raw.startsWith('{{baseUrl}}/')) {
    errors.push(`${requestLabel(entry)} must start its raw URL with {{baseUrl}}/.`);
    return null;
  }
  if (/\{\{base_url\}\}|https?:\/\//i.test(raw.replace('{{baseUrl}}', ''))) {
    errors.push(`${requestLabel(entry)} contains a hardcoded host or inconsistent base variable.`);
  }
  if (
    !Array.isArray(request.url.host) ||
    request.url.host.length !== 1 ||
    request.url.host[0] !== '{{baseUrl}}'
  ) {
    errors.push(`${requestLabel(entry)} must use host: ["{{baseUrl}}"].`);
  }
  const withoutBase = raw.slice('{{baseUrl}}'.length);
  const pathname = withoutBase.split('?')[0];
  const structuredPath = `/${(request.url.path ?? []).join('/')}`;
  if (structuredPath !== pathname) {
    errors.push(`${requestLabel(entry)} has inconsistent raw and structured paths.`);
  }
  return { pathname };
}

function validateRequestContract(entry, route) {
  if (!route) return;
  const { request } = entry.item;
  const effectiveAuth = request.auth ?? entry.inheritedAuth ?? collection.auth;
  if (route.authentication === 'public' && effectiveAuth?.type !== 'noauth') {
    errors.push(`${requestLabel(entry)} is public but is not explicit noauth.`);
  }
  if (route.authentication === 'bearer' && effectiveAuth?.type !== 'bearer') {
    errors.push(`${requestLabel(entry)} is protected but has no bearer auth.`);
  }
  if (!request.description?.includes(`Expected status: ${route.successStatus}.`)) {
    errors.push(`${requestLabel(entry)} description does not document status ${route.successStatus}.`);
  }
  const statusAssertion = (entry.item.event ?? [])
    .flatMap((event) => event.script?.exec ?? [])
    .join('\n');
  if (!statusAssertion.includes(`to.have.status(${route.successStatus})`)) {
    errors.push(`${requestLabel(entry)} has no assertion for status ${route.successStatus}.`);
  }
  const queryNames = new Set((request.url.query ?? []).map((query) => query.key));
  for (const query of route.queryParameters.filter((value) => !value.optional)) {
    if (!queryNames.has(query.name)) {
      errors.push(`${requestLabel(entry)} is missing required query parameter ${query.name}.`);
    }
  }
  const headers = new Map(
    (request.header ?? []).map((header) => [header.key?.toLowerCase(), header]),
  );
  for (const header of route.headers.filter((value) => !value.optional)) {
    if (!headers.has(header.name.toLowerCase())) {
      errors.push(`${requestLabel(entry)} is missing required header ${header.name}.`);
    }
  }
  if (
    route.contentType === 'application/json' &&
    headers.get('content-type')?.value !== 'application/json'
  ) {
    errors.push(`${requestLabel(entry)} must declare application/json.`);
  }
  if (route.contentType === 'multipart/form-data') {
    if (request.body?.mode !== 'formdata') {
      errors.push(`${requestLabel(entry)} must use Postman formdata.`);
    }
    if (headers.has('content-type')) {
      errors.push(`${requestLabel(entry)} must let Postman generate the multipart boundary.`);
    }
  }
  if (
    route.headers.some((header) => header.name.toLowerCase() === 'idempotency-key') &&
    !headers.has('idempotency-key')
  ) {
    errors.push(`${requestLabel(entry)} is missing Idempotency-Key.`);
  }
  validateBody(entry, route);
}

function validateBody(entry, route) {
  const requestBody = entry.item.request.body;
  const requiredFields = route.bodyFields
    .filter((field) => !field.optional)
    .map((field) => field.name);
  if (route.contentType === 'multipart/form-data') {
    const fields = new Set((requestBody?.formdata ?? []).map((field) => field.key));
    for (const field of [...requiredFields, ...route.multipartFields]) {
      if (!fields.has(field)) errors.push(`${requestLabel(entry)} is missing multipart field ${field}.`);
    }
    return;
  }
  if (!route.bodyDto && !route.acceptsRawBody) {
    if (requestBody) errors.push(`${requestLabel(entry)} documents a body not accepted by the controller.`);
    return;
  }
  if (requestBody?.mode !== 'raw') {
    errors.push(`${requestLabel(entry)} must use a raw JSON body.`);
    return;
  }
  let body;
  try {
    body = JSON.parse(requestBody.raw);
  } catch (error) {
    errors.push(`${requestLabel(entry)} contains malformed JSON body: ${error.message}`);
    return;
  }
  if (route.acceptsRawBody) return;
  for (const field of requiredFields) {
    if (!(field in body)) errors.push(`${requestLabel(entry)} is missing required DTO field ${field}.`);
  }
  const allowedFields = new Set(route.bodyFields.map((field) => field.name));
  for (const field of Object.keys(body)) {
    if (!allowedFields.has(field)) {
      errors.push(`${requestLabel(entry)} documents obsolete/non-whitelisted DTO field ${field}.`);
    }
  }
}

function compareCoverage(expected, actual) {
  for (const key of expected.keys()) {
    if (!actual.has(key)) errors.push(`Missing from Postman: ${key}.`);
  }
  for (const [key, entries] of actual) {
    if (!expected.has(key)) errors.push(`Obsolete Postman route: ${key}.`);
    if (entries.length > 1) {
      errors.push(`Duplicate canonical Postman route (${entries.length} requests): ${key}.`);
    }
  }
}

function validateStoredInventory(stored, current) {
  if (stored?.routeCount !== current.length || !Array.isArray(stored?.routes)) {
    errors.push('Normalized controller route inventory has a stale route count.');
    return;
  }
  if (JSON.stringify(stored.routes) !== JSON.stringify(current)) {
    errors.push('Normalized controller route inventory is stale; run npm run postman:generate.');
  }
}

function validateGuide(filePath, expected) {
  const guide = fs.readFileSync(filePath, 'utf8');
  const catalog = new Map();
  for (const match of guide.matchAll(/^\| `([A-Z]+)` \| `([^`]+)` \|/gm)) {
    const key = routeKey(match[1], match[2]);
    catalog.set(key, (catalog.get(key) ?? 0) + 1);
  }
  for (const key of expected.keys()) {
    if (!catalog.has(key)) errors.push(`Postman guide is missing ${key}.`);
  }
  for (const [key, count] of catalog) {
    if (!expected.has(key)) errors.push(`Postman guide contains obsolete route ${key}.`);
    if (count > 1) errors.push(`Postman guide duplicates route ${key}.`);
  }
}

function validateVariables(collectionValue, environmentValue) {
  const referenced = collectVariables(collectionValue);
  const values = environmentValue.values ?? [];
  const keys = new Set();
  for (const variable of values) {
    if (keys.has(variable.key)) errors.push(`Duplicate environment variable: ${variable.key}.`);
    keys.add(variable.key);
  }
  for (const key of referenced) {
    if (!keys.has(key)) errors.push(`Environment is missing referenced variable: ${key}.`);
  }
  for (const key of keys) {
    if (!referenced.has(key)) errors.push(`Environment contains unused variable: ${key}.`);
  }
  if (environmentValue.values?.find((variable) => variable.key === 'baseUrl')?.value !== 'http://localhost:4000') {
    errors.push('Environment baseUrl must be http://localhost:4000.');
  }
}

function collectVariables(value, variables = new Set()) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g)) variables.add(match[1]);
    for (const match of value.matchAll(/pm\.environment\.(?:get|set)\(\s*['"]([^'"]+)['"]/g)) variables.add(match[1]);
  } else if (Array.isArray(value)) {
    value.forEach((entry) => collectVariables(entry, variables));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => collectVariables(entry, variables));
  }
  ['ownerAccessToken', 'contributorAccessToken', 'adminAccessToken'].forEach((key) => variables.add(key));
  return variables;
}

function validateScripts(value) {
  visitItems(value.item, (item) => {
    for (const event of item.event ?? []) {
      const source = event.script?.exec?.join('\n');
      if (!source) continue;
      try {
        Function(source);
      } catch (error) {
        errors.push(`Invalid ${event.listen} script in ${item.name}: ${error.message}.`);
      }
    }
  });
  for (const event of value.event ?? []) {
    try {
      Function(event.script?.exec?.join('\n') ?? '');
    } catch (error) {
      errors.push(`Invalid collection ${event.listen} script: ${error.message}.`);
    }
  }
}

function validateCommittedValues(collectionValue, environmentValue) {
  const sensitiveKey = /(password|token|secret|signature|otp|code|state)/i;
  for (const variable of environmentValue.values ?? []) {
    if (
      sensitiveKey.test(variable.key) &&
      !/idempotency/i.test(variable.key) &&
      variable.value !== ''
    ) {
      errors.push(`Sensitive environment variable ${variable.key} must be empty.`);
    }
    if (
      typeof variable.value === 'string' &&
      /@/.test(variable.value) &&
      !/@example\.(?:test|com)$/i.test(variable.value)
    ) {
      errors.push(`Environment variable ${variable.key} appears to contain a personal email.`);
    }
  }
  const serialized = JSON.stringify(collectionValue);
  if (/PMAK-[A-Za-z0-9-]+/.test(serialized)) errors.push('Collection appears to contain a Postman API key.');
  for (const email of serialized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) {
    if (!/@example\.(?:test|com)$/i.test(email)) {
      errors.push(`Collection appears to contain a personal email: ${email}.`);
    }
  }
}

function visitItems(items, visitor) {
  for (const item of items ?? []) {
    visitor(item);
    visitItems(item.item, visitor);
  }
}

function requestLabel(entry) {
  return [...entry.parents, entry.item.name].join(' > ');
}
