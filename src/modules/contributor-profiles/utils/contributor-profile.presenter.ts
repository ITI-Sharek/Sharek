import {
  ContributorProfileDto,
  ContributorProfileGitHubStatusDto,
  ContributorProfileReputationSummaryDto,
  ContributorProfileSkillDto,
  ContributorProfileWithUser,
} from '../dto/contributor-profile.dto';
import { ViewerRelationship } from '../validators/contributor-profile.validator';
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
  const activeFields = profile.fields.filter(({ field }) => field.active);

  return {
    username: profile.user.username ?? '',
    displayName,
    avatarUrl: profile.avatar_data
      ? `/contributors/profiles/${encodeURIComponent(profile.user.username ?? '')}/avatar?v=${profile.updated_at.getTime()}`
      : profile.user.avatar_url,
    roleLabel: 'Contributor',
    bio: profile.bio,
    experienceRange: profile.experience_range,
    fields: activeFields.map(({ field }) => ({
      id: field.id,
      key: field.key,
      labelEn: field.label_en,
      labelAr: field.label_ar,
    })),
    declaredSkills: profile.declared_skills,
    skills,
    availability: profile.availability,
    githubStatus,
    reputationSummary: input.reputationSummary,
    contributionHistory: [],
    completionPrompts: isOwner
      ? buildCompletionPrompts({
          bio: profile.bio,
          experienceRange: profile.experience_range,
          fields: activeFields,
          skills,
          githubStatus,
        })
      : [],
    viewerRelationship,
  };
}
