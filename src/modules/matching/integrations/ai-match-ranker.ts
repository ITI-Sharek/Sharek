import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AiService } from '../../ai/ai.service';
import { MatchRanker } from '../match-ranker';
import { ShortlistedMatch } from '../matching.service';

/**
 * Binds the AI ranking agent to the {@link MatchRanker} port.
 *
 * The port's contract is what makes this safe to switch on: a ranker may
 * **reorder**, never add, remove, or edit. `RecommendedTasksService` validates
 * that the returned set is a permutation of what it sent and keeps the
 * deterministic order otherwise, so nothing here can change *which* Requests a
 * contributor sees — only the order, and the sentence beside each one.
 *
 * Every failure mode ends the same way: the deterministic order. A missing
 * flag, an unreachable service, a timeout, a malformed body, a drifted id set.
 * A contributor's matched projects never wait on a model.
 */
@Injectable()
export class AiMatchRanker extends MatchRanker {
  private readonly logger = new Logger(AiMatchRanker.name);

  constructor(
    private readonly ai: AiService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  /**
   * Off unless explicitly enabled. The deterministic shortlist is already a
   * complete answer, so this is an improvement to turn on deliberately once the
   * agent is deployed and observed — not a dependency that ships switched on.
   */
  private isEnabled(): boolean {
    return this.config.get<boolean>('MATCH_RANKER_ENABLED', false);
  }

  async rerank(input: {
    contributorId: string;
    matches: ShortlistedMatch[];
  }): Promise<ShortlistedMatch[]> {
    if (!this.isEnabled() || input.matches.length < 2) {
      // Nothing to reorder below two, so there is no reason to spend a model
      // call or a round trip on it.
      return input.matches;
    }

    const byRequestId = new Map(
      input.matches.map((match) => [match.request.id, match]),
    );

    try {
      const result = await this.ai.rankMatches({
        // A correlation id for the agent's logs. Deliberately not the
        // contributor's id: the agent orders work and has no business knowing
        // whose shortlist it is.
        matchingRequestId: `shortlist-${input.matches.length}`,
        approvedSkills: this.approvedSkillsOf(input.matches),
        candidates: input.matches.map((match) => ({
          requestId: match.request.id,
          title: match.request.title,
          projectName: match.request.projectName,
          technologyTags: match.request.technologyTags,
          requirementTexts: match.request.requirementTexts,
          matchedSkills: match.matchedSkills.map((skill) => ({
            name: skill.name,
            proficiency: skill.proficiency,
          })),
          confidence: match.confidence,
          deterministicRank: match.rank,
        })),
        contractVersion: 'matching-rank-v1',
      });

      const reordered: ShortlistedMatch[] = [];
      for (const ranked of result.matches) {
        const match = byRequestId.get(ranked.requestId);
        if (match) {
          reordered.push({
            ...match,
            rankerJustification: ranked.whyThisMatches,
          });
        }
      }

      // Belt and braces: the client already refused a non-permutation, and the
      // caller refuses one again. If either check were ever relaxed, this stops
      // a short list silently replacing a complete one.
      if (reordered.length !== input.matches.length) return input.matches;

      return reordered;
    } catch (error) {
      this.logger.warn(
        `Match ranking unavailable; keeping the deterministic order: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return input.matches;
    }
  }

  /**
   * The contributor's approved skills, deduplicated across the shortlist.
   *
   * Derived from the matches rather than read again, so the agent sees exactly
   * the skills that produced this shortlist and cannot be handed one that did
   * not participate.
   */
  private approvedSkillsOf(matches: ShortlistedMatch[]) {
    const byName = new Map<string, { name: string; proficiency: string }>();
    for (const match of matches) {
      for (const skill of [...match.matchedSkills, ...match.exceededSkills]) {
        if (!byName.has(skill.name)) {
          byName.set(skill.name, {
            name: skill.name,
            proficiency: skill.proficiency,
          });
        }
      }
    }
    return [...byName.values()] as {
      name: string;
      proficiency: 'beginner' | 'intermediate' | 'advanced';
    }[];
  }
}
