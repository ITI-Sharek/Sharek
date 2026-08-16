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
  githubInstallations?: ContributorProfileDto['githubInstallations'];
  skills: ContributorProfileSkillDto[];
  reputationSummary: ContributorProfileReputationSummaryDto;
}): ContributorProfileDto {
  const { profile, viewerRelationship, githubStatus, skills } = input;
  const displayName = `${profile.user.first_name} ${profile.user.last_name}`.trim();
  const isOwner = viewerRelationship === 'owner';
  const activeFields = profile.fields.filter(
    ({ field }) => field.active && field.category.active,
  );

  return {
    username: profile.user.username ?? '',
    displayName,
    avatarUrl: profile.avatar_data
      ? `/contributors/profiles/${encodeURIComponent(profile.user.username ?? '')}/avatar?v=${profile.updated_at.getTime()}`
      : profile.user.avatar_url,
    roleLabel: 'Contributor',
    bio: profile.bio,
    experienceLevel: profile.experience_level
      ? {
          id: profile.experience_level.id,
          key: profile.experience_level.key,
          labelEn: profile.experience_level.label_en,
          labelAr: profile.experience_level.label_ar,
        }
      : null,
    fields: activeFields.map(({ field }) => ({
      id: field.id,
      categoryId: field.category_id,
      key: field.key,
      labelEn: field.label_en,
      labelAr: field.label_ar,
      category: {
        id: field.category.id,
        key: field.category.key,
        labelEn: field.category.label_en,
        labelAr: field.category.label_ar,
      },
    })),
    declaredSkills: profile.declared_skills,
    skills,
    availability: profile.availability,
    githubStatus,
    githubInstallations: isOwner ? (input.githubInstallations ?? []) : [],
    reputationSummary: input.reputationSummary,
    contributionHistory: [],
    completionPrompts: isOwner
      ? buildCompletionPrompts({
          bio: profile.bio,
          experienceLevelId: profile.experience_level_id,
          fields: activeFields,
          skills,
          githubStatus,
        })
      : [],
    viewerRelationship,
  };
}
