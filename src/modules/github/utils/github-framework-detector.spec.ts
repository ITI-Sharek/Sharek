import { detectGitHubFrameworks } from './github-framework-detector';

describe('detectGitHubFrameworks', () => {
  it('detects Next.js and frontend dependencies from a private repository package file', () => {
    const result = detectGitHubFrameworks({
      'package.json': JSON.stringify({
        dependencies: {
          next: '^16.1.6',
          react: '^18.3.0',
          'react-dom': '^18.3.0',
        },
        devDependencies: {
          tailwindcss: '^3.4.3',
          typescript: '^5.4.0',
        },
      }),
    });

    expect(result).toMatchObject({
      status: 'success',
      frameworksCount: 4,
      dependencyFilesIdentified: [
        { filename: 'package.json', parserUsed: 'package_json' },
      ],
    });
    expect(result.frameworksDetected).toEqual({
      'Next.js': ['package.json:next@^16.1.6'],
      React: ['package.json:react@^18.3.0'],
      'Tailwind CSS': ['package.json:tailwindcss@^3.4.3'],
      TypeScript: ['package.json:typescript@^5.4.0'],
    });
  });

  it('reports unavailable evidence separately from a repository with no dependency files', () => {
    expect(detectGitHubFrameworks({}, 1).status).toBe('unavailable');
    expect(detectGitHubFrameworks({}, 0).status).toBe('no_dependency_files');
  });
});
