import {
  ContributionProposalAuditAction,
  ContributionProposalStatus,
  Prisma,
} from '@prisma/client';

import {
  ContributionProposalDto,
  ContributionProposalStatusDto,
  ContributionProposalSummaryDto,
  ContributionProposalVersionDto,
} from '../dto/contribution-proposal-response.dto';

export const PROPOSAL_DETAIL_INCLUDE = {
  versions: { orderBy: { version: 'asc' } },
  auditEvents: {
    where: { action: ContributionProposalAuditAction.revision_requested },
    orderBy: { created_at: 'asc' },
  },
} satisfies Prisma.ContributionProposalInclude;

export const PROPOSAL_SUMMARY_INCLUDE = {
  versions: { orderBy: { version: 'desc' }, take: 1 },
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
    status: presentStatus(proposal.status),
    currentVersion: proposal.current_version,
    disclosure: {
      version: proposal.disclosure_version,
      acknowledgedAt: proposal.disclosure_acknowledged_at,
    },
    revisionRequestedAt: proposal.revision_requested_at,
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
    status: presentStatus(proposal.status),
    currentVersion: proposal.current_version,
    title: proposal.versions[0]?.title ?? '',
    revisionRequestedAt: proposal.revision_requested_at,
    createdAt: proposal.created_at,
    updatedAt: proposal.updated_at,
  };
}

function toVersionDto(version: {
  version: number;
  title: string;
  body: string;
  authored_by: string;
  created_at: Date;
}): ContributionProposalVersionDto {
  return {
    version: version.version,
    title: version.title,
    body: version.body,
    authoredBy: version.authored_by,
    createdAt: version.created_at,
  };
}

function presentStatus(
  status: ContributionProposalStatus,
): ContributionProposalStatusDto {
  return status.toUpperCase() as ContributionProposalStatusDto;
}
