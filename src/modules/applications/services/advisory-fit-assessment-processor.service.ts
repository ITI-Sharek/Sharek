import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
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

import { DatabaseService } from '../../../shared/database/database.service';
import { ApplicationError } from '../../../shared/errors/application.error';
import { AiService } from '../../ai/ai.service';
import {
  AdvisoryFitAssessmentResult,
  AdvisoryFitEvidenceCapsule,
  AdvisoryFitFinding,
  AdvisoryFitRequirementSnapshot,
} from '../../ai/dto/advisory-fit-assessment.dto';
import {
  APPLICATION_ASSESSMENT_INCLUDE,
  ASSESSMENT_REQUEST_INCLUDE,
  AssessmentRequestWithResults,
  jsonStringArray,
} from './advisory-fit-assessment.shared';

type ValidatedFinding = {
  requirementId: string;
  requirementKind: ContributionRequestRequirementKind;
  finding: AssessmentFindingKind;
  confidence: AssessmentConfidence;
  citations: string[];
  uncertainty: string[];
  explanation: string;
};

export type AdvisoryFitProcessOutcome =
  | { outcome: AssessmentRequestStatus; attemptNumber: number | null }
  | { outcome: 'superseded' };

/**
 * Thrown when a conditional claim finds the request is no longer `requested`,
 * meaning the reaper or a duplicate delivery already finished it. Rolls the
 * enclosing transaction back and is swallowed by `process`; it is never an
 * infrastructure failure and must not reach the worker.
 */
class AssessmentRequestSuperseded extends Error {
  constructor(readonly requestId: string) {
    super(`Assessment request ${requestId} is no longer requested`);
  }
}

/**
 * Fulfils an Assessment Request on a worker: calls the provider, validates the
 * response, and writes exactly one terminal outcome.
 *
 * Separate from the command service on purpose. It needs only the database and
 * the AI client — no ContributionTasksService, so no forwardRef reaches the
 * worker — and keeping the two lifecycles behind one class is what made the
 * original spec file fragile.
 */
@Injectable()
export class AdvisoryFitAssessmentProcessorService {
  private readonly logger = new Logger(
    AdvisoryFitAssessmentProcessorService.name,
  );

  constructor(
    private readonly database: DatabaseService,
    private readonly ai: AiService,
  ) {}

  /**
   * Only infrastructure failures escape this method. Everything the provider
   * does — refusing, timing out, answering badly — is a persisted domain
   * outcome, because the queue's retry budget and the provider attempt budget
   * are different things: rethrowing a provider failure would let BullMQ write
   * three attempt rows against a two-attempt limit and collide on the
   * (request, attempt_number) unique index.
   */
  async process(
    assessmentRequestId: string,
    attemptNumber: number,
  ): Promise<AdvisoryFitProcessOutcome> {
    const request = await this.database.assessmentRequest.findUnique({
      where: { id: assessmentRequestId },
      include: ASSESSMENT_REQUEST_INCLUDE,
    });
    if (!request) {
      this.logger.warn(
        `Assessment request ${assessmentRequestId} no longer exists; nothing to process`,
      );
      return { outcome: 'superseded' };
    }
    if (request.status !== AssessmentRequestStatus.requested) {
      return { outcome: 'superseded' };
    }
    if (request.attempts.some((a) => a.attempt_number === attemptNumber)) {
      // Duplicate delivery of an attempt that already ran.
      return { outcome: 'superseded' };
    }

    try {
      return await this.run(request, attemptNumber);
    } catch (error) {
      if (error instanceof AssessmentRequestSuperseded) {
        this.logger.warn(
          `Assessment request ${request.id} was finished by another actor mid-flight; discarding this attempt`,
        );
        return { outcome: 'superseded' };
      }
      throw error;
    }
  }

  private async run(
    request: AssessmentRequestWithResults,
    attemptNumber: number,
  ): Promise<AdvisoryFitProcessOutcome> {
    const actorId = request.owner_id;
    const previousAttemptId = request.attempts[0]?.id ?? null;
    const attemptStartedAt = new Date();

    const application = await this.database.application.findUnique({
      where: { id: request.application_id },
      include: APPLICATION_ASSESSMENT_INCLUDE,
    });
    if (!application) {
      this.logger.error(
        `Assessment request ${request.id} references missing Application ${request.application_id}`,
      );
      return { outcome: 'superseded' };
    }
    if (application.status !== ApplicationStatus.pending_owner_review) {
      await this.finishWithoutAttempt({
        requestId: request.id,
        actorId,
        status: AssessmentRequestStatus.cancelled_not_needed,
        action: AssessmentAuditAction.cancelled_not_needed,
      });
      return {
        outcome: AssessmentRequestStatus.cancelled_not_needed,
        attemptNumber: null,
      };
    }

    const requirements = this.jsonArray(
      application.requirementSnapshot?.requirements,
    ) as AdvisoryFitRequirementSnapshot[];
    const evidence = this.buildEvidenceCapsules(
      this.jsonArray(application.evidenceSnapshot?.evidence),
    );
    const allowedEvidenceIds = evidence.map((item) => item.evidenceId);
    if (allowedEvidenceIds.length === 0) {
      await this.finishWithoutAttempt({
        requestId: request.id,
        actorId,
        status: AssessmentRequestStatus.not_started_no_assessable_evidence,
        action: AssessmentAuditAction.not_started_no_assessable_evidence,
      });
      return {
        outcome: AssessmentRequestStatus.not_started_no_assessable_evidence,
        attemptNumber: null,
      };
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
      const errorCode = this.safeErrorCode(error);
      this.logger.error(
        `Advisory Fit provider call failed for assessment request ${request.id} (${errorCode})`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.persistUnavailable({
        request,
        actorId,
        errorCode,
        attemptNumber,
        previousAttemptId,
        startedAt: attemptStartedAt,
      });
      return { outcome: AssessmentRequestStatus.unavailable, attemptNumber };
    }

    if (providerResult.kind === 'system_limit') {
      await this.finishWithoutAttempt({
        requestId: request.id,
        actorId,
        status: AssessmentRequestStatus.not_started_system_limit,
        action: AssessmentAuditAction.not_started_system_limit,
      });
      return {
        outcome: AssessmentRequestStatus.not_started_system_limit,
        attemptNumber: null,
      };
    }
    if (providerResult.kind === 'no_assessable_evidence') {
      await this.finishWithoutAttempt({
        requestId: request.id,
        actorId,
        status: AssessmentRequestStatus.not_started_no_assessable_evidence,
        action: AssessmentAuditAction.not_started_no_assessable_evidence,
      });
      return {
        outcome: AssessmentRequestStatus.not_started_no_assessable_evidence,
        attemptNumber: null,
      };
    }

    let findings: ValidatedFinding[];
    try {
      findings = this.validateFindings(
        requirements,
        providerResult.findings,
        new Set(allowedEvidenceIds),
      );
    } catch (error) {
      const errorCode = this.safeErrorCode(error);
      this.logger.error(
        `Advisory Fit findings rejected for assessment request ${request.id} (${errorCode})`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.persistUnavailable({
        request,
        actorId,
        errorCode,
        providerResult,
        attemptNumber,
        previousAttemptId,
        startedAt: attemptStartedAt,
      });
      return { outcome: AssessmentRequestStatus.unavailable, attemptNumber };
    }

    const fitBand = this.deriveFitBand(findings);
    const attemptId = randomUUID();
    const assessmentId = randomUUID();
    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      await this.claim(
        transaction,
        request.id,
        AssessmentRequestStatus.completed,
        now,
      );
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

    return { outcome: AssessmentRequestStatus.completed, attemptNumber };
  }

  /**
   * Conditional status claim, and the first statement of every terminal
   * transaction. The audit table's unique index is NULLS DISTINCT and the
   * no-attempt paths leave attempt_number NULL, so P2002 protects nothing here
   * — this guard is the only thing stopping a reaper race from writing a second
   * attempt and a duplicate pair of audit rows.
   */
  private async claim(
    transaction: Prisma.TransactionClient,
    requestId: string,
    status: AssessmentRequestStatus,
    completedAt: Date | null,
  ): Promise<void> {
    const claimed = await transaction.assessmentRequest.updateMany({
      where: { id: requestId, status: AssessmentRequestStatus.requested },
      data: { status, completed_at: completedAt },
    });
    if (claimed.count !== 1) throw new AssessmentRequestSuperseded(requestId);
  }

  private async persistUnavailable(input: {
    request: AssessmentRequestWithResults;
    actorId: string;
    errorCode: string;
    providerResult?: Extract<AdvisoryFitAssessmentResult, { kind: 'completed' }>;
    attemptNumber: number;
    previousAttemptId: string | null;
    startedAt: Date;
  }): Promise<void> {
    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      await this.claim(
        transaction,
        input.request.id,
        AssessmentRequestStatus.unavailable,
        now,
      );
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
  }

  private async finishWithoutAttempt(input: {
    requestId: string;
    actorId: string;
    status: AssessmentRequestStatus;
    action: AssessmentAuditAction;
  }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await this.claim(
        transaction,
        input.requestId,
        input.status,
        input.status === AssessmentRequestStatus.not_started_system_limit
          ? null
          : new Date(),
      );
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
        throw new ApplicationError(
          'Assessment requirements are invalid',
          'ASSESSMENT_REQUIREMENT_SNAPSHOT_INVALID',
        );
      }
      requirementMap.set(requirement.id, {
        id: requirement.id,
        kind: requirement.kind,
      });
    }
    // These two conditions were one throw, but they blame different parties:
    // a collapsed Map means duplicate requirement ids in our own snapshot,
    // while a findings/requirements count mismatch is the provider failing to
    // cover what we sent.
    if (requirementMap.size !== requirements.length) {
      throw new ApplicationError(
        'Assessment requirement snapshot contains duplicate identifiers',
        'ASSESSMENT_REQUIREMENT_SNAPSHOT_INVALID',
      );
    }
    if (findings.length !== requirements.length) {
      throw new ApplicationError(
        'Assessment findings are incomplete',
        'AI_ADVISORY_FIT_COVERAGE_INCOMPLETE',
      );
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
        throw new ApplicationError(
          'Assessment findings are invalid',
          'AI_ADVISORY_FIT_RESPONSE_INVALID',
        );
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

  private jsonArray(value: Prisma.JsonValue | undefined): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private jsonObject(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private buildEvidenceCapsules(
    evidence: unknown[],
  ): AdvisoryFitEvidenceCapsule[] {
    const capsules = new Map<string, AdvisoryFitEvidenceCapsule>();
    for (const entry of evidence) {
      const record = this.jsonObject(entry);
      const sources = this.jsonObject(record.evidenceSources);
      const evidenceIds = jsonStringArray(
        sources.evidenceIds as Prisma.JsonValue,
      );
      const label = this.boundedSnapshotText(record.name);
      for (const evidenceId of evidenceIds) {
        if (!evidenceId || capsules.has(evidenceId)) continue;
        capsules.set(evidenceId, {
          evidenceId,
          type: 'approved_skill',
          label,
          summary: label,
        });
      }
    }
    return [...capsules.values()];
  }

  private boundedSnapshotText(value: unknown): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return trimmed.length > 200 ? `${trimmed.slice(0, 197)}...` : trimmed;
  }

  private safeErrorCode(error: unknown): string {
    const code =
      error instanceof ApplicationError
        ? error.code
        : 'AI_ADVISORY_FIT_SERVICE_UNAVAILABLE';
    if (/^[A-Z0-9_]{1,100}$/.test(code)) return code;
    // Falling back here means the real cause is about to be recorded as
    // "the provider was unavailable", which is how an internal fault gets
    // misattributed. Leave a trace before that happens.
    this.logger.error(
      `Unclassified Advisory Fit failure recorded as AI_ADVISORY_FIT_SERVICE_UNAVAILABLE (raw code ${JSON.stringify(code)})`,
      error instanceof Error ? error.stack : String(error),
    );
    return 'AI_ADVISORY_FIT_SERVICE_UNAVAILABLE';
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
    };
  }
}
