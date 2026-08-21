import { ApplicationStatus, OwnerDecisionType, Prisma } from '@prisma/client';

import {
  ApplicationDto,
  ApplicationEvidenceSummaryDto,
  ApplicationProfileContextDto,
  ApplicationRequirementSnapshotDto,
  ApplicationStatusDto,
  OwnerDecisionResultDto,
} from '../dto/application-response.dto';
import {
  ApplicationRequestScopeDto,
  PendingApplicationsOwnerWorkspaceSummaryDto,
} from '../dto/owner-workspace-summary.dto';
import { APPLICATION_REVIEW_OVERDUE_DAYS } from '../application-review-window.policy';

export const APPLICATION_INCLUDE = {
  requirementSnapshot: true,
  evidenceSnapshot: true,
  contributionRequest: { select: { owner_id: true } },
  ownerDecision: true,
  assignment: true,
} satisfies Prisma.ApplicationInclude;

export type ApplicationWithSnapshots = Prisma.ApplicationGetPayload<{
  include: typeof APPLICATION_INCLUDE;
}>;

export const OWNER_DECISION_INCLUDE = {
  application: { include: APPLICATION_INCLUDE },
  assignment: true,
} satisfies Prisma.OwnerDecisionInclude;

export type OwnerDecisionWithResult = Prisma.OwnerDecisionGetPayload<{
  include: typeof OWNER_DECISION_INCLUDE;
}>;

export function toApplicationDto(
  application: ApplicationWithSnapshots,
): ApplicationDto {
  const context = toJsonObject(
    application.evidenceSnapshot?.contributor_context,
  );
  const requirements = toJsonArray(
    application.requirementSnapshot?.requirements,
  );
  const evidence = toJsonArray(application.evidenceSnapshot?.evidence);
  return {
    id: application.id,
    contributionRequestId: application.contribution_request_id,
    contributor: {
      id: application.contributor_id,
      username:
        typeof context.username === 'string' ? context.username : null,
      displayName:
        typeof context.displayName === 'string'
          ? context.displayName
          : 'Contributor',
    },
    profileContext: toProfileContextDto(context.profile),
    contributionApproach:
      application.contribution_approach ?? application.cover_message,
    proposedDeliveryDurationDays: application.proposed_delivery_duration_days,
    status: toApplicationStatusDto(application.status),
    requirementSnapshot: toRequirementSnapshotDto(requirements),
    evidenceSummary: evidence.map((item) => toEvidenceSummaryDto(item)),
    submittedAt: application.submitted_at,
    reviewDueAt: application.review_due_at,
    expiresAt: application.expires_at,
    expiredAt: application.expired_at,
    overdue:
      application.status === ApplicationStatus.pending_owner_review &&
      Date.now() >=
        addDays(
          application.submitted_at,
          APPLICATION_REVIEW_OVERDUE_DAYS,
        ).getTime(),
    ownerDecision: application.ownerDecision
      ? toOwnerDecisionDto(application.ownerDecision)
      : null,
    assignment: application.assignment
      ? toAssignmentDto(application.assignment)
      : null,
  };
}

export function toOwnerDecisionResultDto(
  decision: OwnerDecisionWithResult,
): OwnerDecisionResultDto {
  return {
    application: toApplicationDto(decision.application),
    ownerDecision: toOwnerDecisionDto(decision),
    assignment: decision.assignment
      ? toAssignmentDto(decision.assignment)
      : null,
  };
}

export function toApplicationStatusDto(
  status: ApplicationStatus,
): ApplicationStatusDto {
  return status.toUpperCase() as ApplicationStatusDto;
}

export function toEmptyOwnerWorkspaceSummaryDto(
  requestScopes: ApplicationRequestScopeDto[],
): PendingApplicationsOwnerWorkspaceSummaryDto {
  return {
    projects: requestScopes.map((scope) => ({
      projectId: scope.projectId,
      pendingApplicationCount: 0,
    })),
  };
}

export function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

export function toJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toOwnerDecisionDto(
  decision: Prisma.OwnerDecisionGetPayload<Record<string, never>>,
) {
  return {
    id: decision.id,
    applicationId: decision.application_id,
    contributionRequestId: decision.contribution_request_id,
    decisionType:
      decision.decision_type === OwnerDecisionType.accepted
        ? ('ACCEPTED' as const)
        : ('DECLINED' as const),
    feedback: decision.feedback,
    decidedAt: decision.decided_at,
  };
}

function toAssignmentDto(
  assignment: Prisma.AssignmentGetPayload<Record<string, never>>,
) {
  return {
    id: assignment.id,
    contributionRequestId: assignment.contribution_request_id,
    applicationId: assignment.application_id,
    ownerDecisionId: assignment.owner_decision_id,
    contributorId: assignment.contributor_id,
    agreedDeliveryDurationDays:
      assignment.agreed_delivery_duration_days,
    agreedDeliveryDueDate: assignment.agreed_delivery_due_at,
    assignedAt: assignment.assigned_at,
  };
}

function toRequirementSnapshotDto(
  items: unknown[],
): ApplicationRequirementSnapshotDto {
  const mapped = items.map((item) => toJsonObject(item));
  const project = (kind: string) =>
    mapped
      .filter((item) => item.kind === kind)
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : '',
        position: typeof item.position === 'number' ? item.position : 0,
        text: typeof item.text === 'string' ? item.text : '',
      }));
  return { required: project('required'), preferred: project('preferred') };
}

function toEvidenceSummaryDto(item: unknown): ApplicationEvidenceSummaryDto {
  const value = toJsonObject(item);
  const sources = toJsonObject(value.evidenceSources);
  return {
    skillProfileId:
      typeof value.skillProfileId === 'string' ? value.skillProfileId : '',
    name: typeof value.name === 'string' ? value.name : '',
    proficiencyLevel:
      typeof value.proficiencyLevel === 'string'
        ? value.proficiencyLevel
        : 'beginner',
    evidenceSummary:
      typeof value.evidenceSummary === 'string'
        ? value.evidenceSummary
        : null,
    limitations: Array.isArray(sources.limitations)
      ? sources.limitations.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
  };
}

function toProfileContextDto(value: unknown): ApplicationProfileContextDto {
  const profile = toJsonObject(value);
  const experience = toJsonObject(profile.experienceLevel);
  const fields = toJsonArray(profile.fields).map((field) =>
    toJsonObject(field),
  );
  return {
    bio: typeof profile.bio === 'string' ? profile.bio : null,
    availability:
      typeof profile.availability === 'string' ? profile.availability : null,
    experienceLevel:
      typeof experience.key === 'string'
        ? {
            key: experience.key,
            labelEn:
              typeof experience.labelEn === 'string'
                ? experience.labelEn
                : '',
            labelAr:
              typeof experience.labelAr === 'string'
                ? experience.labelAr
                : '',
          }
        : null,
    fields: fields
      .filter((field) => typeof field.key === 'string')
      .map((field) => ({
        key: field.key as string,
        labelEn: typeof field.labelEn === 'string' ? field.labelEn : '',
        labelAr: typeof field.labelAr === 'string' ? field.labelAr : '',
      })),
    declaredSkills: toJsonArray(profile.declaredSkills).filter(
      (skill): skill is string => typeof skill === 'string',
    ),
  };
}
