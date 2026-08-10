import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { createApplicationValidationPipe } from '../../../shared/validation/application-validation.pipe';
import {
  GitHubCommitSignalsQueryRequest,
  GitHubRepositoryQueryRequest,
} from './github-repository-query.request';

describe('GitHub repository query requests', () => {
  it.each([undefined, '', '   '])(
    'keeps the stable missing-fullName validation code for %p',
    async (fullName) => {
      const request = plainToInstance(GitHubRepositoryQueryRequest, {
        fullName,
      });

      const errors = await validate(request);

      expect(JSON.stringify(errors)).toContain(
        'GITHUB_REPOSITORY_FULL_NAME_REQUIRED',
      );
    },
  );

  it('preserves a valid repository full name and accepts an optional author', async () => {
    const request = plainToInstance(GitHubCommitSignalsQueryRequest, {
      fullName: '  octocat/Hello-World  ',
      author: 'octocat',
    });

    await expect(validate(request)).resolves.toEqual([]);
    expect(request).toEqual({
      fullName: '  octocat/Hello-World  ',
      author: 'octocat',
    });
  });

  it('surfaces the existing application error through the global validation pipe', async () => {
    const pipe = createApplicationValidationPipe();

    await expect(
      pipe.transform(
        { fullName: '   ' },
        {
          type: 'query',
          metatype: GitHubRepositoryQueryRequest,
          data: undefined,
        },
      ),
    ).rejects.toMatchObject({
      code: 'GITHUB_REPOSITORY_FULL_NAME_REQUIRED',
      statusCode: 400,
    });
  });
});
