/**
 * One definition of skill-name identity for the whole backend.
 *
 * This lives in `shared/` rather than in a module because two independent
 * places must agree on it exactly, and neither owns the other:
 *
 * - `matching` compares a contributor's approved skills against a Request's
 *   technology tags to build a shortlist;
 * - `contribution-tasks` stores `skill_name_normalized` under a unique index,
 *   and `eligibility` looks a contributor's skills up by that same column to
 *   decide whether they may apply.
 *
 * If those two ever normalized differently, a contributor could be shortlisted
 * for a Request they are then blocked from applying to, with no visible reason
 * — the skill would be "React" on one side and "react" on the other. Keeping
 * one function is what makes that class of bug impossible rather than merely
 * unlikely. It is string handling, not a business rule, which is why `shared/`
 * is the right home for it.
 */

/**
 * The comparison form: lowercase words, punctuation reduced to single spaces.
 * `+` and `#` survive because they are part of real skill names (`C++`, `C#`).
 *
 * Used where the text being scanned is prose, because a separator-free token
 * would match across word boundaries.
 */
export function normalizeSkillPhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * The identity form, with separators removed entirely, so `Node.js`, `node js`,
 * and `NodeJS` are one skill.
 *
 * This is what `skill_name_normalized` stores and what the unique index is
 * built on, so two spellings of the same skill cannot both be attached to one
 * Contribution Request. Returns an empty string for input that carries no
 * comparable characters at all — callers must reject that rather than store it,
 * or the unique index would collapse every such row into one.
 */
export function normalizeSkillName(value: string): string {
  return normalizeSkillPhrase(value).replace(/ /g, '');
}
