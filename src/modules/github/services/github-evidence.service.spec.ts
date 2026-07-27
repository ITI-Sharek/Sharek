import { GitHubEvidenceService } from './github-evidence.service';

describe('GitHubEvidenceService GitHub App boundary', () => {
  function createService() {
    const appService = {
      verifyRepositorySelection: jest.fn().mockResolvedValue({
        providerInstallationId: '987',
        githubLogin: 'member',
        repositories: [
          { repositoryId: '1', fullName: 'org/selected' },
          { repositoryId: '2', fullName: 'org/partial' },
        ],
      }),
    };
    const appApiClient = {
      createInstallationToken: jest.fn().mockResolvedValue({
        token: 'ephemeral-installation-token',
        expires_at: '2026-07-27T13:00:00Z',
      }),
    };
    const gitHubApiClient = {
      getRepository: jest
        .fn()
        .mockResolvedValueOnce({
          id: 1,
          name: 'selected',
          full_name: 'org/selected',
          owner: { login: 'org' },
          html_url: 'https://github.com/org/selected',
          private: true,
          fork: false,
          archived: false,
          default_branch: 'main',
        })
        .mockRejectedValueOnce(
          Object.assign(new Error('removed'), {
            code: 'GITHUB_APP_REPOSITORY_ACCESS_REVOKED',
          }),
        ),
      getRepositoryLanguages: jest.fn().mockResolvedValue({ TypeScript: 100 }),
      getRepositoryReadme: jest.fn().mockResolvedValue('# selected'),
      getRepositoryContributionStats: jest.fn().mockResolvedValue({
        data: [],
        unavailableReason: null,
      }),
      getRepositoryCommitActivity: jest.fn().mockResolvedValue({
        data: [],
        unavailableReason: null,
      }),
      listRecentCommits: jest.fn().mockResolvedValue({
        data: [],
        unavailableReason: null,
      }),
    };
    return {
      service: new GitHubEvidenceService(
        {} as never,
        gitHubApiClient as never,
        appService as never,
        appApiClient as never,
      ),
      appService,
      appApiClient,
      gitHubApiClient,
    };
  }

  it('revalidates immutable selections then uses an on-demand installation token', async () => {
    const { service, appService, appApiClient, gitHubApiClient } = createService();
    await expect(
      service.getGitHubAppSkillProfilingEvidence('user-1', 'link-1', ['1', '2']),
    ).resolves.toMatchObject({
      snapshots: [{ repository: { githubRepoId: '1', fullName: 'org/selected' } }],
      failures: [
        {
          fullName: 'org/partial',
          code: 'GITHUB_REPOSITORY_EVIDENCE_UNAVAILABLE',
        },
      ],
    });
    expect(appService.verifyRepositorySelection).toHaveBeenCalledWith(
      'user-1',
      'link-1',
      ['1', '2'],
    );
    expect(appApiClient.createInstallationToken).toHaveBeenCalledWith('987');
    expect(gitHubApiClient.getRepository).toHaveBeenCalledWith(
      'ephemeral-installation-token',
      'org/selected',
    );
  });

  it('fails closed before token minting when live member access is revoked', async () => {
    const { service, appService, appApiClient } = createService();
    appService.verifyRepositorySelection.mockRejectedValueOnce(
      Object.assign(new Error('revoked'), {
        code: 'GITHUB_APP_INSTALLATION_ACCESS_NOT_VERIFIED',
      }),
    );
    await expect(
      service.getGitHubAppSkillProfilingEvidence('user-1', 'link-1', ['1']),
    ).rejects.toMatchObject({
      code: 'GITHUB_APP_INSTALLATION_ACCESS_NOT_VERIFIED',
    });
    expect(appApiClient.createInstallationToken).not.toHaveBeenCalled();
  });

  it('rejects a provider repository whose immutable ID changes', async () => {
    const { service, gitHubApiClient } = createService();
    gitHubApiClient.getRepository.mockReset().mockResolvedValue({
      id: 999,
      full_name: 'org/selected',
    });
    await expect(
      service.getGitHubAppSkillProfilingEvidence('user-1', 'link-1', ['1', '2']),
    ).resolves.toMatchObject({
      snapshots: [],
      failures: expect.arrayContaining([
        expect.objectContaining({ code: 'GITHUB_APP_REPOSITORY_ACCESS_REVOKED' }),
      ]),
    });
  });
});
