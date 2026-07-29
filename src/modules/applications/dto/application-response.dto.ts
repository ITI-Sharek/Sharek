export type ApplicationStatusDto =
  | 'PENDING_OWNER_REVIEW'
  | 'ACCEPTED'
  | 'DECLINED_BY_OWNER'
  | 'NOT_SELECTED'
  | 'EXPIRED'
  | 'WITHDRAWN'
  | 'REQUEST_CANCELLED';

export interface ApplicationContributorDto {
  id: string;
  username: string | null;
  displayName: string;
}

export interface ApplicationRequirementSnapshotDto {
  required: Array<{ id: string; position: number; text: string }>;
  preferred: Array<{ id: string; position: number; text: string }>;
}

export interface ApplicationEvidenceSummaryDto {
  skillProfileId: string;
  name: string;
  proficiencyLevel: string;
  evidenceSummary: string | null;
  limitations: string[];
}

export interface ApplicationProfileContextDto {
  bio: string | null;
  availability: string | null;
  experienceLevel: { key: string; labelEn: string; labelAr: string } | null;
  fields: Array<{ key: string; labelEn: string; labelAr: string }>;
  declaredSkills: string[];
}

export interface ApplicationDto {
  id: string;
  contributionRequestId: string;
  contributor: ApplicationContributorDto;
  profileContext: ApplicationProfileContextDto;
  contributionApproach: string | null;
  proposedDeliveryDurationDays: number | null;
  status: ApplicationStatusDto;
  requirementSnapshot: ApplicationRequirementSnapshotDto;
  evidenceSummary: ApplicationEvidenceSummaryDto[];
  submittedAt: Date;
  reviewDueAt: Date | null;
  expiresAt: Date | null;
}

export interface OwnerApplicationsDto {
  applications: ApplicationDto[];
}

export type OwnerDecisionTypeDto = 'ACCEPTED' | 'DECLINED';

export interface OwnerDecisionDto {
  id: string;
  applicationId: string;
  contributionRequestId: string;
  decisionType: OwnerDecisionTypeDto;
  feedback: string | null;
  decidedAt: Date;
}

export interface AssignmentDto {
  id: string;
  contributionRequestId: string;
  applicationId: string;
  ownerDecisionId: string;
  contributorId: string;
  agreedDeliveryDurationDays: number;
  agreedDeliveryDueDate: Date;
  assignedAt: Date;
}

export interface OwnerDecisionResultDto {
  application: ApplicationDto;
  ownerDecision: OwnerDecisionDto;
  assignment: AssignmentDto | null;
}

export interface OwnerDecisionReportContextDto {
  ownerDecisionId: string;
  applicationId: string;
  contributionRequestId: string;
  contributorId: string;
  ownerId: string;
  feedback: string;
}
