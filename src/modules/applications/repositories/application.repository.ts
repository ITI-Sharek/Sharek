import {
  ApplicationAuditAction,
  ApplicationStatus,
  OwnerDecisionType,
  Prisma,
} from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import {
  APPLICATION_INCLUDE,
  ApplicationWithSnapshots,
  OWNER_DECISION_INCLUDE,
  OwnerDecisionWithResult,
} from '../mappers/application.mapper';

/**
 * The only place the applications module touches DatabaseService for
 * Application, snapshot, audit, OwnerDecision, and Assignment rows.
 *
 * One method per query, named after intent. Transactions are opened by the
 * caller (`inTransaction`); every write method takes the transaction client so
 * it joins the caller's atomic boundary. Callers prepare JSON snapshot payloads
 * (`Prisma.InputJsonValue`) themselves — the projections encode submission
 * policy and stay next to the use case that owns them.
 */
export class ApplicationRepository {
  constructor(private readonly database: DatabaseService) {}

  async inTransaction<T>(
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.database.$transaction(work);
  }

  async findAppliedContributionRequestIds(
    contributorId: string,
  ): Promise<string[]> {
    const applications = await this.database.application.findMany({
      where: { contributor_id: contributorId },
      select: { contribution_request_id: true },
    });
    return applications.map(
      (application) => application.contribution_request_id,
    );
  }

  async findPendingForRequest(
    contributionRequestId: string,
  ): Promise<ApplicationWithSnapshots[]> {
    return this.database.application.findMany({
      where: {
        contribution_request_id: contributionRequestId,
        status: ApplicationStatus.pending_owner_review,
      },
      orderBy: [{ submitted_at: 'asc' }, { id: 'asc' }],
      include: APPLICATION_INCLUDE,
    });
  }

  async findById(
    applicationId: string,
  ): Promise<ApplicationWithSnapshots | null> {
    return this.database.application.findUnique({
      where: { id: applicationId },
      include: APPLICATION_INCLUDE,
    });
  }

  async findDeclinedDecisionForContributor(
    ownerDecisionId: string,
    contributorId: string,
  ) {
    return this.database.ownerDecision.findFirst({
      where: {
        id: ownerDecisionId,
        decision_type: OwnerDecisionType.declined,
        application: { contributor_id: contributorId },
      },
      select: {
        id: true,
        application_id: true,
        contribution_request_id: true,
        owner_id: true,
        feedback: true,
        application: { select: { contributor_id: true } },
      },
    });
  }

  async countPendingByContributionRequestIds(
    contributionRequestIds: string[],
  ): Promise<Map<string, number>> {
    const counts = await this.database.application.groupBy({
      by: ['contribution_request_id'],
      where: {
        contribution_request_id: { in: contributionRequestIds },
        status: ApplicationStatus.pending_owner_review,
      },
      _count: { _all: true },
    });
    return new Map(
      counts.map((count) => [count.contribution_request_id, count._count._all]),
    );
  }

  async findDuplicateForContributor(
    input: { contributionRequestId: string; contributorId: string },
    transaction: Prisma.TransactionClient,
  ): Promise<ApplicationWithSnapshots | null> {
    return transaction.application.findUnique({
      where: {
        contribution_request_id_contributor_id: {
          contribution_request_id: input.contributionRequestId,
          contributor_id: input.contributorId,
        },
      },
      include: APPLICATION_INCLUDE,
    });
  }

  async createRequirementSnapshot(
    input: {
      requirementSnapshotId: string;
      contributionRequestId: string;
      sourceRequestUpdatedAt: Date;
      requirements: Prisma.InputJsonValue;
      skillRequirements: Prisma.InputJsonValue;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.applicationRequirementSnapshot.create({
      data: {
        id: input.requirementSnapshotId,
        contribution_request_id: input.contributionRequestId,
        source_request_updated_at: input.sourceRequestUpdatedAt,
        requirements: input.requirements,
        skill_requirements: input.skillRequirements,
      },
    });
  }

  async createEvidenceSnapshot(
    input: {
      evidenceSnapshotId: string;
      contributorId: string;
      contributorContext: Prisma.InputJsonValue;
      evidence: Prisma.InputJsonValue;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.applicationEvidenceSnapshot.create({
      data: {
        id: input.evidenceSnapshotId,
        contributor_id: input.contributorId,
        contributor_context: input.contributorContext,
        evidence: input.evidence,
      },
    });
  }

  async createSubmittedApplication(
    input: {
      applicationId: string;
      contributionRequestId: string;
      contributorId: string;
      contributionApproach: string;
      proposedDeliveryDurationDays: number;
      requirementSnapshotId: string;
      evidenceSnapshotId: string;
      submittedAt: Date;
      reviewDueAt: Date;
      expiresAt: Date;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<ApplicationWithSnapshots> {
    return transaction.application.create({
      data: {
        id: input.applicationId,
        contribution_request_id: input.contributionRequestId,
        contributor_id: input.contributorId,
        contribution_approach: input.contributionApproach,
        proposed_delivery_duration_days: input.proposedDeliveryDurationDays,
        requirement_snapshot_id: input.requirementSnapshotId,
        evidence_snapshot_id: input.evidenceSnapshotId,
        status: ApplicationStatus.pending_owner_review,
        submitted_at: input.submittedAt,
        review_due_at: input.reviewDueAt,
        expires_at: input.expiresAt,
      },
      include: APPLICATION_INCLUDE,
    });
  }

  async createSubmittedAudit(
    input: {
      applicationId: string;
      actorId: string;
      idempotencyKey: string;
      commandFingerprint: string;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.applicationAudit.create({
      data: {
        application_id: input.applicationId,
        actor_id: input.actorId,
        action: ApplicationAuditAction.submitted,
        to_status: ApplicationStatus.pending_owner_review,
        idempotency_key: input.idempotencyKey,
        command_fingerprint: input.commandFingerprint,
        metadata: { payloadVersion: 1 },
      },
    });
  }

  async findOwnedApplication(
    input: { applicationId: string; contributorId: string },
    transaction: Prisma.TransactionClient,
  ): Promise<ApplicationWithSnapshots | null> {
    return transaction.application.findFirst({
      where: { id: input.applicationId, contributor_id: input.contributorId },
      include: APPLICATION_INCLUDE,
    });
  }

  async markWithdrawn(
    input: { applicationId: string; contributorId: string },
    transaction: Prisma.TransactionClient,
  ): Promise<Prisma.BatchPayload> {
    return transaction.application.updateMany({
      where: {
        id: input.applicationId,
        contributor_id: input.contributorId,
        status: ApplicationStatus.pending_owner_review,
      },
      data: { status: ApplicationStatus.withdrawn },
    });
  }

  async createWithdrawnAudit(
    input: {
      applicationId: string;
      actorId: string;
      idempotencyKey: string | null;
      commandFingerprint: string;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.applicationAudit.create({
      data: {
        application_id: input.applicationId,
        actor_id: input.actorId,
        action: ApplicationAuditAction.withdrawn,
        from_status: ApplicationStatus.pending_owner_review,
        to_status: ApplicationStatus.withdrawn,
        idempotency_key: input.idempotencyKey,
        command_fingerprint: input.commandFingerprint,
        metadata: { payloadVersion: 1 },
      },
    });
  }

  async findByIdOrThrow(
    applicationId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<ApplicationWithSnapshots> {
    return transaction.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: APPLICATION_INCLUDE,
    });
  }

  async findFirstById(
    applicationId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<ApplicationWithSnapshots | null> {
    return transaction.application.findFirst({
      where: { id: applicationId },
      include: APPLICATION_INCLUDE,
    });
  }

  async lockPendingApplicationsForUpdate(
    contributionRequestId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<Array<{ id: string; contributor_id: string }>> {
    return transaction.$queryRaw<Array<{ id: string; contributor_id: string }>>(
      Prisma.sql`
        SELECT "id", "contributor_id"
        FROM "Application"
        WHERE "contribution_request_id" = ${contributionRequestId}::uuid
          AND "status" = 'pending_owner_review'
        ORDER BY "id"
        FOR UPDATE
      `,
    );
  }

  async createOwnerDecision(
    input: {
      decisionId: string;
      applicationId: string;
      contributionRequestId: string;
      ownerId: string;
      decisionType: OwnerDecisionType;
      feedback: string | null;
      idempotencyKey: string;
      commandFingerprint: string;
      decidedAt: Date;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.ownerDecision.create({
      data: {
        id: input.decisionId,
        application_id: input.applicationId,
        contribution_request_id: input.contributionRequestId,
        owner_id: input.ownerId,
        decision_type: input.decisionType,
        feedback: input.feedback,
        idempotency_key: input.idempotencyKey,
        command_fingerprint: input.commandFingerprint,
        decided_at: input.decidedAt,
      },
    });
  }

  async markAccepted(
    input: { applicationId: string; reviewedAt: Date },
    transaction: Prisma.TransactionClient,
  ): Promise<Prisma.BatchPayload> {
    return transaction.application.updateMany({
      where: {
        id: input.applicationId,
        status: ApplicationStatus.pending_owner_review,
      },
      data: {
        status: ApplicationStatus.accepted,
        owner_reviewed_at: input.reviewedAt,
      },
    });
  }

  async createAssignment(
    input: {
      assignmentId: string;
      contributionRequestId: string;
      applicationId: string;
      ownerDecisionId: string;
      contributorId: string;
      agreedDeliveryDurationDays: number;
      agreedDeliveryDueAt: Date;
      assignedAt: Date;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.assignment.create({
      data: {
        id: input.assignmentId,
        contribution_request_id: input.contributionRequestId,
        application_id: input.applicationId,
        owner_decision_id: input.ownerDecisionId,
        contributor_id: input.contributorId,
        agreed_delivery_duration_days: input.agreedDeliveryDurationDays,
        agreed_delivery_due_at: input.agreedDeliveryDueAt,
        assigned_at: input.assignedAt,
      },
    });
  }

  async createAcceptedAudit(
    input: {
      applicationId: string;
      actorId: string;
      idempotencyKey: string;
      commandFingerprint: string;
      ownerDecisionId: string;
      assignmentId: string;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.applicationAudit.create({
      data: {
        application_id: input.applicationId,
        actor_id: input.actorId,
        action: ApplicationAuditAction.accepted,
        from_status: ApplicationStatus.pending_owner_review,
        to_status: ApplicationStatus.accepted,
        idempotency_key: input.idempotencyKey,
        command_fingerprint: input.commandFingerprint,
        metadata: {
          payloadVersion: 1,
          ownerDecisionId: input.ownerDecisionId,
          assignmentId: input.assignmentId,
        },
      },
    });
  }

  async closeSiblingsForDecision(
    input: { contributionRequestId: string; exceptApplicationId: string },
    transaction: Prisma.TransactionClient,
  ): Promise<Prisma.BatchPayload> {
    return transaction.application.updateMany({
      where: {
        contribution_request_id: input.contributionRequestId,
        id: { not: input.exceptApplicationId },
        status: ApplicationStatus.pending_owner_review,
      },
      data: { status: ApplicationStatus.not_selected },
    });
  }

  async createNotSelectedAudits(
    input: {
      siblings: Array<{ id: string; contributor_id: string }>;
      actorId: string;
      idempotencyKey: string;
      commandFingerprint: string;
      selectedApplicationId: string;
      ownerDecisionId: string;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.applicationAudit.createMany({
      data: input.siblings.map((sibling) => ({
        application_id: sibling.id,
        actor_id: input.actorId,
        action: ApplicationAuditAction.not_selected,
        from_status: ApplicationStatus.pending_owner_review,
        to_status: ApplicationStatus.not_selected,
        idempotency_key: `${input.idempotencyKey}:${sibling.id}`,
        command_fingerprint: input.commandFingerprint,
        metadata: {
          payloadVersion: 1,
          selectedApplicationId: input.selectedApplicationId,
          ownerDecisionId: input.ownerDecisionId,
        },
      })),
    });
  }

  async markDeclined(
    input: { applicationId: string; reviewedAt: Date },
    transaction: Prisma.TransactionClient,
  ): Promise<Prisma.BatchPayload> {
    return transaction.application.updateMany({
      where: {
        id: input.applicationId,
        status: ApplicationStatus.pending_owner_review,
      },
      data: {
        status: ApplicationStatus.declined_by_owner,
        owner_reviewed_at: input.reviewedAt,
      },
    });
  }

  async createDeclinedAudit(
    input: {
      applicationId: string;
      actorId: string;
      idempotencyKey: string;
      commandFingerprint: string;
      ownerDecisionId: string;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.applicationAudit.create({
      data: {
        application_id: input.applicationId,
        actor_id: input.actorId,
        action: ApplicationAuditAction.declined_by_owner,
        from_status: ApplicationStatus.pending_owner_review,
        to_status: ApplicationStatus.declined_by_owner,
        idempotency_key: input.idempotencyKey,
        command_fingerprint: input.commandFingerprint,
        metadata: { payloadVersion: 1, ownerDecisionId: input.ownerDecisionId },
      },
    });
  }

  async findDecisionByIdOrThrow(
    decisionId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<OwnerDecisionWithResult> {
    return transaction.ownerDecision.findUniqueOrThrow({
      where: { id: decisionId },
      include: OWNER_DECISION_INCLUDE,
    });
  }

  async lockPendingApplicationIdsForUpdate(
    contributionRequestId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<Array<{ id: string }>> {
    return transaction.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT "id"
        FROM "Application"
        WHERE "contribution_request_id" = ${contributionRequestId}::uuid
          AND "status" = ${ApplicationStatus.pending_owner_review}::"ApplicationStatus"
        ORDER BY "id"
        FOR UPDATE
      `,
    );
  }

  async markCancelledForRequest(
    input: { applicationIds: string[] },
    transaction: Prisma.TransactionClient,
  ): Promise<Prisma.BatchPayload> {
    return transaction.application.updateMany({
      where: {
        id: { in: input.applicationIds },
        status: ApplicationStatus.pending_owner_review,
      },
      data: { status: ApplicationStatus.request_cancelled },
    });
  }

  async createCancelledAudits(
    input: {
      applicationIds: string[];
      actorId: string;
      contributionRequestId: string;
      reason: string | null;
      correlationId: string;
      causationAuditId: string;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.applicationAudit.createMany({
      data: input.applicationIds.map((applicationId) => ({
        application_id: applicationId,
        actor_id: input.actorId,
        action: ApplicationAuditAction.request_cancelled,
        from_status: ApplicationStatus.pending_owner_review,
        to_status: ApplicationStatus.request_cancelled,
        metadata: {
          payloadVersion: 1,
          contributionRequestId: input.contributionRequestId,
          reason: input.reason,
          correlationId: input.correlationId,
          causation: {
            type: 'contribution_request_audit',
            id: input.causationAuditId,
          },
        },
      })),
    });
  }
}
