import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const HTTP_DECORATORS = new Map([
  ['Get', 'GET'],
  ['Post', 'POST'],
  ['Put', 'PUT'],
  ['Patch', 'PATCH'],
  ['Delete', 'DELETE'],
  ['Options', 'OPTIONS'],
  ['Head', 'HEAD'],
]);

const HTTP_STATUS_NAMES = new Map([
  ['OK', 200],
  ['CREATED', 201],
  ['ACCEPTED', 202],
  ['NO_CONTENT', 204],
  ['FOUND', 302],
]);

const STATUS_OVERRIDES = new Map([
  ['POST /projects/import/github', 410],
]);

export function normalizeRoutePath(routePath) {
  const normalized = routePath
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map((segment) =>
      segment.startsWith(':') || /^\{\{[^}]+\}\}$/.test(segment)
        ? ':parameter'
        : segment,
    )
    .join('/');
  return `/${normalized}`;
}

export function routeKey(method, routePath) {
  return `${method.toUpperCase()} ${normalizeRoutePath(routePath)}`;
}

export function extractControllerRoutes(repositoryRoot) {
  const sourceRoot = path.join(repositoryRoot, 'src');
  const sourceFiles = listTypeScriptFiles(sourceRoot).filter(
    (filePath) =>
      !filePath.endsWith('.spec.ts') &&
      fs.readFileSync(filePath, 'utf8').includes('@Controller'),
  );
  const parsedFiles = sourceFiles.map(parseSourceFile);
  const dtoIndex = buildDtoIndex(listTypeScriptFiles(sourceRoot).map(parseSourceFile));
  const routes = [];

  for (const { filePath, source } of parsedFiles) {
    for (const statement of source.statements) {
      if (!ts.isClassDeclaration(statement) || !statement.name) continue;
      const controller = decoratorCall(statement, 'Controller');
      if (!controller) continue;
      const controllerPath = literalPath(controller, filePath);
      const classGuards = decoratorIdentifiers(statement, 'UseGuards');
      const classRoles = decoratorStrings(statement, 'Roles');

      for (const member of statement.members) {
        if (!ts.isMethodDeclaration(member) || !member.name) continue;
        const http = findHttpDecorator(member);
        if (!http) continue;
        const methodPath = literalPath(http.call, filePath);
        const routePath = joinRoutePaths(controllerPath, methodPath);
        const guards = unique([
          ...classGuards,
          ...decoratorIdentifiers(member, 'UseGuards'),
        ]);
        const roles = unique([
          ...classRoles,
          ...decoratorStrings(member, 'Roles'),
        ]);
        const parameters = extractBindings(member, dtoIndex);
        const multipartFields = extractMultipartFields(member);
        const key = `${http.method} ${routePath}`;
        const bodyText = member.body?.getText(source) ?? '';
        const acceptsRawBody = member.parameters.some((parameter) => {
          const request = decoratorCall(parameter, 'Req');
          if (!request) return false;
          const parameterName = parameter.name.getText(source);
          const parameterType = parameter.type?.getText(source) ?? '';
          return (
            parameterType.includes('RawBodyRequest') ||
            bodyText.includes(`${parameterName}.body`)
          );
        });

        routes.push({
          method: http.method,
          path: routePath,
          normalizedPath: normalizeRoutePath(routePath),
          key: routeKey(http.method, routePath),
          controller: statement.name.text,
          handler: member.name.getText(source),
          source: path.relative(repositoryRoot, filePath).replaceAll(path.sep, '/'),
          pathParameters: routePath
            .split('/')
            .filter((segment) => segment.startsWith(':'))
            .map((segment) => segment.slice(1)),
          queryParameters: parameters.query,
          headers: parameters.headers,
          bodyDto: parameters.body?.type ?? null,
          bodyFields: parameters.body?.properties ?? [],
          acceptsRawBody,
          contentType:
            multipartFields.length > 0
              ? 'multipart/form-data'
              : parameters.body || acceptsRawBody
                ? 'application/json'
                : null,
          multipartFields,
          guards,
          roles,
          authentication: guards.includes('AccessTokenGuard') ? 'bearer' : 'public',
          idempotency:
            parameters.headers.some(
              (header) => header.name.toLowerCase() === 'idempotency-key',
            ) ||
            (parameters.body?.properties ?? []).some(
              (property) => property.name === 'idempotencyKey',
            ),
          successStatus:
            STATUS_OVERRIDES.get(key) ??
            explicitHttpCode(member) ??
            (bodyText.includes('.redirect(')
              ? 302
              : defaultStatus(http.method)),
        });
      }
    }
  }

  return routes.sort((left, right) =>
    left.path.localeCompare(right.path) || left.method.localeCompare(right.method),
  );
}

function listTypeScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(entryPath);
    return entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

function parseSourceFile(filePath) {
  return {
    filePath,
    source: ts.createSourceFile(
      filePath,
      fs.readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  };
}

function buildDtoIndex(parsedFiles) {
  const classes = new Map();
  for (const { source } of parsedFiles) {
    for (const statement of source.statements) {
      if (!ts.isClassDeclaration(statement) || !statement.name) continue;
      const properties = statement.members
        .filter(ts.isPropertyDeclaration)
        .filter((property) => property.name)
        .map((property) => ({
          name: property.name.getText(source).replaceAll(/["']/g, ''),
          optional: Boolean(property.questionToken),
          type: property.type?.getText(source) ?? 'unknown',
        }));
      const parent = statement.heritageClauses
        ?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
        ?.types[0]?.expression.getText(source);
      classes.set(statement.name.text, { properties, parent });
    }
  }

  function propertiesFor(className, seen = new Set()) {
    if (!className || seen.has(className)) return [];
    seen.add(className);
    const declaration = classes.get(className);
    if (!declaration) return [];
    return [
      ...propertiesFor(declaration.parent, seen),
      ...declaration.properties,
    ];
  }

  return { propertiesFor };
}

function decoratorsFor(node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorCall(node, decoratorName) {
  for (const decorator of decoratorsFor(node)) {
    if (!ts.isCallExpression(decorator.expression)) continue;
    const expression = decorator.expression.expression;
    if (ts.isIdentifier(expression) && expression.text === decoratorName) {
      return decorator.expression;
    }
  }
  return null;
}

function decoratorIdentifiers(node, decoratorName) {
  const call = decoratorCall(node, decoratorName);
  return (call?.arguments ?? []).map((argument) => argument.getText());
}

function decoratorStrings(node, decoratorName) {
  const call = decoratorCall(node, decoratorName);
  return (call?.arguments ?? []).map((argument) => {
    if (ts.isStringLiteral(argument)) return argument.text;
    throw new Error(`Unsupported @${decoratorName} value: ${argument.getText()}`);
  });
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

function findHttpDecorator(node) {
  for (const [decoratorName, method] of HTTP_DECORATORS) {
    const call = decoratorCall(node, decoratorName);
    if (call) return { method, call };
  }
  return null;
}

function joinRoutePaths(left, right) {
  return `/${[left, right]
    .flatMap((value) => value.split('/'))
    .filter(Boolean)
    .join('/')}`;
}

function extractBindings(member, dtoIndex) {
  const result = { query: [], headers: [], body: null };
  for (const parameter of member.parameters) {
    const type = parameter.type?.getText() ?? 'unknown';
    const query = decoratorCall(parameter, 'Query');
    if (query) {
      const named = literalDecoratorArgument(query);
      result.query.push(
        ...(named
          ? [{ name: named, optional: Boolean(parameter.questionToken) || type.includes('undefined'), type }]
          : dtoIndex.propertiesFor(type)),
      );
    }
    const headers = decoratorCall(parameter, 'Headers');
    if (headers) {
      const name = literalDecoratorArgument(headers);
      if (name) result.headers.push({ name, optional: Boolean(parameter.questionToken) });
    }
    if (decoratorCall(parameter, 'Body')) {
      result.body = { type, properties: dtoIndex.propertiesFor(type) };
    }
  }
  return result;
}

function literalDecoratorArgument(call) {
  const argument = call.arguments[0];
  return argument && ts.isStringLiteral(argument) ? argument.text : null;
}

function extractMultipartFields(member) {
  const fields = [];
  for (const decorator of decoratorsFor(member)) {
    const text = decorator.getText();
    for (const match of text.matchAll(/Files?Interceptor\(\s*['"]([^'"]+)['"]/g)) {
      fields.push(match[1]);
    }
  }
  return unique(fields);
}

function explicitHttpCode(member) {
  const call = decoratorCall(member, 'HttpCode');
  const argument = call?.arguments[0];
  if (!argument) return null;
  if (ts.isNumericLiteral(argument)) return Number(argument.text);
  if (ts.isPropertyAccessExpression(argument)) {
    return HTTP_STATUS_NAMES.get(argument.name.text) ?? null;
  }
  return null;
}

function defaultStatus(method) {
  return method === 'POST' ? 201 : 200;
}

function unique(values) {
  return [...new Set(values)];
}
