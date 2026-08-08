import { GitHubFrameworkDetectionEvidence } from '../dto/github-repository.dto';

const FRAMEWORK_PACKAGE_NAMES: Record<string, string> = {
  '@angular/core': 'Angular',
  '@nestjs/core': 'NestJS',
  '@prisma/client': 'Prisma',
  '@remix-run/react': 'Remix',
  '@sveltejs/kit': 'SvelteKit',
  astro: 'Astro',
  express: 'Express',
  fastapi: 'FastAPI',
  flask: 'Flask',
  hono: 'Hono',
  jest: 'Jest',
  jinja2: 'Jinja2',
  langchain: 'LangChain',
  next: 'Next.js',
  nuxt: 'Nuxt',
  pydantic: 'Pydantic',
  react: 'React',
  'react-native': 'React Native',
  'react-router-dom': 'React Router',
  svelte: 'Svelte',
  tailwindcss: 'Tailwind CSS',
  tensorflow: 'TensorFlow',
  torch: 'PyTorch',
  typescript: 'TypeScript',
  vite: 'Vite',
  vue: 'Vue',
};

const PARSER_BY_FILENAME: Record<string, string> = {
  'package.json': 'package_json',
  'package-lock.json': 'package_lock',
  'pnpm-lock.yaml': 'package_lock',
  'yarn.lock': 'package_lock',
  'requirements.txt': 'requirements',
  'pyproject.toml': 'pyproject',
  Pipfile: 'pipfile',
  'composer.json': 'composer',
};

function packageNamesFromJson(content: string): Map<string, string> {
  const result = new Map<string, string>();
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    for (const section of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      const dependencies = parsed[section];
      if (!dependencies || typeof dependencies !== 'object') continue;
      for (const [name, version] of Object.entries(
        dependencies as Record<string, unknown>,
      )) {
        result.set(name.toLowerCase(), String(version));
      }
    }
    const lockDependencies = parsed.dependencies;
    if (lockDependencies && typeof lockDependencies === 'object') {
      for (const [name, dependency] of Object.entries(
        lockDependencies as Record<string, unknown>,
      )) {
        if (!result.has(name.toLowerCase())) {
          const version =
            dependency && typeof dependency === 'object'
              ? (dependency as Record<string, unknown>).version
              : undefined;
          result.set(name.toLowerCase(), String(version ?? 'locked'));
        }
      }
    }
  } catch {
    return new Map();
  }
  return result;
}

function packageNamesFromText(content: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('--')) continue;
    const match = line.match(/^([@A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*(.*)$/);
    if (match) {
      result.set(match[1].toLowerCase(), match[2].trim() || 'declared');
    }
  }
  return result;
}

export function detectGitHubFrameworks(
  dependencyFiles: Record<string, string>,
  unavailableCount = 0,
): GitHubFrameworkDetectionEvidence {
  const frameworksDetected: Record<string, string[]> = {};
  const dependencyFilesIdentified = Object.keys(dependencyFiles).map(
    (filename) => ({
      filename,
      parserUsed: PARSER_BY_FILENAME[filename] ?? null,
    }),
  );

  for (const [filename, content] of Object.entries(dependencyFiles)) {
    const parser = PARSER_BY_FILENAME[filename];
    if (!parser) continue;
    const packages =
      parser === 'package_json' || parser === 'package_lock'
        ? packageNamesFromJson(content)
        : packageNamesFromText(content);
    for (const [packageName, version] of packages) {
      const framework = FRAMEWORK_PACKAGE_NAMES[packageName];
      if (!framework) continue;
      const evidence = `${filename}:${packageName}@${version}`;
      frameworksDetected[framework] = [
        ...(frameworksDetected[framework] ?? []),
        evidence,
      ];
    }
  }

  if (Object.keys(dependencyFiles).length === 0) {
    return {
      frameworksDetected: {},
      dependencyFilesIdentified: [],
      frameworksCount: 0,
      status: unavailableCount > 0 ? 'unavailable' : 'no_dependency_files',
    };
  }

  return {
    frameworksDetected,
    dependencyFilesIdentified,
    frameworksCount: Object.keys(frameworksDetected).length,
    status: 'success',
  };
}
