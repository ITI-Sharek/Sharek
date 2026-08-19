/**
 * The response `GET /contributors/me/recommended-tasks` returns.
 *
 * Mirrors the frontend's `src/modules/matching/types/matching.types.ts`. Two
 * things are absent by design:
 *
 * - **No `matchScore`, and no percentage anywhere.** DEC-010 forbids presenting
 *   fit as a number. `rank` is an ordinal position and `confidence` is a
 *   categorical band; those are the only two signals a contributor sees.
 * - **No 403 for a free contributor.** The route is legitimately theirs; they
 *   receive an empty `recommendations` list and a `reason`.
 */

export interface RecommendedMatchedSkillDto {
  name: string;
  proficiency: 'beginner' | 'intermediate' | 'advanced';
  /** The approved evidence the skill rests on, so a match can cite itself. */
  evidenceIds: string[];
}

export interface RecommendedTaskDto {
  requestId: string;
  projectName: string;
  title: string;
  /** 1-based ordinal position. Never a score. */
  rank: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  justification: string;
  matchedSkills: RecommendedMatchedSkillDto[];
  /**
   * The fit gauge's two numbers, and the skills they count.
   *
   * `matchedSkills.length` is not the numerator: it includes preferred skills
   * the Request did not require, so a gauge drawn from it reads full on a
   * partial fit. These are server-authored counts of the *required* bar.
   */
  requiredSkillNames: string[];
  matchedRequiredCount: number;
  requiredSkillCount: number;
  applicationsCloseAt: string;
  targetCompletionDate: string | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  reward: number | null;
  rewardCurrency: string | null;
}

export interface RecommendedTasksResponseDto {
  planType: 'free' | 'gold';
  recommendations: RecommendedTaskDto[];
  /**
   * Why the list is empty, or null when it is not. Additive to the frontend
   * type: a free contributor gets `MATCHING_REQUIRES_SUBSCRIPTION` with a 200,
   * which is what lets the UI show an upgrade prompt instead of an error state.
   */
  reason:
    | 'MATCHING_REQUIRES_SUBSCRIPTION'
    | 'NO_APPROVED_SKILLS'
    | 'NO_MATCHING_REQUESTS'
    | null;
}
