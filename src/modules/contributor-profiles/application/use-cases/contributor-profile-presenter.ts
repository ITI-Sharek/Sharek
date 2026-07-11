import { ContributorProfileWithUser } from '../ports/contributor-profile.repository';
import {
  ContributorProfileDto,
  ContributorProfileGitHubStatusDto,
  ContributorProfileReputationSummaryDto,
  ContributorProfileSkillDto,
} from '../dto/contributor-profile.dto';
import { ViewerRelationship } from '../../domain/policies/contributor-profile.policy';
import { buildCompletionPrompts } from './profile-completion-prompts';

export function presentContributorProfile(input: {
  profile: ContributorProfileWithUser;
  viewerRelationship: ViewerRelationship;
  githubStatus: ContributorProfileGitHubStatusDto;
  skills: ContributorProfileSkillDto[];
  reputationSummary: ContributorProfileReputationSummaryDto;
}): ContributorProfileDto {
  const { profile, viewerRelationship, githubStatus, skills } = input;
  const displayName = `${profile.user.first_name} ${profile.user.last_name}`.trim();
  const isOwner = viewerRelationship === 'owner';

  return {
    username: profile.user.username ?? '',
    displayName,
    avatarUrl: profile.user.avatar_url,
    roleLabel: 'Contributor',
    bio: profile.bio,
    skills,
    availability: profile.availability,
    githubStatus,
    reputationSummary: input.reputationSummary,
    contributionHistory: [],
    completionPrompts: isOwner
      ? buildCompletionPrompts({
          bio: profile.bio,
          skills,
          githubStatus,
        })
      : [],
    viewerRelationship,
  };
}
