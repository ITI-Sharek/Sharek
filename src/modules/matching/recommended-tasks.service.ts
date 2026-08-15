import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { DatabaseService } from '../../shared/database/database.service';
import { ForbiddenApplicationError } from '../../shared/errors/application.error';
import {
  RecommendedTaskDto,
  RecommendedTasksResponseDto,
} from './dto/recommended-tasks.dto';
import { MatchRanker } from './match-ranker';
import { MatchingService, ShortlistedMatch } from './matching.service';

/**
 * Serves a contributor their matched projects and records what they were shown.
 *
 * **Matching is pull-only.** A contributor asks and receives; publishing a
 * Contribution Request notifies nobody, in either owner tier. Nothing in this
 * file writes a notification, and a test asserts that publication emits none.
 */
@Injectable()
export class RecommendedTasksService {
  private readonly logger = new Logger(RecommendedTasksService.name);

  constructor(
    private readonly matching: MatchingService,
    private readonly database: DatabaseService,
    // Optional at this seam: the bound adapter is feature-flagged and every
    // unavailable/invalid response falls back to the deterministic shortlist.
    @Optional() private readonly ranker?: MatchRanker,
  ) {}

  async listForContributor(
    actor: AuthenticatedUser,
    now = new Date(),
  ): Promise<RecommendedTasksResponseDto> {
    this.assertActiveContributor(actor);

    const shortlist = await this.matching.shortlistForContributor({
      contributorId: actor.id,
      now,
    });

    if (shortlist.matches.length === 0) {
      // A free contributor is not refused. The route is legitimately theirs and
      // the answer is simply empty, with a reason the UI can turn into an
      // upgrade prompt rather than an error state.
      return {
        planType: shortlist.planType,
        recommendations: [],
        reason: shortlist.reason,
      };
    }

    const ordered = await this.applyRanker(actor.id, shortlist.matches);
    await this.persist(actor.id, ordered);

    return {
      planType: shortlist.planType,
      recommendations: ordered.map((match, index) =>
        toRecommendedTask(match, index + 1),
      ),
      reason: null,
    };
  }

  /**
   * Re-ranking is best-effort. If no ranker is bound, or it throws, or it
   * returns a set that is not a permutation of what it was given, the
   * deterministic order stands. A contributor gets a worse order at worst,
   * never an error, which is what makes the AI dependency optional rather than
   * load-bearing.
   */
  private async applyRanker(
    contributorId: string,
    matches: ShortlistedMatch[],
  ): Promise<ShortlistedMatch[]> {
    if (!this.ranker) return matches;
    try {
      const reranked = await this.ranker.rerank({ contributorId, matches });
      const reordered = reorderOnly(matches, reranked);
      if (!reordered) {
        this.logger.warn(
          'Match ranker returned a set that was not a permutation of the shortlist; keeping the deterministic order',
        );
        return matches;
      }
      return reordered;
    } catch (error) {
      this.logger.warn(
        `Match ranker failed, keeping the deterministic order: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return matches;
    }
  }

  /**
   * Records what the contributor was shown, so a later question about why a
   * Request appeared has an answer.
   *
   * Recomputing replaces this contributor's previous rows rather than
   * accumulating them: the shortlist is a current view, not a history, and
   * `@@unique([contribution_request_id, contributor_id])` makes the replacement
   * the only representable outcome. Both statements run in one transaction so a
   * failure cannot leave the contributor with no results at all.
   */
  private async persist(
    contributorId: string,
    matches: ShortlistedMatch[],
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await transaction.aiMatchResult.deleteMany({
        where: { contributor_id: contributorId },
      });
      await transaction.aiMatchResult.createMany({
        data: matches.map((match, index) => ({
          contribution_request_id: match.request.id,
          contributor_id: contributorId,
          rank: index + 1,
          // Kept as an internal ordering signal only. It is never returned:
          // DEC-010 forbids presenting fit as a number, and the API exposes the
          // categorical `confidence` instead.
          match_score: coverageFor(match.confidence),
          matched_skills: match.matchedSkills as unknown as Prisma.InputJsonValue,
          justification: justificationFor(match),
          model_used: this.ranker ? undefined : null,
        })),
      });
    });
  }

  private assertActiveContributor(actor: AuthenticatedUser): void {
    if (actor.role !== 'contributor' || actor.status !== 'active') {
      throw new ForbiddenApplicationError(
        'An active contributor account is required',
        'CONTRIBUTOR_RECOMMENDATIONS_NOT_AUTHORIZED',
      );
    }
  }
}

function toRecommendedTask(
  match: ShortlistedMatch,
  rank: number,
): RecommendedTaskDto {
  return {
    requestId: match.request.id,
    projectName: match.request.projectName,
    title: match.request.title,
    rank,
    confidence: match.confidence,
    justification: justificationFor(match),
    matchedSkills: match.matchedSkills,
    // Every candidate is still open to Applications, so this is never null.
    applicationsCloseAt: (
      match.request.applicationsCloseAt ?? new Date(0)
    ).toISOString(),
    targetCompletionDate:
      match.request.targetCompletionDate?.toISOString() ?? null,
    difficulty: match.request.difficulty,
    reward: match.request.reward,
    rewardCurrency: match.request.rewardCurrency,
  };
}

/**
 * Server-authored, so the contributor reads a sentence about their own approved
 * evidence rather than the UI inventing one from a plan name. It names skills
 * and never a number.
 */
function justificationFor(match: ShortlistedMatch): string {
  if (match.rankerJustification) return match.rankerJustification;
  const matched = match.matchedSkills.map((skill) => skill.name);
  const sentence =
    matched.length === 1
      ? `Your approved ${matched[0]} matches what this request asks for.`
      : `Your approved ${listPhrase(matched)} match what this request asks for.`;
  if (match.exceededSkills.length === 0) return sentence;
  return `${sentence} You also bring ${listPhrase(
    match.exceededSkills.map((skill) => skill.name),
  )}.`;
}

function listPhrase(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * The persisted column is a float, so the band is stored as its lower bound.
 * The exact ratio is not worth persisting: it is an artefact of name overlap,
 * and the band is the resolution the product actually reasons in.
 */
function coverageFor(confidence: 'HIGH' | 'MEDIUM' | 'LOW'): number {
  if (confidence === 'HIGH') return 0.75;
  if (confidence === 'MEDIUM') return 0.4;
  return 0;
}

function reorderOnly(
  original: ShortlistedMatch[],
  candidate: unknown,
): ShortlistedMatch[] | null {
  if (!Array.isArray(candidate) || candidate.length !== original.length) {
    return null;
  }
  const originalById = new Map(
    original.map((match) => [match.request.id, match]),
  );
  const reordered: ShortlistedMatch[] = [];
  const seen = new Set<string>();
  for (const item of candidate) {
    const id = (item as { request?: { id?: unknown } } | null)?.request?.id;
    if (typeof id !== 'string' || seen.has(id)) return null;
    const match = originalById.get(id);
    if (!match) return null;
    seen.add(id);
    // Keep every server-authored fact from the deterministic object. The only
    // ranker-authored value allowed through this seam is its bounded,
    // non-numeric explanation.
    const justification = (
      item as { rankerJustification?: unknown }
    ).rankerJustification;
    reordered.push({
      ...match,
      ...(isSafeRankerJustification(justification)
        ? { rankerJustification: justification }
        : {}),
    });
  }
  return reordered.length === original.length ? reordered : null;
}

function isSafeRankerJustification(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 300 &&
    !value.includes('%')
  );
}
