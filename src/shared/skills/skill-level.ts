import { SkillProfileProficiencyLevel } from '@prisma/client';

/**
 * The one total order shared by eligibility and matching.
 *
 * A level comparison is a domain rule, not a caller detail: if matching and
 * the submission gate ranked the same contributor differently, a contributor
 * could be recommended for work they are immediately blocked from applying to.
 */
const LEVEL_RANK: Record<SkillProfileProficiencyLevel, number> = {
  [SkillProfileProficiencyLevel.beginner]: 0,
  [SkillProfileProficiencyLevel.intermediate]: 1,
  [SkillProfileProficiencyLevel.advanced]: 2,
};

export function compareSkillLevels(
  left: SkillProfileProficiencyLevel,
  right: SkillProfileProficiencyLevel,
): number {
  return LEVEL_RANK[left] - LEVEL_RANK[right];
}

export function meetsSkillLevel(
  held: SkillProfileProficiencyLevel,
  required: SkillProfileProficiencyLevel,
): boolean {
  return compareSkillLevels(held, required) >= 0;
}
