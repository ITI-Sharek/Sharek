import { Injectable, Logger } from '@nestjs/common';
import { EligibilityGuidanceStatus, Prisma } from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import {
  BadRequestApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';
import { BlockingSkillDto } from '../../eligibility/dto/eligibility.dto';
import {
  EligibilityGuidanceDto,
  EligibilityGuidancePageDto,
} from '../dto/eligibility-guidance.dto';
import { EligibilityGuidanceQueue } from '../jobs/eligibility-guidance.queue';

const DEFAULT_PAGE_SIZE = 20;

/**
 * The second trigger for skill-gap guidance (`P0-B05`).
 *
 * ADR 0014's contributor-requested route is untouched and stays exactly as it
 * was — explicit, tier-independent, Application-independent. This adds the case
 * that route cannot serve: a contributor who has just been *blocked* and should
 * get help for that exact gap without having to go and construct a request for
 * it.
 *
 * Scoped to an `EligibilityEvaluation`, not an Application. Under a hard block
 * no Application exists, and `SkillGapGuidance.application_id` is `@unique` and
 * NOT NULL — so the retired entity ADR 0014 replaced is not merely the wrong
 * home, it is an impossible one.
 */
@Injectable()
export class EligibilityGuidanceService {
  private readonly logger = new Logger(EligibilityGuidanceService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly queue: EligibilityGuidanceQueue,
  ) {}

  /**
   * Ask for guidance about a recorded block.
   *
   * **Returns without waiting for the provider.** The deterministic
   * blocking-skill list is copied onto the row and returned immediately; the
   * narrative is generated on a queue and polled for. A contributor who has
   * just been refused should not then be made to wait on a model to find out
   * why — they already know why, and the narrative only adds to it.
   */
  async request(
    actor: AuthenticatedUser,
    eligibilityEvaluationId: string,
  ): Promise<EligibilityGuidanceDto> {
    this.assertActiveContributor(actor);

    const evaluation = await this.database.eligibilityEvaluation.findFirst({
      where: { id: eligibilityEvaluationId, contributor_id: actor.id },
      select: { id: true, outcome: true, blocking_skills: true },
    });
    // Scoped by contributor in the query itself, so another contributor's
    // evaluation is indistinguishable from one that does not exist.
    if (!evaluation) throw this.guidanceNotFound();

    if (evaluation.outcome !== 'blocked') {
      // Guidance for a gap that does not exist would be a model inventing
      // shortcomings for someone who was let through.
      throw new BadRequestApplicationError(
        'Guidance is only available for a blocked eligibility evaluation',
        'ELIGIBILITY_GUIDANCE_NOT_BLOCKED',
      );
    }

    // Re-requesting while one is pending or ready returns what already exists,
    // rather than queuing another provider call for the same gap. A `failed`
    // row is not reused — a retry after failure is exactly what a contributor
    // should be able to do.
    const existing = await this.database.eligibilityGuidance.findFirst({
      where: {
        eligibility_evaluation_id: eligibilityEvaluationId,
        contributor_id: actor.id,
        status: {
          in: [
            EligibilityGuidanceStatus.pending,
            EligibilityGuidanceStatus.ready,
          ],
        },
      },
      orderBy: { created_at: 'desc' },
    });
    if (existing) return this.toDto(existing);

    const created = await this.database.eligibilityGuidance.create({
      data: {
        eligibility_evaluation_id: eligibilityEvaluationId,
        contributor_id: actor.id,
        status: EligibilityGuidanceStatus.pending,
        // Copied, not joined. The row has to keep explaining the refusal even
        // if generation never succeeds.
        blocking_skills: evaluation.blocking_skills as Prisma.InputJsonValue,
      },
    });

    // After the row exists, so a queue outage leaves a `pending` row the
    // contributor can see and retry rather than losing the request entirely.
    await this.queue.enqueueGeneration({ guidanceId: created.id });

    return this.toDto(created);
  }

  /** Poll one piece of guidance. */
  async getForActor(
    actor: AuthenticatedUser,
    guidanceId: string,
  ): Promise<EligibilityGuidanceDto> {
    this.assertActiveContributor(actor);
    const guidance = await this.database.eligibilityGuidance.findFirst({
      where: { id: guidanceId, contributor_id: actor.id },
    });
    if (!guidance) throw this.guidanceNotFound();
    return this.toDto(guidance);
  }

  /**
   * The contributor's own guidance history, keyset-paginated.
   *
   * Ordered `created_at desc, id desc` and covered by
   * `@@index([contributor_id, created_at, id])`, so a page is an index range
   * rather than an offset scan that gets slower the further back you read.
   */
  async listForActor(
    actor: AuthenticatedUser,
    options: { cursor?: string; limit?: number },
  ): Promise<EligibilityGuidancePageDto> {
    this.assertActiveContributor(actor);
    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const cursor = options.cursor ? this.decodeCursor(options.cursor) : null;

    const rows = await this.database.eligibilityGuidance.findMany({
      where: {
        contributor_id: actor.id,
        ...(cursor
          ? {
              OR: [
                { created_at: { lt: cursor.createdAt } },
                { created_at: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      // One more than asked for, so `hasNextPage` is known without a count.
      take: limit + 1,
    });

    const hasNextPage = rows.length > limit;
    const page = hasNextPage ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    return {
      items: page.map((row) => this.toDto(row)),
      pageInfo: {
        hasNextPage,
        nextCursor:
          hasNextPage && last
            ? this.encodeCursor({ createdAt: last.created_at, id: last.id })
            : null,
      },
    };
  }

  /** Called by the worker once the provider answers. */
  async recordResult(input: {
    guidanceId: string;
    narrative: string | null;
    recommendations: unknown;
    modelUsed: string | null;
  }): Promise<void> {
    await this.database.eligibilityGuidance.updateMany({
      where: {
        id: input.guidanceId,
        status: EligibilityGuidanceStatus.pending,
      },
      data: {
        status: EligibilityGuidanceStatus.ready,
        narrative: input.narrative,
        recommendations: (input.recommendations ??
          Prisma.JsonNull) as Prisma.InputJsonValue,
        model_used: input.modelUsed?.slice(0, 50) ?? null,
      },
    });
  }

  /**
   * Called by the worker when generation cannot complete.
   *
   * `blocking_skills` is untouched, which is the point: the contributor still
   * sees exactly which skills blocked them and at what level. Failure removes
   * the narrative, never the reason.
   */
  async recordFailure(guidanceId: string): Promise<void> {
    this.logger.warn(`Skill-gap guidance generation failed for ${guidanceId}`);
    await this.database.eligibilityGuidance.updateMany({
      where: { id: guidanceId, status: EligibilityGuidanceStatus.pending },
      data: { status: EligibilityGuidanceStatus.failed },
    });
  }

  private toDto(row: {
    id: string;
    eligibility_evaluation_id: string;
    status: EligibilityGuidanceStatus;
    blocking_skills: Prisma.JsonValue;
    narrative: string | null;
    recommendations: Prisma.JsonValue;
    created_at: Date;
    updated_at: Date;
  }): EligibilityGuidanceDto {
    return {
      id: row.id,
      eligibilityEvaluationId: row.eligibility_evaluation_id,
      status: row.status,
      blockingSkills: (Array.isArray(row.blocking_skills)
        ? row.blocking_skills
        : []) as unknown as BlockingSkillDto[],
      narrative: row.narrative,
      recommendations: row.recommendations ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private encodeCursor(value: { createdAt: Date; id: string }): string {
    return Buffer.from(
      `${value.createdAt.toISOString()}|${value.id}`,
      'utf8',
    ).toString('base64url');
  }

  /**
   * Strictly validated. A tampered cursor is a 400, never a silent fall back to
   * the first page — which would make a paginating client loop forever without
   * ever saying anything was wrong.
   */
  private decodeCursor(value: string): { createdAt: Date; id: string } {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const separator = decoded.indexOf('|');
    if (separator === -1) throw this.invalidCursor();
    const createdAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (
      Number.isNaN(createdAt.getTime()) ||
      !/^[0-9a-f-]{36}$/i.test(id) ||
      // Re-encoding must round-trip, so trailing junk cannot ride along.
      this.encodeCursor({ createdAt, id }) !== value
    ) {
      throw this.invalidCursor();
    }
    return { createdAt, id };
  }

  private invalidCursor(): BadRequestApplicationError {
    return new BadRequestApplicationError(
      'The guidance cursor is not valid',
      'ELIGIBILITY_GUIDANCE_CURSOR_INVALID',
    );
  }

  /**
   * One error for every unauthorized shape. An owner, another contributor, and
   * an unknown id all get the same not-found, so the endpoint cannot be used to
   * discover whether a given guidance id exists.
   */
  private guidanceNotFound(): NotFoundApplicationError {
    return new NotFoundApplicationError(
      'Skill-gap guidance was not found',
      'ELIGIBILITY_GUIDANCE_NOT_FOUND',
    );
  }

  private assertActiveContributor(actor: AuthenticatedUser): void {
    // Deliberately no plan check. DEC-076 keeps guidance free for every
    // contributor, and a block is the moment a paywall would be least
    // defensible: the platform has just refused them.
    if (actor.role !== 'contributor' || actor.status !== 'active') {
      throw new ForbiddenApplicationError(
        'An active contributor account is required for skill-gap guidance',
        'SKILL_GAP_GUIDANCE_FORBIDDEN',
      );
    }
  }
}
