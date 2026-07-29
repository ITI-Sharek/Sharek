export type ContributionProposalStatusDto = 'PENDING' | 'WITHDRAWN';

export interface ContributionProposalVersionDto {
  version: number;
  title: string;
  body: string;
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
}

export interface ProposalIntakeDto {
  projectId: string;
  enabled: boolean;
}
