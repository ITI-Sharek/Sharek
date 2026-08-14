import { SkillProfileProficiencyLevel } from '@prisma/client';

import { normalizeSkillName } from '../../../shared/skills/skill-name';
import {
  ApprovedSkillLevelDto,
  BlockingSkillDto,
  RequiredSkillLevelDto,
} from '../dto/eligibility.dto';

/**
 * The one place a proficiency level is ordered.
 *
 * `beginner < intermediate < advanced` (DEC-078). A map rather than an array
 * index so a new level cannot be added without deciding, explicitly, where it
 * sits — the comparison is a total order and has no defined answer for a level
 * it has never seen.
 */
const LEVEL_RANK: Record<SkillProfileProficiencyLevel, number> = {
  [SkillProfileProficiencyLevel.beginner]: 0,
  [SkillProfileProficiencyLevel.intermediate]: 1,
  [SkillProfileProficiencyLevel.advanced]: 2,
};

export function meetsLevel(
  held: SkillProfileProficiencyLevel,
  required: SkillProfileProficiencyLevel,
): boolean {
  // `>=`, not `>`. A contributor who exactly meets the bar clears it; requiring
  // strictly more would make every stated level mean one level higher than it
  // says, and no owner would be able to express "intermediate is enough".
  return LEVEL_RANK[held] >= LEVEL_RANK[required];
}

/**
 * The highest approved level a contributor holds for each normalized skill.
 *
 * Highest rather than first or latest: a contributor with two approved React
 * rows is best described by the strongest evidence the platform has already
 * accepted, and picking arbitrarily would make the verdict depend on row order.
 *
 * Callers pass **approved** skills only. That filter belongs to the
 * skill-profiles module, which owns what "approved" means; duplicating a status
 * check here would let the two definitions drift.
 */
export function indexApprovedSkills(
  approvedSkills: ApprovedSkillLevelDto[],
): Map<string, SkillProfileProficiencyLevel> {
  const held = new Map<string, SkillProfileProficiencyLevel>();
  for (const skill of approvedSkills) {
    const key = normalizeSkillName(skill.name);
    if (key.length === 0) continue;
    const current = held.get(key);
    if (
      current === undefined ||
      LEVEL_RANK[skill.proficiencyLevel] > LEVEL_RANK[current]
    ) {
      held.set(key, skill.proficiencyLevel);
    }
  }
  return held;
}

/**
 * Compare a contributor's approved skills against a Request's frozen bar.
 *
 * Pure and clock-free, so identical inputs always produce an identical verdict
 * — which is what makes a refusal reproducible for a dispute months later
 * (ADR 0015). Everything stateful — locking, persistence, the HTTP shape —
 * lives in the service above it.
 *
 * Only `required` rows are considered. `preferred` rows are advisory and never
 * affect eligibility, the same rule Advisory Fit already follows for the Fit
 * Band.
 *
 * The result preserves the order the Request states its skills in, so two
 * contributors reading the same refusal see the same list in the same order.
 */
export function findBlockingSkills(
  requiredSkills: RequiredSkillLevelDto[],
  approvedSkills: ApprovedSkillLevelDto[],
): BlockingSkillDto[] {
  const held = indexApprovedSkills(approvedSkills);
  const blocking: BlockingSkillDto[] = [];

  for (const required of requiredSkills) {
    if (required.kind !== 'required') continue;
    const contributorLevel = held.get(required.skillNameNormalized) ?? null;
    if (contributorLevel !== null && meetsLevel(contributorLevel, required.requiredLevel)) {
      continue;
    }
    // A skill the contributor does not hold at all is listed with a null level
    // rather than omitted. A contributor with no approved skills must see every
    // required skill named — an empty list would read as "you are blocked for
    // no stated reason", which is exactly the dead end DEC-078 forbids.
    blocking.push({
      skillName: required.skillName,
      requiredLevel: required.requiredLevel,
      contributorLevel,
    });
  }

  return blocking;
}
