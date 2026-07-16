export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/;
export const USERNAME_MAX_LENGTH = 30;
const USERNAME_SUFFIX_RETRIES = 10;

export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'api',
  'auth',
  'help',
  'login',
  'moderator',
  'null',
  'profile',
  'root',
  'settings',
  'share-k',
  'sharek',
  'signup',
  'support',
  'system',
  'undefined',
]);

export interface UsernameSource {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username);
}

export function normalizeUsernameCandidate(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/[-_]{2,}/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^a-z0-9]+$/, '')
    .slice(0, USERNAME_MAX_LENGTH);
}

export function buildUsernameBase(source: UsernameSource): string | null {
  const nameBase = [source.firstName, source.lastName]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join('-');

  const normalizedName = normalizeUsernameCandidate(nameBase);
  if (normalizedName.length >= 3) {
    return normalizedName;
  }

  const emailLocalPart = source.email?.split('@')[0] ?? '';
  const normalizedEmail = normalizeUsernameCandidate(emailLocalPart);
  return normalizedEmail.length >= 3 ? normalizedEmail : null;
}

export function buildUsernameCandidates(source: UsernameSource): string[] {
  const base = buildUsernameBase(source);
  if (!base) {
    return [];
  }

  return Array.from({ length: USERNAME_SUFFIX_RETRIES + 1 }, (_, index) => {
    if (index === 0) {
      return base.slice(0, USERNAME_MAX_LENGTH);
    }

    const suffix = `-${index}`;
    return `${base.slice(0, USERNAME_MAX_LENGTH - suffix.length)}${suffix}`;
  }).filter(isValidUsername);
}
