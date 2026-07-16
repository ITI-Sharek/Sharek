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
      created_at: new Date(),
      updated_at: new Date(),
      user,
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
});
