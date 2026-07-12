import { ForbiddenApplicationError } from '../../../../shared/errors/application.error';

export type ContributorProfileRole = 'owner' | 'contributor' | 'admin';
export type ContributorProfileUserStatus =
  | 'pending'
  | 'active'
  | 'suspended'
  | 'deactivated';
export type ViewerRelationship = 'owner' | 'authenticated-viewer';

export function assertCanEnsureContributorProfile(user: {
  role: ContributorProfileRole;
  status: ContributorProfileUserStatus;
}): void {
  if (user.role !== 'contributor') {
    throw new ForbiddenApplicationError(
      'Only contributors can create contributor profiles',
      'CONTRIBUTOR_PROFILE_FORBIDDEN',
    );
  }

  if (user.status !== 'active' && user.status !== 'pending') {
    throw new ForbiddenApplicationError(
      'Contributor profile is not available for this account',
      'CONTRIBUTOR_PROFILE_FORBIDDEN',
    );
  }
}

export function isContributorProfileVisible(user: {
  role: ContributorProfileRole;
  status: ContributorProfileUserStatus;
}): boolean {
  return (
    user.role === 'contributor' &&
    (user.status === 'active' || user.status === 'pending')
  );
}

export function getViewerRelationship(
  viewerUserId: string,
  profileUserId: string,
): ViewerRelationship {
  return viewerUserId === profileUserId ? 'owner' : 'authenticated-viewer';
}
