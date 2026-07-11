import { UserRole, UserStatus } from '@prisma/client';

import {
  assertCanEnsureContributorProfile,
  getViewerRelationship,
  isContributorProfileVisible,
} from './contributor-profile.policy';

describe('contributor profile policy', () => {
  it.each([UserStatus.active, UserStatus.pending])(
    'allows %s contributors to ensure a profile',
    (status) => {
      expect(() =>
        assertCanEnsureContributorProfile({
          role: UserRole.contributor,
          status,
        }),
      ).not.toThrow();
    },
  );

  it.each([UserStatus.suspended, UserStatus.deactivated])(
    'blocks %s contributors from ensuring a profile',
    (status) => {
      expect(() =>
        assertCanEnsureContributorProfile({
          role: UserRole.contributor,
          status,
        }),
      ).toThrow('Contributor profile is not available');
    },
  );

  it.each([UserRole.owner, UserRole.admin])(
    'blocks %s accounts from ensuring contributor profiles',
    (role) => {
      expect(() =>
        assertCanEnsureContributorProfile({
          role,
          status: UserStatus.active,
        }),
      ).toThrow('Only contributors');
    },
  );

  it('hides inactive contributor profiles and resolves viewer relationship', () => {
    expect(
      isContributorProfileVisible({
        role: UserRole.contributor,
        status: UserStatus.deactivated,
      }),
    ).toBe(false);
    expect(getViewerRelationship('viewer-1', 'viewer-1')).toBe('owner');
    expect(getViewerRelationship('viewer-1', 'viewer-2')).toBe(
      'authenticated-viewer',
    );
  });
});
