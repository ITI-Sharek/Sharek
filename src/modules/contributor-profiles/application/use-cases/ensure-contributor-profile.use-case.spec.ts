import { User } from '@prisma/client';

import { EnsureContributorProfileUseCase } from './ensure-contributor-profile.use-case';
import { ContributorProfileWithUser } from '../ports/contributor-profile.repository';

const contributor = {
  id: 'user-1',
  email: 'contributor@example.com',
  username: 'contributor-one',
  password_hash: 'hash',
  first_name: 'Contributor',
  last_name: 'One',
  avatar_url: null,
  role: 'contributor',
  status: 'active',
  preferred_language: 'en',
  created_at: new Date(),
  updated_at: new Date(),
  last_login_at: null,
} as User;

const profile = {
  id: 'profile-1',
  user_id: 'user-1',
  bio: null,
  availability: null,
  created_at: new Date(),
  updated_at: new Date(),
  user: contributor,
} as ContributorProfileWithUser;

function createUseCase(overrides: {
  user?: User | null;
  existingProfile?: ContributorProfileWithUser | null;
} = {}) {
  const repository = {
    findByUserId: jest.fn().mockResolvedValue(overrides.existingProfile ?? null),
    createForUser: jest.fn().mockResolvedValue(profile),
  };

  const identityUsernameService = {
    getUserById: jest
      .fn()
      .mockResolvedValue(overrides.user === undefined ? contributor : overrides.user),
    ensureContributorUsernameForUser: jest.fn().mockResolvedValue(contributor),
  };

  const useCase = new EnsureContributorProfileUseCase(
    identityUsernameService as any,
    repository as any,
    {
      getStatusForUser: jest.fn().mockResolvedValue({
        connected: false,
        username: null,
      }),
    } as any,
    {
      listSkillsForProfile: jest.fn().mockResolvedValue([]),
    } as any,
    {
      getSummaryForUser: jest.fn().mockResolvedValue({
        rating: null,
        reviewsCount: 0,
      }),
    } as any,
  );

  return {
    useCase,
    repository,
    identityUsernameService,
  };
}

describe('EnsureContributorProfileUseCase', () => {
  it('creates and returns the owner profile DTO', async () => {
    const { useCase, repository } = createUseCase();

    await expect(
      useCase.execute({
        viewerUserId: 'user-1',
      }),
    ).resolves.toMatchObject({
      username: 'contributor-one',
      viewerRelationship: 'owner',
    });
    expect(repository.createForUser).toHaveBeenCalledWith('user-1');
  });

  it('returns an existing profile idempotently', async () => {
    const { useCase, repository } = createUseCase({
      existingProfile: profile,
    });

    await useCase.execute({
      viewerUserId: 'user-1',
    });

    expect(repository.createForUser).not.toHaveBeenCalled();
  });

  it('rejects non-contributors', async () => {
    const { useCase, repository, identityUsernameService } = createUseCase({
      user: {
        ...contributor,
        role: 'owner',
      } as User,
    });

    await expect(
      useCase.execute({
        viewerUserId: 'user-1',
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(identityUsernameService.ensureContributorUsernameForUser).not.toHaveBeenCalled();
    expect(repository.createForUser).not.toHaveBeenCalled();
  });

  it('rejects suspended contributors before username or profile writes', async () => {
    const { useCase, repository, identityUsernameService } = createUseCase({
      user: {
        ...contributor,
        username: null,
        status: 'suspended',
      } as User,
    });

    await expect(
      useCase.execute({
        viewerUserId: 'user-1',
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(identityUsernameService.ensureContributorUsernameForUser).not.toHaveBeenCalled();
    expect(repository.createForUser).not.toHaveBeenCalled();
  });
});
