import { ContributorProfilesService } from './contributor-profiles.service';

describe('ContributorProfilesService', () => {
  it('idempotently ensures an owner view through exported summary services', async () => {
    const user = {
      id: 'user-1',
      email: 'contributor@example.com',
      username: 'contributor-one',
      password_hash: null,
      first_name: 'Contributor',
      last_name: 'One',
      avatar_url: null,
      role: 'contributor',
      status: 'active',
      preferred_language: 'en',
      created_at: new Date(),
      updated_at: new Date(),
      last_login_at: null,
    };
    const profile = {
      id: 'profile-1',
      user_id: user.id,
      bio: null,
      availability: null,
      experience_level_id: null,
      experience_level: null,
      declared_skills: [],
      avatar_data: null,
      avatar_mime_type: null,
      created_at: new Date(),
      updated_at: new Date(),
      user,
      fields: [],
    };
    const database = {
      contributorProfile: {
        findUnique: jest.fn().mockResolvedValue(profile),
      },
    };
    const identityUsernameService = {
      getUserById: jest.fn().mockResolvedValue(user),
      ensureContributorUsernameForUser: jest.fn().mockResolvedValue(user),
    };
    const githubProfileService = {
      getStatusForUser: jest.fn().mockResolvedValue({
        connected: false,
        username: null,
      }),
    };
    const skillProfileSummaryService = {
      listSkillsForProfile: jest.fn().mockResolvedValue([]),
    };
    const reputationService = {
      getSummaryForUser: jest.fn().mockResolvedValue({
        rating: null,
        reviewsCount: 0,
      }),
    };
    const service = new ContributorProfilesService(
      database as never,
      identityUsernameService as never,
      githubProfileService as never,
      skillProfileSummaryService as never,
      reputationService as never,
    );

    await expect(service.ensure(user.id)).resolves.toMatchObject({
      username: 'contributor-one',
      displayName: 'Contributor One',
      viewerRelationship: 'owner',
    });
    expect(skillProfileSummaryService.listSkillsForProfile).toHaveBeenCalledWith(
      user.id,
      { includeGenerated: true },
    );
  });

  it('stores a validated explicit avatar and returns its stable profile URL', async () => {
    const user = {
      id: 'user-2',
      email: 'avatar@example.com',
      username: 'avatar-user',
      password_hash: null,
      first_name: 'Avatar',
      last_name: 'User',
      avatar_url: 'https://provider.example/old.png',
      role: 'contributor',
      status: 'active',
      preferred_language: 'en',
      created_at: new Date(),
      updated_at: new Date(),
      last_login_at: null,
    };
    const updatedAt = new Date('2026-07-20T09:00:00Z');
    const original = {
      id: 'profile-2',
      user_id: user.id,
      bio: null,
      availability: null,
      experience_level_id: null,
      experience_level: null,
      declared_skills: [],
      avatar_data: null,
      avatar_mime_type: null,
      created_at: new Date(),
      updated_at: updatedAt,
      user,
      fields: [],
    };
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const database = {
      contributorProfile: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(original)
          .mockResolvedValueOnce({
            ...original,
            avatar_data: Uint8Array.from(png),
            avatar_mime_type: 'image/png',
          }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const service = new ContributorProfilesService(
      database as never,
      {
        getUserById: jest.fn().mockResolvedValue(user),
        ensureContributorUsernameForUser: jest.fn().mockResolvedValue(user),
      } as never,
      {
        getStatusForUser: jest
          .fn()
          .mockResolvedValue({ connected: false, username: null }),
      } as never,
      { listSkillsForProfile: jest.fn().mockResolvedValue([]) } as never,
      {
        getSummaryForUser: jest
          .fn()
          .mockResolvedValue(emptyReputationSummary()),
      } as never,
    );

    await expect(
      service.updateAvatar(user.id, {
        buffer: png,
        mimetype: 'image/png',
        size: png.length,
      }),
    ).resolves.toMatchObject({
      avatarUrl: `/contributors/profiles/avatar-user/avatar?v=${updatedAt.getTime()}`,
    });
    expect(database.contributorProfile.update).toHaveBeenCalledWith({
      where: { id: original.id },
      data: {
        avatar_data: Uint8Array.from(png),
        avatar_mime_type: 'image/png',
      },
    });
  });
  it('keeps profile ensure working when GitHub App installations cannot be read', async () => {
    const user = {
      id: 'user-3',
      email: 'resilient@example.com',
      username: 'resilient-user',
      password_hash: null,
      first_name: 'Resilient',
      last_name: 'User',
      avatar_url: null,
      role: 'contributor',
      status: 'active',
      preferred_language: 'en',
      created_at: new Date(),
      updated_at: new Date(),
      last_login_at: null,
    };
    const profile = {
      id: 'profile-3',
      user_id: user.id,
      bio: null,
      availability: null,
      experience_level_id: null,
      experience_level: null,
      declared_skills: [],
      avatar_data: null,
      avatar_mime_type: null,
      created_at: new Date(),
      updated_at: new Date(),
      user,
      fields: [],
    };
    const listInstallationLinks = jest
      .fn()
      .mockRejectedValue(new TypeError("Cannot read properties of undefined"));
    const service = new ContributorProfilesService(
      {
        contributorProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
      } as never,
      {
        getUserById: jest.fn().mockResolvedValue(user),
        ensureContributorUsernameForUser: jest.fn().mockResolvedValue(user),
      } as never,
      {
        getStatusForUser: jest
          .fn()
          .mockResolvedValue({ connected: false, username: null }),
      } as never,
      { listSkillsForProfile: jest.fn().mockResolvedValue([]) } as never,
      {
        getSummaryForUser: jest
          .fn()
          .mockResolvedValue(emptyReputationSummary()),
      } as never,
      { listInstallationLinks } as never,
    );

    // GitHub is optional: an unreadable installation list must not 500 ensure.
    await expect(service.ensure(user.id)).resolves.toMatchObject({
      username: 'resilient-user',
      githubInstallations: [],
    });
    expect(listInstallationLinks).toHaveBeenCalledWith(user.id);
  });

  it('returns admin field categories with their nested fields', async () => {
    const category = {
      id: 'category-1',
      key: 'technology',
      label_en: 'Technology',
      label_ar: 'التكنولوجيا',
      active: true,
      sort_order: 10,
      created_at: new Date(),
      updated_at: new Date(),
      fields: [
        {
          id: 'field-1',
          category_id: 'category-1',
          key: 'web',
          label_en: 'Web development',
          label_ar: 'تطوير الويب',
          active: true,
          sort_order: 10,
          created_at: new Date(),
          updated_at: new Date(),
          category: {
            id: 'category-1',
            key: 'technology',
            label_en: 'Technology',
            label_ar: 'التكنولوجيا',
          },
        },
      ],
    };
    const database = {
      contributorFieldCategory: {
        findMany: jest.fn().mockResolvedValue([category]),
      },
    };
    const service = new ContributorProfilesService(
      database as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.listFieldCategories(true)).resolves.toEqual([
      {
        id: 'category-1',
        key: 'technology',
        labelEn: 'Technology',
        labelAr: 'التكنولوجيا',
        active: true,
        sortOrder: 10,
        fields: [
          {
            id: 'field-1',
            categoryId: 'category-1',
            key: 'web',
            labelEn: 'Web development',
            labelAr: 'تطوير الويب',
            active: true,
            sortOrder: 10,
            category: {
              id: 'category-1',
              key: 'technology',
              labelEn: 'Technology',
              labelAr: 'التكنولوجيا',
            },
          },
        ],
      },
    ]);
  });
});

function emptyReputationSummary() {
  return {
    rating: null,
    reviewsCount: 0,
    completedContributions: 0,
    totalAssignedTasks: 0,
    successRate: 0,
    topVerifiedSkills: [],
  };
}
