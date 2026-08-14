import {
  ContributionRequestRequirementKind,
  EligibilityOutcome,
  SkillProfileProficiencyLevel,
} from '@prisma/client';

/**
 * One reason a contributor cannot submit.
 *
 * `contributorLevel` is `null` when they hold no approved evidence for the
 * skill at all — a genuinely different situation from holding it at too low a
 * level, and one the UI must render differently ("no approved evidence" versus
 * "your level is beginner"). Collapsing the two into a single "not met" would
 * make the recovery advice wrong for one of them.
 */
export interface BlockingSkillDto {
  skillName: string;
  requiredLevel: SkillProfileProficiencyLevel;
  contributorLevel: SkillProfileProficiencyLevel | null;
}

/** The bar, as the evaluator sees it. */
export interface RequiredSkillLevelDto {
  skillName: string;
  skillNameNormalized: string;
  requiredLevel: SkillProfileProficiencyLevel;
  kind: ContributionRequestRequirementKind;
}

/** An approved skill, as the evaluator sees it. */
export interface ApprovedSkillLevelDto {
  name: string;
  proficiencyLevel: SkillProfileProficiencyLevel;
}

export interface EligibilityVerdictDto {
  outcome: EligibilityOutcome;
  blockingSkills: BlockingSkillDto[];
}

/**
 * What the read endpoint returns. It carries the full bar, not just the
 * failures, so a contributor can see what is being asked before they decide
 * whether to invest in a form — and can tell "this Request wants three things
 * and I have two" from "this Request wants one thing I do not have".
 */
export interface EligibilityPreviewDto extends EligibilityVerdictDto {
  contributionRequestId: string;
  requiredSkills: Array<{
    skillName: string;
    requiredLevel: SkillProfileProficiencyLevel;
    contributorLevel: SkillProfileProficiencyLevel | null;
    met: boolean;
  }>;
}
