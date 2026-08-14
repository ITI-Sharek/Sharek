import { Injectable, Logger } from '@nestjs/common';
import {
  ContributionRequestSkillInferenceStatus,
  ContributionRequestSkillRequirementSource,
  ContributionRequestStatus,
  Prisma,
} from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { normalizeSkillName } from '../../../shared/skills/skill-name';
import { AiService } from '../../ai/ai.service';
import { RequirementInferenceResult } from '../../ai/dto/requirement-inference.dto';

/** A draft with less than this much text cannot support a useful inference. */
const MIN_DESCRIPTION_LENGTH = 40;

@Injectable()
export class RequirementInferenceProcessorService {
  private readonly logger = new Logger(RequirementInferenceProcessorService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly ai: AiService,
  ) {}

  /**
   * Whether a draft carries enough content to be worth a provider call.
   *
   * A one-line description produces a bar the owner will delete anyway, and
   * every wasted call is real money. Kept as a pure predicate so the enqueue
   * decision is testable without a queue.
   */
  static hasEnoughContent(draft: {
    description: string;
    requirementTexts: string[];
    technologyTags: string[];
  }): boolean {
    return (
      draft.description.trim().length >= MIN_DESCRIPTION_LENGTH &&
      (draft.requirementTexts.length > 0 || draft.technologyTags.length > 0)
    );
  }

  /**
   * Run inference for one draft and persist the result.
   *
   * Never throws for a provider outcome. The worker's retry budget and the
   * meaning of "this draft has no bar yet" are different things: a failure is
   * recorded as a retriable status the owner can see and act on, and the draft
   * stays editable. Only an unexpected infrastructure fault propagates.
   */
  async process(contributionRequestId: string, requestedAt: Date): Promise<void> {
    const draft = await this.database.contributionRequest.findUnique({
      where: { id: contributionRequestId },
      include: { requirements: { orderBy: [{ kind: 'asc' }, { position: 'asc' }] } },
    });

    // Not an error. A draft can be published, discarded, or deleted while its
    // job sits in the queue, and inferring a bar for a Request that is already
    // frozen would be exactly the retroactive change ADR 0015 forbids.
    if (!draft || draft.status !== ContributionRequestStatus.draft) return;
    if (draft.updated_at.getTime() > requestedAt.getTime()) {
      // The draft was edited after this job was queued. A newer job is already
      // in flight for the newer text; writing this result would replace rows
      // inferred from what the owner currently sees with rows inferred from
      // what they replaced.
      return;
    }

    const input = {
      contributionRequestId: draft.id,
      title: draft.title,
      description: draft.description,
      requirementTexts: draft.requirements.map((requirement) => requirement.text),
      technologyTags: this.readStringArray(draft.technology_tags),
      difficulty: draft.difficulty,
      contractVersion: 'requirement-inference-v1' as const,
    };

    if (!RequirementInferenceProcessorService.hasEnoughContent(input)) {
      await this.recordStatus(
        draft.id,
        ContributionRequestSkillInferenceStatus.not_started,
      );
      return;
    }

    const startedAt = Date.now();
    let result: RequirementInferenceResult;
    try {
      result = await this.ai.inferRequirementSkills(input);
    } catch (error) {
      await this.recordFailure(draft.id, Date.now() - startedAt, error);
      return;
    }

    await this.persist(draft.id, requestedAt, result, Date.now() - startedAt);
  }

  /**
   * Replace the inferred rows, keep every owner override.
   *
   * The override rule from ADR 0015 is enforced by the `deleteMany` filter
   * rather than by reading and diffing: only `ai_inferred` rows are removed, so
   * a correction the owner already made cannot be lost to a later run even if
   * the model now proposes something different for the same skill. An inferred
   * row whose skill the owner has since overridden is dropped, because the
   * unique index permits one row per normalized name and the human's wins.
   */
  private async persist(
    contributionRequestId: string,
    requestedAt: Date,
    result: RequirementInferenceResult,
    latencyMs: number,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<{ id: string; status: ContributionRequestStatus; updated_at: Date }>
      >(Prisma.sql`
        SELECT "id", "status", "updated_at"
        FROM "ContributionRequest"
        WHERE "id" = ${contributionRequestId}::uuid
        FOR UPDATE
      `);
      const locked = rows[0];
      // Rechecked under the lock: publication may have happened between the
      // read above and this transaction, and the set freezes at publication.
      if (
        !locked ||
        locked.status !== ContributionRequestStatus.draft ||
        locked.updated_at.getTime() > requestedAt.getTime()
      ) {
        return;
      }

      const overrides =
        await transaction.contributionRequestSkillRequirement.findMany({
          where: {
            contribution_request_id: contributionRequestId,
            source: ContributionRequestSkillRequirementSource.owner_override,
          },
          select: { skill_name_normalized: true },
        });
      const ownedByHuman = new Set(
        overrides.map((override) => override.skill_name_normalized),
      );

      await transaction.contributionRequestSkillRequirement.deleteMany({
        where: {
          contribution_request_id: contributionRequestId,
          source: ContributionRequestSkillRequirementSource.ai_inferred,
        },
      });

      const inferred = result.skills
        .map((skill) => ({
          skill,
          normalized: normalizeSkillName(skill.skillName),
        }))
        .filter(({ normalized }) => !ownedByHuman.has(normalized));

      if (inferred.length > 0) {
        await transaction.contributionRequestSkillRequirement.createMany({
          data: inferred.map(({ skill, normalized }, position) => ({
            contribution_request_id: contributionRequestId,
            skill_name: skill.skillName,
            skill_name_normalized: normalized,
            required_level: skill.requiredLevel,
            kind: skill.kind,
            source: ContributionRequestSkillRequirementSource.ai_inferred,
            confidence: skill.confidence,
            // Positioned after the owner's rows, so a set the owner curated
            // keeps the order they gave it.
            position: ownedByHuman.size + position,
          })),
        });
      }

      await transaction.contributionRequest.update({
        where: { id: contributionRequestId },
        data: {
          skill_inference_status:
            ContributionRequestSkillInferenceStatus.succeeded,
          skill_inference_ran_at: new Date(),
        },
      });

      await this.writeTrace(transaction, {
        contributionRequestId,
        status: 'success',
        model: result.model,
        latencyMs: result.latencyMs ?? latencyMs,
        skillCount: inferred.length,
      });
    });
  }

  private async recordFailure(
    contributionRequestId: string,
    latencyMs: number,
    error: unknown,
  ): Promise<void> {
    this.logger.warn(
      `Requirement inference failed for ${contributionRequestId}`,
      error instanceof Error ? error.stack : undefined,
    );
    await this.database.$transaction(async (transaction) => {
      // Nothing is deleted and nothing is written to the skill set. A provider
      // outage must leave whatever bar already exists exactly as it was.
      await transaction.contributionRequest.updateMany({
        where: {
          id: contributionRequestId,
          status: ContributionRequestStatus.draft,
        },
        data: {
          skill_inference_status: ContributionRequestSkillInferenceStatus.failed,
          skill_inference_ran_at: new Date(),
        },
      });
      await this.writeTrace(transaction, {
        contributionRequestId,
        status: 'failure',
        model: null,
        latencyMs,
        skillCount: 0,
      });
    });
  }

  private async recordStatus(
    contributionRequestId: string,
    status: ContributionRequestSkillInferenceStatus,
  ): Promise<void> {
    await this.database.contributionRequest.updateMany({
      where: {
        id: contributionRequestId,
        status: ContributionRequestStatus.draft,
      },
      data: { skill_inference_status: status },
    });
  }

  /**
   * One audit row per run, carrying counts and timings only.
   *
   * No request content, no provider trace, and no model output (ADR 0002). The
   * Request's own text is already stored on the Request; copying it into an
   * append-only AI log would duplicate owner content into a table with a
   * different retention story and no way to correct it.
   */
  private async writeTrace(
    transaction: Prisma.TransactionClient,
    input: {
      contributionRequestId: string;
      status: 'success' | 'failure';
      model: string | null;
      latencyMs: number;
      skillCount: number;
    },
  ): Promise<void> {
    await transaction.aiTraceLog.create({
      data: {
        agent_type: 'skill_validation',
        trigger_entity_id: input.contributionRequestId,
        trigger_entity_type: 'contribution_request',
        model_used: input.model?.slice(0, 50) ?? null,
        latency_ms: input.latencyMs,
        status: input.status,
        output_payload: { skillCount: input.skillCount },
      },
    });
  }

  private readStringArray(value: Prisma.JsonValue): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }
}
