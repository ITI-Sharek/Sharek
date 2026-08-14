/**
 * What the ranking agent is allowed to see, and what it may return.
 *
 * Everything sent is a fact this backend computed and is already willing to
 * show this contributor. There is deliberately no contributor identifier, no
 * evidence blob, and no field expressing eligibility — the agent orders work,
 * it does not judge a person, and a client that could express the difference
 * would eventually be handed it.
 */

export interface MatchingRankSkill {
  name: string;
  proficiency: 'beginner' | 'intermediate' | 'advanced';
}

export interface MatchingRankCandidate {
  requestId: string;
  title: string;
  projectName: string;
  technologyTags: string[];
  requirementTexts: string[];
  matchedSkills: MatchingRankSkill[];
  /** The band this backend computed. Categorical, never a number (DEC-010). */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Where this backend put it, so the agent can weigh a disagreement. */
  deterministicRank: number;
}

export interface MatchingRankInput {
  matchingRequestId: string;
  approvedSkills: MatchingRankSkill[];
  candidates: MatchingRankCandidate[];
  contractVersion: 'matching-rank-v1';
}

export interface RankedMatchDto {
  requestId: string;
  whyThisMatches: string;
}

export interface MatchingRankResult {
  matches: RankedMatchDto[];
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  serviceVersion: string;
  latencyMs?: number;
}
