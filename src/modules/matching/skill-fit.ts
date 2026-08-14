import { MatchingCandidateRequestDto } from '../contribution-tasks/dto/matching-candidate.dto';

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
 * **Today (no Phase 0):** a Request describes what it wants as owner-typed
 * technology tags plus free requirement text, and a contributor has approved
 * skill *names* with a proficiency level. There is nothing comparable to
 * compare levels against, so fit is name overlap: normalized skill names found
 * in the tags, or as whole words in the requirement text.
 *
 * **After Phase 0 (`ContributionRequestSkillRequirement`):** a Request carries
 * frozen `{ skill_name, required_level, kind }` rows, which is strictly better
 * — a contributor's `intermediate` React can be compared against a required
 * `advanced` React instead of both simply being "React". When that lands,
 * change this function to take the requirement rows and compare levels, and
 * redefine `exceededSkills` as skills whose proficiency clears the required
 * level. Nothing outside this file should need to change: that is the point of
 * routing every comparison through here.
 *
 * The function is pure and takes no clock, so identical inputs always produce
 * an identical result — which is what makes the shortlist above it stable.
 */
export function assessSkillFit(
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
 * Case and punctuation are presentation, not identity. Normalization reduces
 * both sides to lowercase words so they can be compared symmetrically; `+` and
 * `#` survive because they are part of real skill names (`C++`, `C#`).
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * The identity form, with separators removed entirely, so `Node.js`, `node js`,
 * and `NodeJS` are one skill. Used for tag comparison, where both sides are
 * short names. Requirement text keeps the spaced form, because scanning prose
 * for a separator-free token would match across word boundaries.
 */
function compact(value: string): string {
  return normalize(value).replace(/ /g, '');
}
