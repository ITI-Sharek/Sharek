import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  AdvisoryFitBand,
  ApplicationStatus,
  AssessmentAuditAction,
  AssessmentAttemptStatus,
  AssessmentConfidence,
  AssessmentFindingKind,
  AssessmentRequestStatus,
  ContributionRequestRequirementKind,
  Prisma,
} from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import {
  ApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';
import { AiService } from '../../ai/ai.service';
import {
  AdvisoryFitAssessmentResult,
  AdvisoryFitFinding,
} from '../../ai/dto/advisory-fit-assessment.dto';
import { ContributionTasksService } from '../../contribution-tasks/services/contribution-tasks.service';
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
  constructor(
    private readonly database: DatabaseService,
    private readonly contributionTasks: ContributionTasksService,
    private readonly ai: AiService,
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
    return this.process(prepared.request, prepared.application, input.actor.id);
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

    const assessment = request.attempts[0]?.advisoryFitAssessment;
    if (!assessment) return this.present(request);
    if (!request.attempts[0]?.advisoryFitAssessment?.presentation) {
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
    return this.present(request);
  }

  private async process(
    request: AssessmentRequestWithResults,
    application: AssessmentApplication,
    actorId: string,
  ): Promise<AdvisoryFitAssessmentDto> {
    const attemptNumber = request.attempts.length + 1;
    const previousAttemptId = request.attempts[0]?.id ?? null;
    const attemptStartedAt = new Date();
    const currentApplication = await this.database.application.findUnique({
      where: { id: application.id },
      select: { status: true },
    });
    if (!currentApplication) throw this.applicationNotFound();
    if (currentApplication.status !== ApplicationStatus.pending_owner_review) {
      await this.finishWithoutAttempt({
        requestId: request.id,
        actorId,
        status: AssessmentRequestStatus.cancelled_not_needed,
        action: AssessmentAuditAction.cancelled_not_needed,
      });
      return this.presentStatusOnly(
        request,
        AssessmentRequestStatus.cancelled_not_needed,
      );
    }

    const requirements = this.jsonArray(application.requirementSnapshot?.requirements);
    const evidence = this.jsonArray(application.evidenceSnapshot?.evidence);
    const allowedEvidenceIds = this.readEvidenceIds(evidence);
    if (allowedEvidenceIds.length === 0) {
      await this.finishWithoutAttempt({
        requestId: request.id,
        actorId,
        status: AssessmentRequestStatus.not_started_no_assessable_evidence,
        action: AssessmentAuditAction.not_started_no_assessable_evidence,
      });
      return this.presentStatusOnly(
        request,
        AssessmentRequestStatus.not_started_no_assessable_evidence,
      );
    }

    let providerResult: AdvisoryFitAssessmentResult;
    try {
      providerResult = await this.ai.requestAdvisoryFit({
        assessmentRequestId: request.id,
        requirements,
        evidence,
        allowedEvidenceIds,
        requestedAt: request.requested_at.toISOString(),
        contractVersion: 'advisory-fit-v1',
      });
    } catch (error) {
      return this.persistUnavailable({
        request,
        actorId,
        errorCode: this.safeErrorCode(error),
        attemptNumber,
        previousAttemptId,
        startedAt: attemptStartedAt,
      });
    }

    if (providerResult.kind === 'system_limit') {
      await this.finishWithoutAttempt({
        requestId: request.id,
        actorId,
        status: AssessmentRequestStatus.not_started_system_limit,
        action: AssessmentAuditAction.not_started_system_limit,
      });
      return this.presentStatusOnly(request, AssessmentRequestStatus.not_started_system_limit);
    }
    if (providerResult.kind === 'no_assessable_evidence') {
      await this.finishWithoutAttempt({
        requestId: request.id,
        actorId,
        status: AssessmentRequestStatus.not_started_no_assessable_evidence,
        action: AssessmentAuditAction.not_started_no_assessable_evidence,
      });
      return this.presentStatusOnly(
        request,
        AssessmentRequestStatus.not_started_no_assessable_evidence,
      );
    }

    let findings: ValidatedFinding[];
    try {
      findings = this.validateFindings(
        requirements,
        providerResult.findings,
        new Set(allowedEvidenceIds),
      );
    } catch {
      return this.persistUnavailable({
        request,
        actorId,
        errorCode: 'AI_ADVISORY_FIT_RESPONSE_INVALID',
        providerResult,
        attemptNumber,
        previousAttemptId,
        startedAt: attemptStartedAt,
      });
    }

    const fitBand = this.deriveFitBand(findings);
    const attemptId = randomUUID();
    const assessmentId = randomUUID();
    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      await transaction.assessmentAttempt.create({
        data: {
          id: attemptId,
          assessment_request_id: request.id,
          retry_of_attempt_id: previousAttemptId,
          attempt_number: attemptNumber,
          status: AssessmentAttemptStatus.completed,
          provider: providerResult.provider,
          model: providerResult.model,
          prompt_version: providerResult.promptVersion,
          schema_version: providerResult.schemaVersion,
          service_version: providerResult.serviceVersion,
          latency_ms: providerResult.latencyMs,
          input_tokens: providerResult.inputTokens,
          output_tokens: providerResult.outputTokens,
          started_at: attemptStartedAt,
          completed_at: now,
        },
      });
      await transaction.advisoryFitAssessment.create({
        data: {
          id: assessmentId,
          assessment_attempt_id: attemptId,
          fit_band: fitBand,
        },
      });
      await transaction.assessmentFinding.createMany({
        data: findings.map((finding) => ({
          id: randomUUID(),
          advisory_fit_assessment_id: assessmentId,
          requirement_id: finding.requirementId,
          requirement_kind: finding.requirementKind,
          finding: finding.finding,
          confidence: finding.confidence,
          citations: finding.citations as unknown as Prisma.InputJsonValue,
          uncertainty: finding.uncertainty as unknown as Prisma.InputJsonValue,
          explanation: finding.explanation,
        })),
      });
      await transaction.assessmentRequest.update({
        where: { id: request.id },
        data: {
          status: AssessmentRequestStatus.completed,
          completed_at: now,
        },
      });
      await transaction.assessmentRequestAudit.create({
        data: {
          assessment_request_id: request.id,
          actor_id: actorId,
          action: AssessmentAuditAction.attempt_completed,
          from_status: AssessmentRequestStatus.requested,
          to_status: AssessmentRequestStatus.completed,
          attempt_number: attemptNumber,
          metadata: {
            payloadVersion: 1,
            assessmentId,
            fitBand,
            retryOfAttemptId: previousAttemptId,
            ...this.safeProviderMetadata(providerResult),
          },
        },
      });
    });

    return {
      id: request.id,
      applicationId: request.application_id,
      requestStatus: 'COMPLETED',
      fitBand: fitBand.toUpperCase() as AdvisoryFitAssessmentDto['fitBand'],
      findings: findings.map((finding) => this.presentFinding(finding)),
      presentedAt: null,
      requestedAt: request.requested_at,
      completedAt: now,
      attempts: attemptNumber,
      retryAvailable: false,
    };
  }

  private async persistUnavailable(
    input: {
      request: AssessmentRequestWithResults;
      actorId: string;
      errorCode: string;
      providerResult?: Extract<AdvisoryFitAssessmentResult, { kind: 'completed' }>;
      attemptNumber: number;
      previousAttemptId: string | null;
      startedAt: Date;
    },
  ): Promise<AdvisoryFitAssessmentDto> {
    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      await transaction.assessmentAttempt.create({
        data: {
          id: randomUUID(),
          assessment_request_id: input.request.id,
          retry_of_attempt_id: input.previousAttemptId,
          attempt_number: input.attemptNumber,
          status: AssessmentAttemptStatus.failed,
          provider: input.providerResult?.provider,
          model: input.providerResult?.model,
          prompt_version: input.providerResult?.promptVersion,
          schema_version: input.providerResult?.schemaVersion,
          service_version: input.providerResult?.serviceVersion,
          latency_ms: input.providerResult?.latencyMs,
          input_tokens: input.providerResult?.inputTokens,
          output_tokens: input.providerResult?.outputTokens,
          error_code: input.errorCode,
          started_at: input.startedAt,
          completed_at: now,
        },
      });
      await transaction.assessmentRequest.update({
        where: { id: input.request.id },
        data: {
          status: AssessmentRequestStatus.unavailable,
          completed_at: now,
        },
      });
      await transaction.assessmentRequestAudit.create({
        data: {
          assessment_request_id: input.request.id,
          actor_id: input.actorId,
          action: AssessmentAuditAction.attempt_failed,
          from_status: AssessmentRequestStatus.requested,
          to_status: AssessmentRequestStatus.unavailable,
          attempt_number: input.attemptNumber,
          metadata: {
            payloadVersion: 1,
            errorCode: input.errorCode,
            retryOfAttemptId: input.previousAttemptId,
            ...this.safeProviderMetadata(input.providerResult),
          },
        },
      });
      await transaction.assessmentRequestAudit.create({
        data: {
          assessment_request_id: input.request.id,
          actor_id: input.actorId,
          action: AssessmentAuditAction.unavailable,
          from_status: AssessmentRequestStatus.requested,
          to_status: AssessmentRequestStatus.unavailable,
          attempt_number: input.attemptNumber,
          metadata: {
            payloadVersion: 1,
            errorCode: input.errorCode,
            retryOfAttemptId: input.previousAttemptId,
          },
        },
      });
    });
    return this.presentStatusOnly(
      input.request,
      AssessmentRequestStatus.unavailable,
      now,
      input.attemptNumber,
    );
  }

  private async finishWithoutAttempt(input: {
    requestId: string;
    actorId: string;
    status: AssessmentRequestStatus;
    action: AssessmentAuditAction;
  }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await transaction.assessmentRequest.update({
        where: { id: input.requestId },
        data: {
          status: input.status,
          completed_at:
            input.status === AssessmentRequestStatus.not_started_system_limit
              ? null
              : new Date(),
        },
      });
      await transaction.assessmentRequestAudit.create({
        data: {
          assessment_request_id: input.requestId,
          actor_id: input.actorId,
          action: input.action,
          from_status: AssessmentRequestStatus.requested,
          to_status: input.status,
          metadata: { payloadVersion: 1 },
        },
      });
    });
  }

  private validateFindings(
    requirements: unknown[],
    findings: AdvisoryFitFinding[],
    allowedEvidenceIds: Set<string>,
  ): ValidatedFinding[] {
    const requirementMap = new Map<string, { id: string; kind: string }>();
    for (const value of requirements) {
      const requirement = this.jsonObject(value);
      if (
        typeof requirement.id !== 'string' ||
        !requirement.id ||
        (requirement.kind !== 'required' && requirement.kind !== 'preferred')
      ) {
        throw new ApplicationError('Assessment requirements are invalid');
      }
      requirementMap.set(requirement.id, {
        id: requirement.id,
        kind: requirement.kind,
      });
    }
    if (
      requirementMap.size !== requirements.length ||
      findings.length !== requirements.length
    ) {
      throw new ApplicationError('Assessment findings are incomplete');
    }

    const seen = new Set<string>();
    return findings.map((finding) => {
      const requirement = requirementMap.get(finding.requirementId);
      const validFinding =
        finding.finding === 'SUPPORTED' ||
        finding.finding === 'PARTIALLY_SUPPORTED' ||
        finding.finding === 'NOT_EVIDENCED' ||
        finding.finding === 'INCONCLUSIVE';
      const validConfidence =
        finding.confidence === 'HIGH' ||
        finding.confidence === 'MEDIUM' ||
        finding.confidence === 'LOW';
      if (
        typeof finding.requirementId !== 'string' ||
        !requirement ||
        seen.has(finding.requirementId) ||
        finding.requirementKind !== requirement.kind ||
        !validFinding ||
        !validConfidence ||
        !Array.isArray(finding.citations) ||
        !finding.citations.length ||
        finding.citations.some((citation) => typeof citation !== 'string') ||
        finding.citations.some((citation) => !allowedEvidenceIds.has(citation)) ||
        !Array.isArray(finding.uncertainty) ||
        finding.uncertainty.some((item) => typeof item !== 'string') ||
        typeof finding.explanation !== 'string' ||
        !finding.explanation.trim() ||
        finding.explanation.trim().length > 2000
      ) {
        throw new ApplicationError('Assessment findings are invalid');
      }
      seen.add(finding.requirementId);
      return {
        requirementId: finding.requirementId,
        requirementKind: requirement.kind as ContributionRequestRequirementKind,
        finding: finding.finding.toLowerCase() as AssessmentFindingKind,
        confidence: finding.confidence.toLowerCase() as AssessmentConfidence,
        citations: Array.from(new Set(finding.citations)),
        uncertainty: finding.uncertainty,
        explanation: finding.explanation.trim(),
      };
    });
  }

  private deriveFitBand(findings: ValidatedFinding[]): AdvisoryFitBand {
    const required = findings.filter(
      (finding) => finding.requirementKind === ContributionRequestRequirementKind.required,
    );
    if (required.length === 0) return AdvisoryFitBand.unknown;
    if (required.every((finding) => finding.finding === AssessmentFindingKind.supported)) {
      return AdvisoryFitBand.strong;
    }
    if (
      required.some(
        (finding) =>
          finding.finding === AssessmentFindingKind.supported ||
          finding.finding === AssessmentFindingKind.partially_supported,
      )
    ) {
      return AdvisoryFitBand.partial;
    }
    if (required.every((finding) => finding.finding === AssessmentFindingKind.not_evidenced)) {
      return AdvisoryFitBand.limited;
    }
    return AdvisoryFitBand.unknown;
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

  private presentStatusOnly(
    request: Prisma.AssessmentRequestGetPayload<Record<string, never>>,
    status: AssessmentRequestStatus,
    completedAt: Date | null = null,
    attempts = 0,
  ): AdvisoryFitAssessmentDto {
    return {
      id: request.id,
      applicationId: request.application_id,
      requestStatus: this.presentRequestStatus(status),
      fitBand: status === AssessmentRequestStatus.unavailable ? 'UNAVAILABLE' : null,
      findings: [],
      presentedAt: null,
      requestedAt: request.requested_at,
      completedAt,
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

  private jsonArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private jsonObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private jsonStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private readEvidenceIds(evidence: unknown[]): string[] {
    const ids = new Set<string>();
    for (const item of evidence) {
      const record = this.jsonObject(item);
      for (const key of ['id', 'evidenceId']) {
        if (typeof record[key] === 'string' && record[key].trim()) ids.add(record[key]);
      }
      const sources = this.jsonObject(record.evidenceSources);
      const sourceIds = this.jsonArray(sources.evidenceIds);
      for (const id of sourceIds) if (typeof id === 'string' && id.trim()) ids.add(id);
    }
    return Array.from(ids).sort();
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private safeErrorCode(error: unknown): string {
    const code =
      error instanceof ApplicationError
        ? error.code
        : 'AI_ADVISORY_FIT_SERVICE_UNAVAILABLE';
    return /^[A-Z0-9_]{1,100}$/.test(code)
      ? code
      : 'AI_ADVISORY_FIT_SERVICE_UNAVAILABLE';
  }

  private safeProviderMetadata(
    result?: Extract<AdvisoryFitAssessmentResult, { kind: 'completed' }>,
  ): Record<string, unknown> {
    if (!result) return {};
    return {
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
      schemaVersion: result.schemaVersion,
      serviceVersion: result.serviceVersion,
      ...(result.latencyMs === undefined ? {} : { latencyMs: result.latencyMs }),
      ...(result.inputTokens === undefined ? {} : { inputTokens: result.inputTokens }),
      ...(result.outputTokens === undefined ? {} : { outputTokens: result.outputTokens }),
    };
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
