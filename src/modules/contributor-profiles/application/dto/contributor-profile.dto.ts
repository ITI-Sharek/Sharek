export interface ContributorProfileSkillDto {
  name: string;
  proficiencyLevel: 'beginner' | 'intermediate' | 'advanced';
  confidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'disputed' | 'superseded';
  evidenceSummary: string | null;
}

export interface ContributorProfileGitHubStatusDto {
  connected: boolean;
  username: string | null;
}

export interface ContributorProfileReputationSummaryDto {
  rating: number | null;
  reviewsCount: number;
}

export interface ContributorProfileDto {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roleLabel: string;
  bio: string | null;
  skills: ContributorProfileSkillDto[];
  availability: string | null;
  githubStatus: ContributorProfileGitHubStatusDto;
  reputationSummary: ContributorProfileReputationSummaryDto;
  contributionHistory: unknown[];
  completionPrompts: string[];
  viewerRelationship: 'owner' | 'authenticated-viewer';
}
