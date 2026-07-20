import {
  ContributorExperienceRange,
  ContributorField,
  ContributorProfile,
  ContributorProfileField,
  User,
} from '@prisma/client';

export type ContributorProfileWithUser = ContributorProfile & {
  user: User;
  fields: Array<ContributorProfileField & { field: ContributorField }>;
};

export interface ContributorFieldDto {
  id: string;
  key: string;
  labelEn: string;
  labelAr: string;
}

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
  experienceRange: ContributorExperienceRange | null;
  fields: ContributorFieldDto[];
  declaredSkills: string[];
  skills: ContributorProfileSkillDto[];
  availability: string | null;
  githubStatus: ContributorProfileGitHubStatusDto;
  reputationSummary: ContributorProfileReputationSummaryDto;
  contributionHistory: unknown[];
  completionPrompts: string[];
  viewerRelationship: 'owner' | 'authenticated-viewer';
}
