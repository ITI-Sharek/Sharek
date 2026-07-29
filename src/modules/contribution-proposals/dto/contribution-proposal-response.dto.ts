export type ContributionProposalStatusDto =
  | 'PENDING'
  | 'WITHDRAWN'
  | 'ACCEPTED'
  | 'DECLINED';

export interface ContributionProposalVersionDto {
  version: number;
  title: string;
  problemOrOpportunity: string;
  proposedOutcome: string;
  projectBenefit: string;
  authoredBy: string;
  createdAt: Date;
}

export interface ContributionProposalRevisionRequestDto {
  reason: string | null;
  requestedBy: string;
  requestedAt: Date;
}

export interface ContributionProposalDisclosureDto {
  version: string;
  acknowledgedAt: Date;
}

export interface ContributionProposalDto {
  id: string;
  projectId: string;
  proposerId: string;
  status: ContributionProposalStatusDto;
  currentVersion: number;
  disclosure: ContributionProposalDisclosureDto;
  revisionRequestedAt: Date | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  declineReason: string | null;
  resultingContributionRequestId: string | null;
  latestVersion: ContributionProposalVersionDto | null;
  versions: ContributionProposalVersionDto[];
  revisionRequests: ContributionProposalRevisionRequestDto[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ContributionProposalSummaryDto {
  id: string;
  projectId: string;
  proposerId: string;
  status: ContributionProposalStatusDto;
  currentVersion: number;
  title: string;
  revisionRequestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContributionProposalListDto {
  proposals: ContributionProposalSummaryDto[];
  pageInfo: {
    nextCursor: string | null;
    hasNextPage: boolean;
  };
}

export interface ProposalIntakeDto {
  projectId: string;
  enabled: boolean;
}

export interface ContributionProposalMisuseReportDto {
  id: string;
  proposalId: string;
  reporterId: string;
  reportedVersion: number;
  reason: string;
  createdAt: Date;
}
