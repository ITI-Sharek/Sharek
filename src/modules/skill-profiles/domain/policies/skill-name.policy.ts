const CANONICAL_SKILL_NAMES: Record<string, string> = {
  'c#': 'C#',
  'c sharp': 'C#',
  csharp: 'C#',
  'c++': 'C++',
  'c plus plus': 'C++',
  cpp: 'C++',
  docker: 'Docker',
  fastapi: 'FastAPI',
  git: 'Git',
  github: 'GitHub',
  javascript: 'JavaScript',
  js: 'JavaScript',
  nestjs: 'NestJS',
  'node js': 'Node.js',
  nodejs: 'Node.js',
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  python: 'Python',
  react: 'React',
  typescript: 'TypeScript',
  ts: 'TypeScript',
};

export interface CanonicalSkillName {
  key: string;
  name: string;
}

export function canonicalizeSkillName(value: string): CanonicalSkillName | null {
  const compactName = value.trim().replace(/\s+/g, ' ').slice(0, 100);
  if (!compactName) {
    return null;
  }

  const key = compactName
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[._/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const name = CANONICAL_SKILL_NAMES[key] ?? compactName;
  const canonicalKey = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[._/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return canonicalKey ? { key: canonicalKey, name } : null;
}
