import {
  normalizeSkillName,
  normalizeSkillPhrase,
} from '../../shared/skills/skill-name';
import {
  compareSkillLevels,
  meetsSkillLevel,
} from '../../shared/skills/skill-level';
import {
  MatchingCandidateRequestDto,
  MatchingCandidateSkillRequirement,
} from '../contribution-tasks/dto/matching-candidate.dto';

export interface ApprovedSkill {
  name: string;
  proficiencyLevel: 'beginner' | 'intermediate' | 'advanced';
  /**
   * The evidence the approval rested on. Carried through so a match can point
   * at why the platform believes the contributor has the skill, rather than
   * asserting it unsourced.
   */
  evidenceIds: string[];
}

/**
 * An approved skill with its comparison forms already derived. Normalizing a
 * contributor's skills once and reusing them across every candidate is what
 * keeps a shortlist over hundreds of Requests cheap; doing it inside the
 * per-candidate loop was measurably the slowest part of ranking.
 */
export interface PreparedSkill {
  skill: ApprovedSkill;
  /** Separator-free identity form, compared against technology tags. */
  token: string;
  /** Spaced form, scanned for as a whole phrase in requirement text. */
  phrase: string;
}

export function prepareApprovedSkills(
  approvedSkills: ApprovedSkill[],
): PreparedSkill[] {
  return approvedSkills
    .map((skill) => ({
      skill,
      token: compact(skill.name),
      phrase: normalize(skill.name),
    }))
    .filter((prepared) => prepared.token.length > 0);
}

export interface SkillFit {
  /**
   * Approved skills the Request asks for, in the order the Request asks for
   * them, so two contributors reading the same Request see the same order.
   */
  matchedSkills: ApprovedSkill[];
  /** Approved skills the contributor brings that this Request does not ask for. */
  exceededSkills: ApprovedSkill[];
  /** How much of what the Request asks for the contributor covers, 0..1. */
  coverage: number;
  /** What the Request asks for, after normalization. Empty means it named nothing. */
  requestedSkillCount: number;
  /** A Phase 0 Request is recommended only when every required level is met. */
  eligible: boolean;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PHASE 0 UPGRADE POINT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is the only function in the backend that decides whether a
 * contributor's skills fit a Contribution Request. Everything else — ranking,
 * exclusions, entitlement, persistence — consumes its result and never
 * re-derives fit.
 *
 * Legacy Requests without a frozen skill bar retain the original name-overlap
 * fallback. Current Phase 0 Requests use their frozen required levels instead;
 * an under-levelled contributor is not recommended for work they cannot apply
 * to. Preferred rows may enrich the explanation but never make an otherwise
 * blocked Request eligible.
 *
 * The function is pure and takes no clock, so identical inputs always produce
 * an identical result — which is what makes the shortlist above it stable.
 */
export function assessSkillFit(
  approvedSkills: PreparedSkill[],
  request: MatchingCandidateRequestDto,
): SkillFit {
  const requiredSkills = request.skillRequirements.filter(
    (skill) => skill.kind === 'required',
  );
  if (requiredSkills.length > 0) {
    return assessLevelFit(approvedSkills, requiredSkills, request.skillRequirements);
  }

  return assessLegacyNameFit(approvedSkills, request);
}

function assessLevelFit(
  approvedSkills: PreparedSkill[],
  requiredSkills: MatchingCandidateSkillRequirement[],
  allRequirements: MatchingCandidateSkillRequirement[],
): SkillFit {
  const strongestByToken = new Map<string, PreparedSkill>();
  for (const prepared of approvedSkills) {
    const current = strongestByToken.get(prepared.token);
    if (
      !current ||
      compareSkillLevels(
        prepared.skill.proficiencyLevel,
        current.skill.proficiencyLevel,
      ) > 0
    ) {
      strongestByToken.set(prepared.token, prepared);
    }
  }

  const matchedSkills: ApprovedSkill[] = [];
  const matchedTokens = new Set<string>();
  let matchedRequiredCount = 0;
  let eligible = true;

  for (const required of requiredSkills) {
    const prepared = strongestByToken.get(required.skillNameNormalized);
    if (
      prepared &&
      meetsSkillLevel(prepared.skill.proficiencyLevel, required.requiredLevel)
    ) {
      matchedRequiredCount += 1;
      if (!matchedTokens.has(prepared.token)) {
        matchedSkills.push(prepared.skill);
        matchedTokens.add(prepared.token);
      }
    } else {
      eligible = false;
    }
  }

  for (const preferred of allRequirements.filter(
    (skill) => skill.kind === 'preferred',
  )) {
    const prepared = strongestByToken.get(preferred.skillNameNormalized);
    if (
      prepared &&
      meetsSkillLevel(prepared.skill.proficiencyLevel, preferred.requiredLevel) &&
      !matchedTokens.has(prepared.token)
    ) {
      matchedSkills.push(prepared.skill);
      matchedTokens.add(prepared.token);
    }
  }

  const requestedTokens = new Set(
    allRequirements.map((skill) => skill.skillNameNormalized),
  );
  const exceededSkills = approvedSkills
    .filter((skill) => !requestedTokens.has(skill.token))
    .map((skill) => skill.skill);

  return {
    matchedSkills,
    exceededSkills,
    coverage: matchedRequiredCount / requiredSkills.length,
    requestedSkillCount: requiredSkills.length,
    eligible,
  };
}

function assessLegacyNameFit(
  approvedSkills: PreparedSkill[],
  request: MatchingCandidateRequestDto,
): SkillFit {
  const requestedTokens = requestedSkillTokens(request);
  const matchedSkills: ApprovedSkill[] = [];
  const exceededSkills: ApprovedSkill[] = [];
  const matchedTokens = new Set<string>();
  // Normalized lazily and only once per Request, because most contributors
  // match on a tag and never reach the text scan at all.
  let requirementHaystack: string | null = null;

  for (const prepared of approvedSkills) {
    if (requestedTokens.has(prepared.token)) {
      matchedSkills.push(prepared.skill);
      matchedTokens.add(prepared.token);
      continue;
    }
    requirementHaystack ??= normalizedRequirementText(request);
    if (requirementHaystack.includes(` ${prepared.phrase} `)) {
      // Requirement-text mentions are not part of the declared tag set, so they
      // cannot raise coverage above what the Request actually asked for. They
      // are recorded as matches because they are genuinely relevant.
      matchedSkills.push(prepared.skill);
    } else {
      exceededSkills.push(prepared.skill);
    }
  }

  return {
    matchedSkills,
    exceededSkills,
    coverage:
      requestedTokens.size === 0
        ? 0
        : matchedTokens.size / requestedTokens.size,
    requestedSkillCount: requestedTokens.size,
    eligible: true,
  };
}

/**
 * What the Request declares it wants. Only technology tags count here: they are
 * the owner's structured statement of the stack, whereas requirement text is
 * prose and would make coverage depend on how verbosely an owner writes.
 */
function requestedSkillTokens(request: MatchingCandidateRequestDto): Set<string> {
  const tokens = new Set<string>();
  for (const tag of request.technologyTags) {
    const token = compact(tag);
    if (token.length > 0) tokens.add(token);
  }
  return tokens;
}

/**
 * All requirement text as one space-delimited haystack. The leading and
 * trailing spaces make the whole-word test a plain substring check: "R" must
 * not match "React", and "Go" must not match "Google".
 */
function normalizedRequirementText(
  request: MatchingCandidateRequestDto,
): string {
  return ` ${request.requirementTexts.map(normalize).join(' ')} `;
}

/**
 * Case and punctuation are presentation, not identity. Both forms come from
 * `shared/skills`, because `contribution-tasks` stores `skill_name_normalized`
 * under a unique index using the same identity form and `eligibility` looks
 * skills up by it. A second copy here that drifted would let a contributor be
 * shortlisted for a Request they are then blocked from applying to.
 */
const normalize = normalizeSkillPhrase;
const compact = normalizeSkillName;
