import {
  buildUsernameCandidates,
  isReservedUsername,
  isValidUsername,
  normalizeUsernameCandidate,
} from './username.policy';

describe('username policy', () => {
  it('validates the public username pattern', () => {
    expect(isValidUsername('john-doe')).toBe(true);
    expect(isValidUsername('john_doe')).toBe(true);
    expect(isValidUsername('jo')).toBe(false);
    expect(isValidUsername('-john')).toBe(false);
    expect(isValidUsername('john-')).toBe(false);
    expect(isValidUsername('John')).toBe(false);
  });

  it('normalizes display-name source values', () => {
    expect(normalizeUsernameCandidate(' John   Doe! ')).toBe('john-doe');
  });

  it('blocks reserved platform usernames', () => {
    expect(isReservedUsername('admin')).toBe(true);
    expect(isReservedUsername('sharek')).toBe(true);
    expect(isReservedUsername('jane-doe')).toBe(false);
  });

  it('falls back to the email local part when names are unusable', () => {
    expect(
      buildUsernameCandidates({
        firstName: '!',
        lastName: '',
        email: 'Contrib.User@example.com',
      })[0],
    ).toBe('contrib-user');
  });

  it('builds a base candidate plus 10 deterministic suffix retries', () => {
    const candidates = buildUsernameCandidates({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
    });

    expect(candidates).toHaveLength(11);
    expect(candidates[0]).toBe('jane-doe');
    expect(candidates[10]).toBe('jane-doe-10');
  });
});
