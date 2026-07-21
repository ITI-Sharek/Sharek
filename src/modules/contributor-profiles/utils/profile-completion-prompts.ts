import { ContributorProfileGitHubStatusDto, ContributorProfileSkillDto } from '../dto/contributor-profile.dto';

export function buildCompletionPrompts(input: {
  bio: string | null;
  experienceLevelId?: string | null;
  fields?: unknown[];
  skills: ContributorProfileSkillDto[];
  githubStatus: ContributorProfileGitHubStatusDto;
}): string[] {
  const prompts: string[] = [];

  if (!input.bio?.trim()) {
    prompts.push('add_bio');
  }

  if (!input.experienceLevelId) {
    prompts.push('add_experience');
  }

  if (input.fields?.length === 0) {
    prompts.push('add_fields');
  }

  if (input.skills.length === 0) {
    prompts.push('generate_skills');
  }

  if (!input.githubStatus.connected) {
    prompts.push('connect_github');
  }

  return prompts;
}
