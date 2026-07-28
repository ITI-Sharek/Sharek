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

export interface ApplicationDto {
  id: string;
  contributionRequestId: string;
  contributor: ApplicationContributorDto;
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
