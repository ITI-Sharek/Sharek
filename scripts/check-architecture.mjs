import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulesDir = path.join(rootDir, 'src/modules');
const errors = [];

function relative(filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}

function readText(filePath) {
  if (!existsSync(filePath)) {
    return '';
  }

  return readFileSync(filePath, 'utf8');
}

function fail(message) {
  errors.push(message);
}

function assertFile(filePath, description) {
  if (!existsSync(filePath)) {
    fail(`Missing ${description}: ${relative(filePath)}`);
  }
}

function walkFiles(dir, predicate = () => true) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name.includes('.locked-backup.')) {
        return [];
      }

      return walkFiles(entryPath, predicate);
    }

    return predicate(entryPath) ? [entryPath] : [];
  });
}

function getModuleNames() {
  return readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function getImportTargets(source) {
  const targets = [];
  const importRegex = /import(?:[\s\S]*?)from\s+['"]([^'"]+)['"]/g;
  const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;

  for (const match of source.matchAll(importRegex)) {
    targets.push(match[1]);
  }

  for (const match of source.matchAll(sideEffectRegex)) {
    targets.push(match[1]);
  }

  return targets;
}

function resolveRelativeImport(filePath, target) {
  if (!target.startsWith('.')) {
    return null;
  }

  return path.resolve(path.dirname(filePath), target);
}

function getModuleNameFromPath(filePath) {
  const relativePath = relative(filePath);
  const parts = relativePath.split('/');

  return parts[0] === 'src' && parts[1] === 'modules' ? parts[2] : null;
}

function checkRequiredFiles() {
  [
    'AGENTS.md',
    'README.md',
    '.github/pull_request_template.md',
    'docs/architecture.md',
    'docs/developer-architecture-guide.md',
    'docs/module-development-tracker.md',
    'docs/backend-conventions.md',
    'docs/definition-of-done.md',
    'docs/api-contracts.md',
    'docs/database-plan.md',
  ].forEach((file) => assertFile(path.join(rootDir, file), file));
}

function checkModuleReadmes(modules) {
  for (const moduleName of modules) {
    assertFile(
      path.join(modulesDir, moduleName, 'README.md'),
      `${moduleName} module README`,
    );
    assertFile(
      path.join(modulesDir, moduleName, `${moduleName}.module.ts`),
      `${moduleName} NestJS module file`,
    );
  }
}

function checkTrackerCoverage(modules) {
  const trackerPath = path.join(rootDir, 'docs/module-development-tracker.md');
  const guidePath = path.join(rootDir, 'docs/developer-architecture-guide.md');
  const tracker = readText(trackerPath);
  const guide = readText(guidePath);

  if (!tracker.includes('## Module Change Records')) {
    fail('docs/module-development-tracker.md must contain "## Module Change Records".');
  }

  if (!tracker.includes('## Per-Task Checklist')) {
    fail('docs/module-development-tracker.md must contain "## Per-Task Checklist".');
  }

  for (const moduleName of modules) {
    if (!tracker.includes(`\`${moduleName}\``)) {
      fail(`Tracker does not mention module \`${moduleName}\`.`);
    }

    if (!guide.includes(`\`${moduleName}\``)) {
      fail(`Developer architecture guide does not mention module \`${moduleName}\`.`);
    }
  }
}

function checkNoStaleArchitectureText() {
  const files = [
    'README.md',
    'AGENTS.md',
    'docs/README.md',
    'docs/backend-conventions.md',
    'docs/folder-structure.md',
    'src/modules/README.md',
  ].map((file) => path.join(rootDir, file));

  const forbidden = [
    'Keep `.gitkeep`',
    'leaf folders are intentionally present',
    'create all folders blindly',
  ];

  for (const file of files) {
    const text = readText(file);

    for (const phrase of forbidden) {
      if (text.includes(phrase)) {
        fail(`${relative(file)} contains stale architecture wording: ${phrase}`);
      }
    }
  }
}

function checkCrossModuleInfrastructureImports() {
  const tsFiles = walkFiles(modulesDir, (filePath) => filePath.endsWith('.ts'));

  for (const filePath of tsFiles) {
    const sourceModule = getModuleNameFromPath(filePath);
    const source = readText(filePath);

    for (const target of getImportTargets(source)) {
      const resolved = resolveRelativeImport(filePath, target);

      if (!resolved) {
        continue;
      }

      const targetModule = getModuleNameFromPath(resolved);
      const normalizedTarget = relative(resolved);

      if (
        sourceModule &&
        targetModule &&
        sourceModule !== targetModule &&
        normalizedTarget.includes(`src/modules/${targetModule}/infrastructure/`)
      ) {
        fail(
          `${relative(filePath)} imports another module's private infrastructure: ${target}`,
        );
      }
    }
  }
}

function checkDomainIsolation() {
  const domainFiles = walkFiles(modulesDir, (filePath) => {
    const normalized = relative(filePath);
    return normalized.includes('/domain/') && filePath.endsWith('.ts');
  });

  const forbiddenPatterns = [
    { label: 'NestJS', pattern: /@nestjs\// },
    { label: 'Prisma', pattern: /@prisma\/client|PrismaClient|DatabaseService/ },
    { label: 'HTTP/fetch', pattern: /\bfetch\s*\(|axios|HttpService/ },
    { label: 'ConfigService', pattern: /\bConfigService\b/ },
  ];

  for (const filePath of domainFiles) {
    const source = readText(filePath);

    for (const { label, pattern } of forbiddenPatterns) {
      if (pattern.test(source)) {
        fail(`${relative(filePath)} domain code depends on ${label}.`);
      }
    }
  }
}

function checkControllersStayThin() {
  const controllerFiles = walkFiles(modulesDir, (filePath) =>
    filePath.endsWith('.controller.ts'),
  );

  for (const filePath of controllerFiles) {
    const source = readText(filePath);

    if (/DatabaseService|@prisma\/client/.test(source)) {
      fail(`${relative(filePath)} controller depends on database access.`);
    }

    if (/\bfetch\s*\(|axios|HttpService/.test(source)) {
      fail(`${relative(filePath)} controller calls an external HTTP client.`);
    }
  }
}

function checkDocsReferences() {
  const requiredReferences = [
    { file: 'AGENTS.md', text: 'docs/module-development-tracker.md' },
    { file: 'README.md', text: 'docs/module-development-tracker.md' },
    { file: 'docs/definition-of-done.md', text: 'docs/module-development-tracker.md' },
    { file: 'docs/ai-agent-rules.md', text: 'docs/module-development-tracker.md' },
  ];

  for (const { file, text } of requiredReferences) {
    const filePath = path.join(rootDir, file);

    if (!readText(filePath).includes(text)) {
      fail(`${file} must reference ${text}.`);
    }
  }
}

function checkNoEmptyArchitectureDirectories() {
  const architectureDirs = ['domain', 'application', 'infrastructure', 'presentation'];

  for (const moduleName of getModuleNames()) {
    for (const dirName of architectureDirs) {
      const dirPath = path.join(modulesDir, moduleName, dirName);

      if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
        const files = walkFiles(dirPath);

        if (files.length === 0) {
          fail(`${relative(dirPath)} exists but has no files.`);
        }
      }
    }
  }
}

checkRequiredFiles();
const modules = getModuleNames();
checkModuleReadmes(modules);
checkTrackerCoverage(modules);
checkNoStaleArchitectureText();
checkCrossModuleInfrastructureImports();
checkDomainIsolation();
checkControllersStayThin();
checkDocsReferences();
checkNoEmptyArchitectureDirectories();

if (errors.length > 0) {
  console.error('Architecture check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Architecture check passed for ${modules.length} modules.`);
