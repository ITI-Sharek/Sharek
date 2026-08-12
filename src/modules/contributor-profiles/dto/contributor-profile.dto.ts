import {
  ContributorExperienceLevel,
  ContributorField,
  ContributorProfile,
  ContributorProfileField,
  User,
} from '@prisma/client';

export type ContributorProfileWithUser = ContributorProfile & {
  user: User;
  experience_level: ContributorExperienceLevel | null;
  fields: Array<ContributorProfileField & { field: ContributorField }>;
};

export interface ContributorFieldDto {
  id: string;
  key: string;
  labelEn: string;
  labelAr: string;
}

export type ContributorExperienceLevelDto = ContributorFieldDto;

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

export interface ContributorProfileGitHubInstallationDto {
  installationLinkId: string;
  accountLogin: string;
  accountType: 'user' | 'organization';
  status: 'active' | 'disconnected' | 'reauthorization_required' | 'revoked';
  verifiedAt: Date | null;
  manageUrl: string | null;
  repositories: ContributorProfileGitHubRepositoryDto[];
}

export interface ContributorProfileGitHubRepositoryDto {
  repositoryId: string;
  fullName: string;
  visibility: string;
  defaultBranch: string | null;
}

export interface ContributorProfileReputationSummaryDto {
  rating: number | null;
  reviewsCount: number;
  completedContributions: number;
  totalAssignedTasks: number;
  successRate: number;
  topVerifiedSkills: Array<{
    name: string;
    verifiedContributionCount: number;
  }>;
}

export interface ContributorProfileDto {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roleLabel: string;
  bio: string | null;
  experienceLevel: ContributorExperienceLevelDto | null;
  fields: ContributorFieldDto[];
  declaredSkills: string[];
  skills: ContributorProfileSkillDto[];
  availability: string | null;
  githubStatus: ContributorProfileGitHubStatusDto;
  githubInstallations: ContributorProfileGitHubInstallationDto[];
  reputationSummary: ContributorProfileReputationSummaryDto;
  contributionHistory: unknown[];
  completionPrompts: string[];
  viewerRelationship: 'owner' | 'authenticated-viewer';
}

export interface ContributorApplicationProfileContextDto {
  bio: string | null;
  availability: string | null;
  experienceLevel: {
    key: string;
    labelEn: string;
    labelAr: string;
  } | null;
  fields: Array<{ key: string; labelEn: string; labelAr: string }>;
  declaredSkills: string[];
}
