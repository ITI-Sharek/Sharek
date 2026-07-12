import {
  assertCanEnsureContributorProfile,
  getViewerRelationship,
  isContributorProfileVisible,
} from './contributor-profile.policy';

describe('contributor profile policy', () => {
  it.each(['active', 'pending'] as const)(
    'allows %s contributors to ensure a profile',
    (status) => {
      expect(() =>
        assertCanEnsureContributorProfile({
          role: 'contributor',
          status,
        }),
      ).not.toThrow();
    },
  );

  it.each(['suspended', 'deactivated'] as const)(
    'blocks %s contributors from ensuring a profile',
    (status) => {
      expect(() =>
        assertCanEnsureContributorProfile({
          role: 'contributor',
          status,
        }),
      ).toThrow('Contributor profile is not available');
    },
  );

  it.each(['owner', 'admin'] as const)(
    'blocks %s accounts from ensuring contributor profiles',
    (role) => {
      expect(() =>
        assertCanEnsureContributorProfile({
          role,
          status: 'active',
        }),
      ).toThrow('Only contributors');
    },
  );

  it('hides inactive contributor profiles and resolves viewer relationship', () => {
    expect(
      isContributorProfileVisible({
        role: 'contributor',
        status: 'deactivated',
      }),
    ).toBe(false);
    expect(getViewerRelationship('viewer-1', 'viewer-1')).toBe('owner');
    expect(getViewerRelationship('viewer-1', 'viewer-2')).toBe(
      'authenticated-viewer',
    );
  });
});
