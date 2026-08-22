import { UserRole, UserStatus } from '@prisma/client';

import { GitHubIdentityLookupService } from '../../github-identity/github-identity-lookup.service';
import { IdentityAccountStatusService } from './identity-account-status.service';

function createService(overrides?: {
  findUnique?: jest.Mock;
  updateMany?: jest.Mock;
  findUniqueOrThrow?: jest.Mock;
  findGitHubIdentity?: jest.Mock;
}) {
  const database = {
    user: {
      findUnique: overrides?.findUnique ?? jest.fn(),
      updateMany: overrides?.updateMany ?? jest.fn(),
      findUniqueOrThrow: overrides?.findUniqueOrThrow ?? jest.fn(),
    },
    authProviderAccount: {
      findUnique: overrides?.findGitHubIdentity ?? jest.fn(),
    },
  };
  const gitHubIdentityLookup = new GitHubIdentityLookupService(
    database as never,
  );

  return {
    service: new IdentityAccountStatusService(
      database as never,
      gitHubIdentityLookup,
    ),
    database,
  };
}

describe('IdentityAccountStatusService', () => {
  it('returns only the allowlisted immutable GitHub identity fields', async () => {
    const findGitHubIdentity = jest.fn().mockResolvedValue({
      provider_account_id: '42',
      username: 'sharek-owner',
    });
    const { service } = createService({ findGitHubIdentity });

    await expect(service.getGitHubIdentityForUser('user-1')).resolves.toEqual({
      providerAccountId: '42',
      username: 'sharek-owner',
    });
    expect(findGitHubIdentity).toHaveBeenCalledWith({
      where: {
        provider_user_id: { provider: 'github', user_id: 'user-1' },
      },
      select: { provider_account_id: true, username: true },
    });
  });

  it('activates a pending contributor after skill approval', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'user-1',
      role: UserRole.contributor,
      status: UserStatus.pending,
    });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUniqueOrThrow = jest.fn().mockResolvedValue({
      id: 'user-1',
      status: UserStatus.active,
    });
    const { service } = createService({
      findUnique,
      updateMany,
      findUniqueOrThrow,
    });

    await expect(
      service.activateContributorAfterSkillApproval('user-1'),
    ).resolves.toEqual({
      userId: 'user-1',
      activated: true,
      status: 'active',
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        status: UserStatus.pending,
      },
      data: {
        status: UserStatus.active,
      },
    });
    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
      },
      select: {
        id: true,
        status: true,
      },
    });
  });

  it('leaves non-pending contributors unchanged', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'user-1',
      role: UserRole.contributor,
      status: UserStatus.active,
    });
    const updateMany = jest.fn();
    const { service } = createService({ findUnique, updateMany });

    await expect(
      service.activateContributorAfterSkillApproval('user-1'),
    ).resolves.toEqual({
      userId: 'user-1',
      activated: false,
      status: 'active',
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects activation for non-contributor accounts', async () => {
    const { service } = createService({
      findUnique: jest.fn().mockResolvedValue({
        id: 'owner-1',
        role: UserRole.owner,
        status: UserStatus.pending,
      }),
    });

    await expect(
      service.activateContributorAfterSkillApproval('owner-1'),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTOR_ACCOUNT_ROLE_INVALID',
      statusCode: 409,
    });
  });
});
