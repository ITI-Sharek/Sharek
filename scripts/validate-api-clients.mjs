import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(repositoryRoot, 'src');
const collectionPath = path.join(
  repositoryRoot,
  'postman/sharek-backend.postman_collection.json',
);
const environmentPath = path.join(
  repositoryRoot,
  'postman/sharek-backend.postman_environment.json',
);
const restClientPath = path.join(repositoryRoot, 'sharek-api.http');
const httpDecorators = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete']);
const applicationPublicRoutes = new Set([
  'POST /tasks/:parameter/applications',
  'GET /tasks/:parameter/applications',
  'GET /applications/:parameter',
  'POST /applications/:parameter/withdraw',
  'POST /applications/:parameter/accept',
  'POST /applications/:parameter/decline',
  'POST /applications/:parameter/assessment-requests',
  'GET /applications/:parameter/assessment',
  'POST /applications/:parameter/assessment/presentations',
]);

function listControllerFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listControllerFiles(entryPath);
    return entry.name.endsWith('.controller.ts') ? [entryPath] : [];
  });
}

function decoratorCall(node, decoratorName) {
  const decorators = ts.canHaveDecorators(node)
    ? (ts.getDecorators(node) ?? [])
    : [];
  for (const decorator of decorators) {
    if (!ts.isCallExpression(decorator.expression)) continue;
    const expression = decorator.expression.expression;
    if (ts.isIdentifier(expression) && expression.text === decoratorName) {
      return decorator.expression;
    }
  }
  return null;
}

function literalPath(call, location) {
  const argument = call?.arguments[0];
  if (!argument) return '';
  if (
    ts.isStringLiteral(argument) ||
    ts.isNoSubstitutionTemplateLiteral(argument)
  ) {
    return argument.text;
  }
  throw new Error(`Unsupported dynamic route path in ${location}`);
}

function normalizeRoute(method, routePath) {
  const normalizedPath = routePath
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map((segment) =>
      segment.startsWith(':') || /^\{\{[^}]+\}\}$/.test(segment)
        ? ':parameter'
        : segment,
    )
    .join('/');
  return `${method.toUpperCase()} /${normalizedPath}`;
}

function controllerRoutes() {
  const routes = new Set();
  for (const filePath of listControllerFiles(sourceRoot)) {
    const source = ts.createSourceFile(
      filePath,
      fs.readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    for (const statement of source.statements) {
      if (!ts.isClassDeclaration(statement)) continue;
      const controller = decoratorCall(statement, 'Controller');
      if (!controller) continue;
      const basePath = literalPath(controller, filePath);
      for (const member of statement.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        for (const decoratorName of httpDecorators) {
          const routeDecorator = decoratorCall(member, decoratorName);
          if (!routeDecorator) continue;
          const methodPath = literalPath(routeDecorator, filePath);
          routes.add(
            normalizeRoute(decoratorName, `${basePath}/${methodPath}`),
          );
        }
      }
    }
  }
  return routes;
}

function postmanRoutes(collection) {
  const routes = new Set();
  function visit(items) {
    for (const item of items ?? []) {
      for (const event of item.event ?? []) {
        const source = event.script?.exec?.join('\n');
        if (source) {
          try {
            Function(source);
          } catch (error) {
            throw new Error(
              `Invalid Postman ${event.listen} script in ${item.name}: ${error.message}`,
            );
          }
        }
      }
      if (item.request) {
        const requestUrl = item.request.url;
        const routePath =
          typeof requestUrl === 'string'
            ? requestUrl.replace(/^\{\{baseUrl\}\}\/?/, '')
            : requestUrl?.path?.join('/');
        if (typeof routePath !== 'string') {
          throw new Error(`Postman request has no route path: ${item.name}`);
        }
        routes.add(normalizeRoute(item.request.method, routePath));
      }
      visit(item.item);
    }
  }
  visit(collection.item);
  return routes;
}

function restClientRoutes(contents) {
  const routes = new Set();
  const requestPattern = /^(GET|POST|PUT|PATCH|DELETE)\s+\{\{baseUrl\}\}\/([^\s]*)/gm;
  for (const match of contents.matchAll(requestPattern)) {
    routes.add(normalizeRoute(match[1], match[2]));
  }
  return routes;
}

function compareRoutes(label, expected, actual) {
  const missing = [...expected].filter((route) => !actual.has(route)).sort();
  const extra = [...actual].filter((route) => !expected.has(route)).sort();
  if (missing.length > 0 || extra.length > 0) {
    const details = [
      missing.length > 0 ? `missing:\n${missing.join('\n')}` : '',
      extra.length > 0 ? `extra:\n${extra.join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    throw new Error(`${label} route inventory differs from controllers:\n${details}`);
  }
}

function validateRestClient(expected, actual) {
  const stale = [...actual].filter((route) => !expected.has(route)).sort();
  const requiredApplicationRoutes = new Set(
    [...expected].filter(
      (route) =>
        route.includes('/applications') ||
        route.startsWith('POST /owner-decisions/'),
    ),
  );
  const missing = [...requiredApplicationRoutes]
    .filter((route) => !actual.has(route))
    .sort();
  if (stale.length > 0 || missing.length > 0) {
    const details = [
      missing.length > 0
        ? `missing Application workflow routes:\n${missing.join('\n')}`
        : '',
      stale.length > 0 ? `stale routes:\n${stale.join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    throw new Error(`REST Client validation failed:\n${details}`);
  }
  return requiredApplicationRoutes.size;
}

const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
const expected = controllerRoutes();
const postman = postmanRoutes(collection);
const restClient = restClientRoutes(fs.readFileSync(restClientPath, 'utf8'));
const actualApplicationRoutes = new Set(
  [...expected].filter((route) => route.includes('/applications')),
);

compareRoutes(
  'Applications public route inventory',
  applicationPublicRoutes,
  actualApplicationRoutes,
);
compareRoutes('Postman collection', expected, postman);
const requiredRestClientRoutes = validateRestClient(expected, restClient);

console.log(
  `API client validation passed: ${expected.size} controller routes, ${postman.size} Postman routes, and ${requiredRestClientRoutes} required Application workflow routes in the REST Client (${restClient.size} runnable REST requests).`,
);
