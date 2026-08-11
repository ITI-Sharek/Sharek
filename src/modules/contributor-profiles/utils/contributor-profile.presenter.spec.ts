import {
  presentContributorProfile,
} from './contributor-profile.presenter';
import { ContributorProfileWithUser } from '../dto/contributor-profile.dto';

const profile = {
  id: 'profile-1',
  user_id: 'user-1',
  bio: null,
  availability: null,
  experience_level_id: null,
  experience_level: null,
  declared_skills: [],
  avatar_data: null,
  avatar_mime_type: null,
  created_at: new Date(),
  updated_at: new Date(),
  fields: [],
  user: {
    id: 'user-1',
    email: 'contributor@example.com',
    username: 'contributor-one',
    password_hash: 'secret',
    first_name: 'Contributor',
    last_name: 'One',
    avatar_url: null,
    role: 'contributor',
    status: 'active',
    preferred_language: 'en',
    created_at: new Date(),
    updated_at: new Date(),
    last_login_at: null,
  },
} as ContributorProfileWithUser;

describe('contributor profile presenter', () => {
  it('returns owner completion prompts without private fields', () => {
    const output = presentContributorProfile({
      profile,
      viewerRelationship: 'owner',
      githubStatus: {
        connected: false,
        username: null,
      },
      skills: [],
      reputationSummary: {
        rating: null,
        reviewsCount: 0,
        completedContributions: 0,
        totalAssignedTasks: 0,
        successRate: 0,
        topVerifiedSkills: [],
      },
    });

    expect(output).toMatchObject({
      username: 'contributor-one',
      displayName: 'Contributor One',
      viewerRelationship: 'owner',
      completionPrompts: [
        'add_bio',
        'add_experience',
        'add_fields',
        'generate_skills',
        'connect_github',
      ],
    });
    expect(JSON.stringify(output)).not.toContain('password_hash');
    expect(JSON.stringify(output)).not.toContain('secret');
  });

  it('suppresses completion prompts for authenticated viewers', () => {
    const output = presentContributorProfile({
      profile,
      viewerRelationship: 'authenticated-viewer',
      githubStatus: {
        connected: true,
        username: 'octo',
      },
      skills: [
        {
          name: 'NestJS',
          proficiencyLevel: 'advanced',
          confidence: 0.9,
          status: 'approved',
          evidenceSummary: null,
        },
      ],
      reputationSummary: {
        rating: 4.5,
        reviewsCount: 2,
        completedContributions: 2,
        totalAssignedTasks: 3,
        successRate: 66.67,
        topVerifiedSkills: [
          { name: 'NestJS', verifiedContributionCount: 2 },
        ],
      },
    });

    expect(output.completionPrompts).toEqual([]);
    expect(output.skills).toHaveLength(1);
    expect(output.skills[0]).toEqual({
      name: 'NestJS',
      proficiencyLevel: 'advanced',
      confidence: 0.9,
      status: 'approved',
      evidenceSummary: null,
    });
    expect(output.reputationSummary).toEqual({
      rating: 4.5,
      reviewsCount: 2,
      completedContributions: 2,
      totalAssignedTasks: 3,
      successRate: 66.67,
      topVerifiedSkills: [
        { name: 'NestJS', verifiedContributionCount: 2 },
      ],
    });
  });
});
