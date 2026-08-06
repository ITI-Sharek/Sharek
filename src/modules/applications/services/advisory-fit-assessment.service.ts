import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  ApplicationStatus,
  AssessmentAuditAction,
  AssessmentConfidence,
  AssessmentFindingKind,
  AssessmentRequestStatus,
  ContributionRequestRequirementKind,
  Prisma,
} from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import {
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';
import { ContributionTasksService } from '../../contribution-tasks/services/contribution-tasks.service';
import { AdvisoryFitAssessmentQueue } from '../jobs/advisory-fit-assessment.queue';
import {
  AdvisoryFitAssessmentDto,
  AssessmentFindingDto,
  AssessmentRequestStatusDto,
} from '../dto/advisory-fit-assessment.dto';

const APPLICATION_ASSESSMENT_INCLUDE = {
  requirementSnapshot: true,
  evidenceSnapshot: true,
} satisfies Prisma.ApplicationInclude;

const ASSESSMENT_REQUEST_INCLUDE = {
  attempts: {
    orderBy: { attempt_number: 'desc' },
    include: {
      advisoryFitAssessment: {
        include: {
          findings: { orderBy: { requirement_id: 'asc' } },
          presentation: true,
        },
      },
    },
  },
} satisfies Prisma.AssessmentRequestInclude;

type AssessmentApplication = Prisma.ApplicationGetPayload<{
  include: typeof APPLICATION_ASSESSMENT_INCLUDE;
}>;
type AssessmentRequestWithResults = Prisma.AssessmentRequestGetPayload<{
  include: typeof ASSESSMENT_REQUEST_INCLUDE;
}>;

const UUID4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PROVIDER_ATTEMPTS = 2;
const RETRYABLE_REQUEST_STATUSES = new Set<AssessmentRequestStatus>([
  AssessmentRequestStatus.not_started_system_limit,
  AssessmentRequestStatus.unavailable,
]);

@Injectable()
export class AdvisoryFitAssessmentService {
  private readonly logger = new Logger(AdvisoryFitAssessmentService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly contributionTasks: ContributionTasksService,
    private readonly queue: AdvisoryFitAssessmentQueue,
  ) {}

  async request(input: {
    actor: AuthenticatedUser;
    applicationId: string;
    idempotencyKey: string;
  }): Promise<AdvisoryFitAssessmentDto> {
    this.assertActiveOwner(input.actor);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const fingerprint = this.fingerprint({
      action: AssessmentAuditAction.requested,
      applicationId: input.applicationId,
    });

    let prepared: {
      application: AssessmentApplication;
      request: AssessmentRequestWithResults;
      replay: boolean;
    };
    try {
      prepared = await this.database.$transaction(async (transaction) => {
        const application = await transaction.application.findUnique({
          where: { id: input.applicationId },
          include: APPLICATION_ASSESSMENT_INCLUDE,
        });
        if (!application) throw this.applicationNotFound();

        await this.reconfirmOwner({
          requestId: application.contribution_request_id,
          ownerId: input.actor.id,
          transaction,
        });

        const directReplay = await transaction.assessmentRequest.findUnique({
          where: {
            owner_id_idempotency_key: {
              owner_id: input.actor.id,
              idempotency_key: idempotencyKey,
            },
          },
          include: ASSESSMENT_REQUEST_INCLUDE,
        });
        const replayAudit = directReplay
          ? null
          : await transaction.assessmentRequestAudit.findFirst({
              where: {
                actor_id: input.actor.id,
                action: AssessmentAuditAction.requested,
                idempotency_key: idempotencyKey,
              },
              orderBy: { created_at: 'desc' },
              include: {
                assessmentRequest: { include: ASSESSMENT_REQUEST_INCLUDE },
              },
            });
        const replay = directReplay ?? replayAudit?.assessmentRequest;
        if (replay) {
          if (
            replay.command_fingerprint !== fingerprint ||
            (replayAudit && replayAudit.command_fingerprint !== fingerprint)
          ) {
            throw new ConflictApplicationError(
              'Idempotency key was already used for another Assessment Request',
              'ASSESSMENT_IDEMPOTENCY_CONFLICT',
            );
          }
          return { application, request: replay, replay: true };
        }

        this.assertPendingApplication(application.status);
        const existing = await transaction.assessmentRequest.findFirst({
          where: { application_id: application.id },
          orderBy: { created_at: 'desc' },
          include: ASSESSMENT_REQUEST_INCLUDE,
        });
        if (
          existing &&
          !RETRYABLE_REQUEST_STATUSES.has(existing.status)
        ) {
          throw new ConflictApplicationError(
            'An Assessment Request is already active for this Application',
            'ASSESSMENT_ALREADY_ACTIVE',
          );
        }

        if (existing) {
          if (
            existing.status === AssessmentRequestStatus.unavailable &&
            existing.attempts.length >= MAX_PROVIDER_ATTEMPTS
          ) {
            throw new ConflictApplicationError(
              'The Assessment Request has exhausted its retry budget',
              'ASSESSMENT_RETRY_LIMIT_REACHED',
            );
          }
          const retryClaim = await transaction.assessmentRequest.updateMany({
            where: { id: existing.id, status: existing.status },
            data: {
              status: AssessmentRequestStatus.requested,
              completed_at: null,
            },
          });
          if (retryClaim.count !== 1) {
            throw new ConflictApplicationError(
              'The Assessment Request is already being retried',
              'ASSESSMENT_RETRY_IN_PROGRESS',
            );
          }
          await transaction.assessmentRequestAudit.create({
            data: {
              assessment_request_id: existing.id,
              actor_id: input.actor.id,
              action: AssessmentAuditAction.requested,
              from_status: existing.status,
              to_status: AssessmentRequestStatus.requested,
              idempotency_key: idempotencyKey,
              command_fingerprint: fingerprint,
              metadata: {
                payloadVersion: 1,
                retry: true,
                previousAttemptId: existing.attempts[0]?.id ?? null,
              },
            },
          });
          return {
            application,
            request: {
              ...existing,
              status: AssessmentRequestStatus.requested,
              completed_at: null,
            },
            replay: false,
          };
        }

        if (!application.requirement_snapshot_id || !application.evidence_snapshot_id) {
          throw new ConflictApplicationError(
            'The Application does not have fixed assessment snapshots',
            'ASSESSMENT_SNAPSHOT_NOT_AVAILABLE',
          );
        }

        const request = await transaction.assessmentRequest.create({
          data: {
            id: randomUUID(),
            application_id: application.id,
            contribution_request_id: application.contribution_request_id,
            owner_id: input.actor.id,
            requirement_snapshot_id: application.requirement_snapshot_id,
            evidence_snapshot_id: application.evidence_snapshot_id,
            status: AssessmentRequestStatus.requested,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
          },
          include: ASSESSMENT_REQUEST_INCLUDE,
        });
        await transaction.assessmentRequestAudit.create({
          data: {
            assessment_request_id: request.id,
            actor_id: input.actor.id,
            action: AssessmentAuditAction.requested,
            to_status: AssessmentRequestStatus.requested,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            metadata: { payloadVersion: 1 },
          },
        });
        return { application, request, replay: false };
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const concurrent = await this.database.assessmentRequest.findUnique({
        where: {
          owner_id_idempotency_key: {
            owner_id: input.actor.id,
            idempotency_key: idempotencyKey,
          },
        },
        include: ASSESSMENT_REQUEST_INCLUDE,
      });
      if (concurrent) {
        if (concurrent.command_fingerprint !== fingerprint) {
          throw new ConflictApplicationError(
            'Idempotency key was already used for another Assessment Request',
            'ASSESSMENT_IDEMPOTENCY_CONFLICT',
          );
        }
        return this.present(concurrent);
      }
      throw new ConflictApplicationError(
        'An Assessment Request is already active for this Application',
        'ASSESSMENT_ALREADY_ACTIVE',
      );
    }

    if (prepared.replay) return this.present(prepared.request);

    // Strictly after the transaction commits. Enqueueing inside it lets a
    // worker pick up a job for a row that is not visible yet. If this throws
    // the row is left in `requested` and the reaper releases it.
    await this.queue.enqueueAssessment({
      assessmentRequestId: prepared.request.id,
      attemptNumber: prepared.request.attempts.length + 1,
    });
    return this.present(prepared.request);
  }

  async getAssessment(
    actor: AuthenticatedUser,
    applicationId: string,
  ): Promise<AdvisoryFitAssessmentDto> {
    this.assertActiveOwner(actor);
    const application = await this.database.application.findUnique({
      where: { id: applicationId },
      select: { id: true, contribution_request_id: true },
    });
    if (!application) throw this.applicationNotFound();
    await this.contributionTasks.confirmOwnerDecisionActor({
      requestId: application.contribution_request_id,
      ownerId: actor.id,
    });

    const request = await this.database.assessmentRequest.findFirst({
      where: { application_id: applicationId },
      orderBy: { created_at: 'desc' },
      include: ASSESSMENT_REQUEST_INCLUDE,
    });
    if (!request) return this.notRequested(applicationId);
    if (request.status !== AssessmentRequestStatus.completed) {
      return this.present(request);
    }

    return this.present(request);
  }

  /**
   * Records the owner's first presentation of a completed assessment.
   *
   * This used to happen inside getAssessment, which made a read mutate state:
   * a prefetch, a retried request or a monitoring probe would stamp
   * `presented`. It matters more now that the read is the surface a client
   * polls while a request is still being processed — a poll must not claim the
   * owner has seen the result.
   *
   * At-most-once comes from AssessmentPresentation's unique index on
   * advisory_fit_assessment_id, not from the audit table: `presented` rows
   * leave attempt_number NULL, and the audit's unique index is NULLS DISTINCT,
   * so duplicates there would not collide.
   */
  async presentAssessment(
    actor: AuthenticatedUser,
    applicationId: string,
  ): Promise<AdvisoryFitAssessmentDto> {
    this.assertActiveOwner(actor);
    const application = await this.database.application.findUnique({
      where: { id: applicationId },
      select: { id: true, contribution_request_id: true },
    });
    if (!application) throw this.applicationNotFound();
    await this.contributionTasks.confirmOwnerDecisionActor({
      requestId: application.contribution_request_id,
      ownerId: actor.id,
    });

    const request = await this.database.assessmentRequest.findFirst({
      where: { application_id: applicationId },
      orderBy: { created_at: 'desc' },
      include: ASSESSMENT_REQUEST_INCLUDE,
    });
    if (!request) return this.notRequested(applicationId);
    if (request.status !== AssessmentRequestStatus.completed) {
      return this.present(request);
    }

    const assessment = request.attempts[0]?.advisoryFitAssessment;
    if (!assessment) return this.present(request);
    if (assessment.presentation) return this.present(request);

    const presentedAt = new Date();
    try {
      await this.database.$transaction(async (transaction) => {
        await transaction.assessmentPresentation.create({
          data: {
            id: randomUUID(),
            advisory_fit_assessment_id: assessment.id,
            owner_id: actor.id,
            presented_at: presentedAt,
          },
        });
        await transaction.assessmentRequestAudit.create({
          data: {
            assessment_request_id: request.id,
            actor_id: actor.id,
            action: AssessmentAuditAction.presented,
            to_status: AssessmentRequestStatus.completed,
            metadata: { payloadVersion: 1, assessmentId: assessment.id },
          },
        });
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const presentation = await this.database.assessmentPresentation.findUnique({
        where: { advisory_fit_assessment_id: assessment.id },
      });
      return this.present(request, presentation?.presented_at ?? null);
    }
    return this.present(request, presentedAt);
  }





  private present(
    request: AssessmentRequestWithResults | Prisma.AssessmentRequestGetPayload<Record<string, never>>,
    presentedAtOverride: Date | null = null,
  ): AdvisoryFitAssessmentDto {
    const attempt = 'attempts' in request ? request.attempts[0] : undefined;
    const assessment = attempt?.advisoryFitAssessment;
    const status = request.status as AssessmentRequestStatus;
    const attempts = 'attempts' in request ? request.attempts.length : 0;
    return {
      id: request.id,
      applicationId: request.application_id,
      requestStatus: this.presentRequestStatus(status),
      fitBand: assessment?.fit_band
        ? (assessment.fit_band.toUpperCase() as AdvisoryFitAssessmentDto['fitBand'])
        : status === AssessmentRequestStatus.unavailable
          ? 'UNAVAILABLE'
          : null,
      findings: assessment?.findings?.map((finding) => this.presentFinding(finding)) ?? [],
      presentedAt: assessment?.presentation?.presented_at ?? presentedAtOverride,
      requestedAt: request.requested_at,
      completedAt: request.completed_at,
      attempts,
      retryAvailable: this.isRetryAvailable(status, attempts),
    };
  }


  private notRequested(applicationId: string): AdvisoryFitAssessmentDto {
    return {
      id: null,
      applicationId,
      requestStatus: 'NOT_REQUESTED',
      fitBand: null,
      findings: [],
      presentedAt: null,
      requestedAt: null,
      completedAt: null,
      attempts: 0,
      retryAvailable: false,
    };
  }

  private presentFinding(finding: ValidatedFinding | Prisma.AssessmentFindingGetPayload<Record<string, never>>): AssessmentFindingDto {
    const persisted = 'requirement_id' in finding;
    return {
      requirementId: persisted ? finding.requirement_id : finding.requirementId,
      requirementKind: (persisted ? finding.requirement_kind : finding.requirementKind).toUpperCase() as 'REQUIRED' | 'PREFERRED',
      finding: finding.finding.toUpperCase() as AssessmentFindingDto['finding'],
      confidence: finding.confidence.toUpperCase() as AssessmentFindingDto['confidence'],
      citations: this.jsonStringArray(finding.citations),
      uncertainty: this.jsonStringArray(finding.uncertainty),
      explanation: finding.explanation,
    };
  }

  private presentRequestStatus(status: AssessmentRequestStatus): AssessmentRequestStatusDto {
    return status.toUpperCase() as AssessmentRequestStatusDto;
  }

  private isRetryAvailable(
    status: AssessmentRequestStatus,
    attempts: number,
  ): boolean {
    return (
      status === AssessmentRequestStatus.not_started_system_limit ||
      (status === AssessmentRequestStatus.unavailable &&
        attempts < MAX_PROVIDER_ATTEMPTS)
    );
  }

  private assertPendingApplication(status: ApplicationStatus): void {
    if (status !== ApplicationStatus.pending_owner_review) {
      throw new ConflictApplicationError(
        'Only a pending Application can receive an Assessment Request',
        'APPLICATION_TERMINAL',
        { status },
      );
    }
  }

  private assertActiveOwner(actor: AuthenticatedUser): void {
    if (actor.role !== 'owner' || actor.status === 'suspended' || actor.status === 'deactivated') {
      throw new ForbiddenApplicationError(
        'Only an active Project owner can request an Advisory Fit Assessment',
        'APPLICATION_NOT_AUTHORIZED',
      );
    }
  }

  private async reconfirmOwner(input: {
    requestId: string;
    ownerId: string;
    transaction: Prisma.TransactionClient;
  }): Promise<void> {
    await this.contributionTasks.reconfirmOwnerDecisionActor(input);
  }

  private normalizeIdempotencyKey(value: string): string {
    if (typeof value !== 'string' || !UUID4_PATTERN.test(value)) {
      throw new ConflictApplicationError(
        'A UUID idempotency key is required for an Assessment Request',
        'ASSESSMENT_IDEMPOTENCY_KEY_REQUIRED',
      );
    }
    return value;
  }

  private applicationNotFound(): NotFoundApplicationError {
    return new NotFoundApplicationError(
      'Application was not found',
      'APPLICATION_NOT_FOUND',
    );
  }



  private jsonStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }



  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }



  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}

type ValidatedFinding = {
  requirementId: string;
  requirementKind: ContributionRequestRequirementKind;
  finding: AssessmentFindingKind;
  confidence: AssessmentConfidence;
  citations: string[];
  uncertainty: string[];
  explanation: string;
};
