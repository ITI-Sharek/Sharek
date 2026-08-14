import {
  ContributionRequestRequirementKind,
  SkillProfileProficiencyLevel,
} from '@prisma/client';

export interface MatchingCandidateSkillRequirement {
  skillName: string;
  skillNameNormalized: string;
  requiredLevel: SkillProfileProficiencyLevel;
  kind: ContributionRequestRequirementKind;
}

/**
 * The facts the matching module needs about one open Contribution Request.
 *
 * Deliberately narrow: matching never sees a Prisma record, and never learns
 * anything about a Request that public discovery would not also show.
 */
export interface MatchingCandidateRequestDto {
  id: string;
  projectId: string;
  /** The parent Project's title, so the caller need not resolve it again. */
  projectName: string;
  ownerId: string;
  title: string;
  /** Owner-declared technology tags, already normalized to a string list. */
  technologyTags: string[];
  /** Requirement text in position order, required entries before preferred. */
  requirementTexts: string[];
  /** Frozen Phase 0 skill bar; empty only for legacy Requests predating the gate. */
  skillRequirements: MatchingCandidateSkillRequirement[];
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  applicationsCloseAt: Date | null;
  targetCompletionDate: Date | null;
  reward: number | null;
  rewardCurrency: string | null;
  /** Never null for a published Request; the recency key for ranking. */
  publishedAt: Date;
}
