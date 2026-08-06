import {
  ContributionProposalAuditAction,
  ContributionProposalStatus,
  Prisma,
} from '@prisma/client';

import {
  ContributionProposalDto,
  ContributionProposalResultingRequestStatusDto,
  ContributionProposalStatusDto,
  ContributionProposalSummaryDto,
  ContributionProposalVersionDto,
} from '../dto/contribution-proposal-response.dto';

/**
 * Mirrors the attribution select used for published Contribution Requests, so
 * an owner sees the same identity fields wherever a contributor is surfaced.
 */
const PROPOSER_IDENTITY_SELECT = {
  select: { id: true, username: true, first_name: true, last_name: true },
} as const;

export const PROPOSAL_DETAIL_INCLUDE = {
  versions: { orderBy: { version: 'asc' } },
  auditEvents: {
    where: { action: ContributionProposalAuditAction.revision_requested },
    orderBy: { created_at: 'asc' },
  },
  originatedRequest: { select: { id: true, status: true } },
  proposer: PROPOSER_IDENTITY_SELECT,
} satisfies Prisma.ContributionProposalInclude;

export const PROPOSAL_SUMMARY_INCLUDE = {
  versions: { orderBy: { version: 'desc' }, take: 1 },
  proposer: PROPOSER_IDENTITY_SELECT,
} satisfies Prisma.ContributionProposalInclude;

export type ContributionProposalWithDetail =
  Prisma.ContributionProposalGetPayload<{
    include: typeof PROPOSAL_DETAIL_INCLUDE;
  }>;

export type ContributionProposalWithLatestVersion =
  Prisma.ContributionProposalGetPayload<{
    include: typeof PROPOSAL_SUMMARY_INCLUDE;
  }>;

export function toContributionProposalDto(
  proposal: ContributionProposalWithDetail,
): ContributionProposalDto {
  const versions = proposal.versions.map(toVersionDto);
  return {
    id: proposal.id,
    projectId: proposal.project_id,
    proposerId: proposal.proposer_id,
    proposerName: toProposerName(proposal.proposer),
    proposerUsername: proposal.proposer.username,
    status: presentStatus(proposal.status),
    currentVersion: proposal.current_version,
    disclosure: {
      version: proposal.disclosure_version,
      acknowledgedAt: proposal.disclosure_acknowledged_at,
    },
    revisionRequestedAt: proposal.revision_requested_at,
    acceptedAt: proposal.accepted_at,
    declinedAt: proposal.declined_at,
    declineReason: proposal.decline_reason,
    resultingContributionRequestId: proposal.originatedRequest?.id ?? null,
    resultingContributionRequestStatus: proposal.originatedRequest
      ? (proposal.originatedRequest.status.toUpperCase() as ContributionProposalResultingRequestStatusDto)
      : null,
    latestVersion: versions.length > 0 ? versions[versions.length - 1] : null,
    versions,
    revisionRequests: proposal.auditEvents.map((event) => ({
      reason: event.reason,
      requestedBy: event.actor_id,
      requestedAt: event.created_at,
    })),
    createdAt: proposal.created_at,
    updatedAt: proposal.updated_at,
  };
}

export function toContributionProposalSummaryDto(
  proposal: ContributionProposalWithLatestVersion,
): ContributionProposalSummaryDto {
  return {
    id: proposal.id,
    projectId: proposal.project_id,
    proposerId: proposal.proposer_id,
    proposerName: toProposerName(proposal.proposer),
    proposerUsername: proposal.proposer.username,
    status: presentStatus(proposal.status),
    currentVersion: proposal.current_version,
    title: proposal.versions[0]?.title ?? '',
    revisionRequestedAt: proposal.revision_requested_at,
    createdAt: proposal.created_at,
    updatedAt: proposal.updated_at,
  };
}

function toProposerName(proposer: {
  first_name: string;
  last_name: string;
}): string {
  return `${proposer.first_name} ${proposer.last_name}`.trim();
}

function toVersionDto(version: {
  version: number;
  title: string;
  problem_or_opportunity: string;
  proposed_outcome: string;
  project_benefit: string;
  authored_by: string;
  created_at: Date;
}): ContributionProposalVersionDto {
  return {
    version: version.version,
    title: version.title,
    problemOrOpportunity: version.problem_or_opportunity,
    proposedOutcome: version.proposed_outcome,
    projectBenefit: version.project_benefit,
    authoredBy: version.authored_by,
    createdAt: version.created_at,
  };
}

function presentStatus(
  status: ContributionProposalStatus,
): ContributionProposalStatusDto {
  return status.toUpperCase() as ContributionProposalStatusDto;
}
