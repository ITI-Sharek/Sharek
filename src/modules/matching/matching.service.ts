import { Injectable } from '@nestjs/common';

import { ApplicationsService } from '../applications/applications.service';
import { MatchingCandidateRequestDto } from '../contribution-tasks/dto/matching-candidate.dto';
import { ContributionTasksService } from '../contribution-tasks/services/contribution-tasks.service';
import { ReputationService } from '../reputation/reputation.service';
import { SkillProfileSummaryService } from '../skill-profiles/services/skill-profile-summary.service';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import {
  ApprovedSkill,
  assessSkillFit,
  prepareApprovedSkills,
} from './skill-fit';

/**
 * Why a contributor got an empty shortlist. Always a code, never an empty list
 * with no explanation, so the caller can say something specific.
 */
export type MatchShortlistReason =
  | 'MATCHING_REQUIRES_SUBSCRIPTION'
  | 'NO_APPROVED_SKILLS'
  | 'NO_MATCHING_REQUESTS';

export interface MatchedSkillDto {
  name: string;
  proficiency: 'beginner' | 'intermediate' | 'advanced';
}

export interface ShortlistedMatch {
  request: MatchingCandidateRequestDto;
  /** 1-based position. Ordinal only — never a score and never a percentage. */
  rank: number;
  /** Approved skills this Request asks for. */
  matchedSkills: MatchedSkillDto[];
  /** Approved skills the contributor brings beyond what this Request asks for. */
  exceededSkills: MatchedSkillDto[];
  /**
   * Coverage bucket, categorical by DEC-010. The underlying ratio is used for
   * ordering but never leaves this module as a number.
   */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface MatchShortlist {
  planType: 'free' | 'gold';
  matches: ShortlistedMatch[];
  /** Present only when `matches` is empty. */
  reason: MatchShortlistReason | null;
}

/**
 * How many open Requests may enter ranking. Ranking is O(candidates × skills)
 * in memory, so the bound is what keeps a match request from growing with the
 * platform. Well above the 10 a Gold contributor can be shown, so the cap does
 * not shape normal results.
 */
const CANDIDATE_LIMIT = 500;

/**
 * The deterministic contributor→Request shortlist.
 *
 * No AI is involved. Given the same rows this returns the same order every
 * time, which is what makes it a usable fallback when an AI ranker is added
 * later and what makes it testable at all.
 *
 * Ordering, in strict precedence: coverage, then the owner's reputation, then
 * recency of publication, then `id`. The final `id` key is not decoration —
 * without it two Requests published in the same millisecond with equal coverage
 * would come back in whatever order Postgres felt like.
 *
 * **Owner-side matching does not exist and must not be added.** There is no
 * method here that takes a Request and returns contributors. The owner-facing
 * matching UI was removed on 2026-08-14; matching is pull-only, and publishing
 * a Request notifies nobody.
 */
@Injectable()
export class MatchingService {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly skillProfiles: SkillProfileSummaryService,
    private readonly contributionTasks: ContributionTasksService,
    private readonly applications: ApplicationsService,
    private readonly reputation: ReputationService,
  ) {}

  async shortlistForContributor(input: {
    contributorId: string;
    now?: Date;
  }): Promise<MatchShortlist> {
    const now = input.now ?? new Date();
    const entitlements = await this.entitlements.resolveForContributor(
      input.contributorId,
      undefined,
      now,
    );

    // Entitlement is enforced here rather than in a controller, so every caller
    // — HTTP route, job, or another service — gets the same answer. A free
    // contributor is not an error: the shortlist is legitimately theirs, it is
    // just empty until they subscribe.
    if (entitlements.matchedProjectLimit <= 0) {
      return {
        planType: entitlements.planType,
        matches: [],
        reason: 'MATCHING_REQUIRES_SUBSCRIPTION',
      };
    }

    const approvedSkills = await this.listApprovedSkills(input.contributorId);
    if (approvedSkills.length === 0) {
      return {
        planType: entitlements.planType,
        matches: [],
        reason: 'NO_APPROVED_SKILLS',
      };
    }

    const [candidates, appliedRequestIds] = await Promise.all([
      this.contributionTasks.listOpenRequestsForMatching({
        excludeOwnerId: input.contributorId,
        limit: CANDIDATE_LIMIT,
        now,
      }),
      this.applications.listAppliedContributionRequestIds(input.contributorId),
    ]);
    const alreadyApplied = new Set(appliedRequestIds);

    // Derived once and reused across every candidate, rather than per Request.
    const preparedSkills = prepareApprovedSkills(approvedSkills);
    const scored = candidates
      .filter((candidate) => !alreadyApplied.has(candidate.id))
      .map((candidate) => ({
        candidate,
        fit: assessSkillFit(preparedSkills, candidate),
      }))
      .filter(({ fit }) => fit.matchedSkills.length > 0);

    if (scored.length === 0) {
      return {
        planType: entitlements.planType,
        matches: [],
        reason: 'NO_MATCHING_REQUESTS',
      };
    }

    const ownerReputation = await this.reputation.listSummariesForUsers(
      scored.map(({ candidate }) => candidate.ownerId),
    );

    const ranked = scored
      .map((entry) => ({
        ...entry,
        // An owner with no ratings yet sorts as 0 rather than being excluded:
        // a new owner's Request is still a real opportunity, it simply has no
        // reputation signal to rank on.
        ownerRating: ownerReputation.get(entry.candidate.ownerId)?.rating ?? 0,
      }))
      .sort((left, right) => {
        if (left.fit.coverage !== right.fit.coverage) {
          return right.fit.coverage - left.fit.coverage;
        }
        if (left.ownerRating !== right.ownerRating) {
          return right.ownerRating - left.ownerRating;
        }
        const recency =
          right.candidate.publishedAt.getTime() -
          left.candidate.publishedAt.getTime();
        if (recency !== 0) return recency;
        // The tie-break that makes the order total. Two Requests published in
        // the same millisecond with equal coverage and equal owner reputation
        // are otherwise indistinguishable, and the database would return them
        // in an arbitrary order.
        return left.candidate.id < right.candidate.id ? -1 : 1;
      })
      .slice(0, entitlements.matchedProjectLimit);

    return {
      planType: entitlements.planType,
      matches: ranked.map((entry, index) => ({
        request: entry.candidate,
        rank: index + 1,
        matchedSkills: entry.fit.matchedSkills.map(toMatchedSkill),
        exceededSkills: entry.fit.exceededSkills.map(toMatchedSkill),
        confidence: toConfidence(entry.fit.coverage),
      })),
      reason: null,
    };
  }

  private async listApprovedSkills(
    contributorId: string,
  ): Promise<ApprovedSkill[]> {
    // `listApprovedSkillsForEligibility` returns approved skills only, so
    // pending, rejected, disputed and superseded rows never reach the
    // comparison. That filter belongs to the skill-profiles module and is not
    // duplicated here.
    const skills =
      await this.skillProfiles.listApprovedSkillsForEligibility(contributorId);
    return skills.map((skill) => ({
      name: skill.name,
      proficiencyLevel: skill.proficiencyLevel,
    }));
  }
}

function toMatchedSkill(skill: ApprovedSkill): MatchedSkillDto {
  return { name: skill.name, proficiency: skill.proficiencyLevel };
}

/**
 * Coverage becomes a categorical band before it leaves this module. DEC-010
 * forbids presenting fit as a percentage, and a bucket is also the honest
 * resolution: the difference between 61% and 64% name overlap is noise.
 */
function toConfidence(coverage: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (coverage >= 0.75) return 'HIGH';
  if (coverage >= 0.4) return 'MEDIUM';
  return 'LOW';
}
