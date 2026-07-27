import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulesDir = path.join(rootDir, 'src/modules');
const errors = [];

const legacyLayerDirectories = [
  'application',
  'domain',
  'infrastructure',
  'presentation',
];
const privateCrossModuleDirectories = [
  'controllers',
  'integrations',
  'jobs',
  'mappers',
  'repositories',
  'security',
  'utils',
  'validators',
];

function relative(filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}

function fail(message) {
  errors.push(message);
}

function readText(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

function walk(dir, options = {}) {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.includes('.locked-backup.')) return [];
      return options.directories
        ? [entryPath, ...walk(entryPath, options)]
        : walk(entryPath, options);
    }
    return options.directories ? [] : [entryPath];
  });
}

function moduleNames() {
  return readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function moduleNameFromPath(filePath) {
  const parts = relative(filePath).split('/');
  return parts[0] === 'src' && parts[1] === 'modules' ? parts[2] : null;
}

function importTargets(source) {
  const targets = [];
  const regex = /(?:import|export)(?:[\s\S]*?)from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(regex)) {
    targets.push(match[1] ?? match[2]);
  }
  return targets;
}

function checkRequiredFiles(modules) {
  const files = [
    'AGENTS.md',
    'README.md',
    '.github/pull_request_template.md',
    'docs/architecture.md',
    'docs/developer-architecture-guide.md',
    'docs/module-development-tracker.md',
    'docs/backend-conventions.md',
    'docs/ai-agent-rules.md',
    'docs/definition-of-done.md',
    'docs/folder-structure.md',
    'docs/examples/module-skeleton.md',
    'docs/SHARED-PRODUCT-DOCS.md',
  ];

  for (const file of files) {
    if (!existsSync(path.join(rootDir, file))) fail(`Missing required file: ${file}`);
  }

  for (const moduleName of modules) {
    for (const file of ['README.md', `${moduleName}.module.ts`]) {
      const filePath = path.join(modulesDir, moduleName, file);
      if (!existsSync(filePath)) fail(`Missing ${relative(filePath)}`);
    }
  }
}

function checkStandardModuleShape() {
  for (const dirPath of walk(modulesDir, { directories: true })) {
    const name = path.basename(dirPath);
    if (legacyLayerDirectories.includes(name)) {
      fail(`Legacy architecture directory is not allowed: ${relative(dirPath)}`);
    }
    if (readdirSync(dirPath).length === 0) {
      fail(`Empty module directory is not allowed: ${relative(dirPath)}`);
    }
  }

  for (const filePath of walk(modulesDir)) {
    const fileName = path.basename(filePath);
    if (/\.use-case\.(?:ts|js)$/.test(fileName) || /\.port\.(?:ts|js)$/.test(fileName)) {
      fail(`Legacy architecture filename is not allowed: ${relative(filePath)}`);
    }
    if (/\bUseCase\b/.test(readText(filePath))) {
      fail(`Legacy UseCase class/token is not allowed: ${relative(filePath)}`);
    }
  }
}

function checkControllersStayThin() {
  for (const filePath of walk(modulesDir).filter((file) =>
    file.endsWith('.controller.ts'),
  )) {
    const source = readText(filePath);
    if (/DatabaseService|@prisma\/client|PrismaClient/.test(source)) {
      fail(`Controller depends on persistence: ${relative(filePath)}`);
    }
    if (/\bfetch\s*\(|axios|HttpService/.test(source)) {
      fail(`Controller calls an external integration: ${relative(filePath)}`);
    }
  }
}

function checkCrossModuleImports() {
  for (const filePath of walk(modulesDir).filter((file) => file.endsWith('.ts'))) {
    const sourceModule = moduleNameFromPath(filePath);
    for (const target of importTargets(readText(filePath))) {
      if (!target.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(filePath), target);
      const targetModule = moduleNameFromPath(resolved);
      if (!sourceModule || !targetModule || sourceModule === targetModule) continue;

      const relativeTarget = relative(resolved);
      const privateDirectory = privateCrossModuleDirectories.find((directory) =>
        relativeTarget.includes(`/modules/${targetModule}/${directory}/`),
      );
      if (privateDirectory) {
        fail(
          `${relative(filePath)} imports private ${targetModule}/${privateDirectory}: ${target}`,
        );
      }
    }
  }
}

function checkDocumentation(modules) {
  const canonicalFiles = [
    'AGENTS.md',
    'README.md',
    'docs/architecture.md',
    'docs/developer-architecture-guide.md',
    'docs/backend-conventions.md',
    'docs/ai-agent-rules.md',
    'docs/definition-of-done.md',
    'docs/folder-structure.md',
    'docs/examples/module-skeleton.md',
    'src/modules/README.md',
  ];
  const forbidden = [
    'application/use-cases',
    'presentation/http',
    'infrastructure/persistence',
    'domain/policies',
    'controllers call use cases',
  ];

  for (const file of canonicalFiles) {
    const text = readText(path.join(rootDir, file)).toLowerCase();
    for (const phrase of forbidden) {
      if (text.includes(phrase)) fail(`${file} contains stale guidance: ${phrase}`);
    }
  }

  const tracker = readText(path.join(rootDir, 'docs/module-development-tracker.md'));
  const guide = readText(path.join(rootDir, 'docs/developer-architecture-guide.md'));
  for (const moduleName of modules) {
    if (!tracker.includes(`\`${moduleName}\``)) {
      fail(`Tracker does not mention module \`${moduleName}\`.`);
    }
    if (!guide.includes(`\`${moduleName}\``)) {
      fail(`Developer guide does not mention module \`${moduleName}\`.`);
    }
  }

  for (const file of ['AGENTS.md', 'README.md', 'docs/definition-of-done.md', 'docs/ai-agent-rules.md']) {
    if (!readText(path.join(rootDir, file)).includes('docs/module-development-tracker.md')) {
      fail(`${file} must reference docs/module-development-tracker.md`);
    }
  }
}

const modules = moduleNames();
checkRequiredFiles(modules);
checkStandardModuleShape();
checkControllersStayThin();
checkCrossModuleImports();
checkDocumentation(modules);

if (errors.length > 0) {
  console.error('Architecture check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Architecture check passed for ${modules.length} standard NestJS modules.`);
