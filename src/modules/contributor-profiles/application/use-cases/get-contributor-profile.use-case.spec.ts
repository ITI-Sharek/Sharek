import { User } from '@prisma/client';

import { GetContributorProfileUseCase } from './get-contributor-profile.use-case';
import { ContributorProfileWithUser } from '../ports/contributor-profile.repository';

const user = {
  id: 'profile-owner',
  email: 'owner@example.com',
  username: 'profile-owner',
  password_hash: 'hash',
  first_name: 'Profile',
  last_name: 'Owner',
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
  user_id: 'profile-owner',
  bio: 'Backend contributor',
  availability: null,
  created_at: new Date(),
  updated_at: new Date(),
  user,
} as ContributorProfileWithUser;

function createUseCase(profileResult: ContributorProfileWithUser | null = profile) {
  const skillReader = {
    listSkillsForProfile: jest.fn().mockResolvedValue([]),
  };
  const useCase = new GetContributorProfileUseCase(
    {
      findByUsername: jest.fn().mockResolvedValue(profileResult),
    } as any,
    {
      getStatusForUser: jest.fn().mockResolvedValue({
        connected: true,
        username: 'octo',
      }),
    } as any,
    skillReader as any,
    {
      getSummaryForUser: jest.fn().mockResolvedValue({
        rating: 5,
        reviewsCount: 1,
      }),
    } as any,
  );

  return { useCase, skillReader };
}

describe('GetContributorProfileUseCase', () => {
  it('returns owner responses with all generated skills requested', async () => {
    const { useCase, skillReader } = createUseCase();

    await expect(
      useCase.execute({
        viewerUserId: 'profile-owner',
        username: 'profile-owner',
      }),
    ).resolves.toMatchObject({
      viewerRelationship: 'owner',
      completionPrompts: ['generate_skills'],
    });
    expect(skillReader.listSkillsForProfile).toHaveBeenCalledWith('profile-owner', {
      includeGenerated: true,
    });
  });

  it('returns authenticated-viewer responses with approved-only skills requested', async () => {
    const { useCase, skillReader } = createUseCase();

    await expect(
      useCase.execute({
        viewerUserId: 'viewer-2',
        username: 'profile-owner',
      }),
    ).resolves.toMatchObject({
      viewerRelationship: 'authenticated-viewer',
      completionPrompts: [],
    });
    expect(skillReader.listSkillsForProfile).toHaveBeenCalledWith('profile-owner', {
      includeGenerated: false,
    });
  });

  it('returns 404 for unknown or hidden inactive profiles', async () => {
    const { useCase } = createUseCase({
      ...profile,
      user: {
        ...user,
        status: 'deactivated',
      } as User,
    });

    await expect(
      useCase.execute({
        viewerUserId: 'viewer-2',
        username: 'profile-owner',
      }),
    ).rejects.toMatchObject({
      code: 'PROFILE_NOT_FOUND',
      statusCode: 404,
    });
  });
});
