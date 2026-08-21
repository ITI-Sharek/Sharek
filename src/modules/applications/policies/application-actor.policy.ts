import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { ForbiddenApplicationError } from '../../../shared/errors/application.error';

export function assertActiveContributor(actor: AuthenticatedUser): void {
  if (actor.status !== 'active' || actor.role !== 'contributor') {
    throw new ForbiddenApplicationError(
      'An active contributor account is required',
      'APPLICATION_NOT_AUTHORIZED',
    );
  }
}

export function assertActiveOwner(actor: AuthenticatedUser): void {
  if (actor.status !== 'active' || actor.role !== 'owner') {
    throw new ForbiddenApplicationError(
      'An active Project owner account is required',
      'APPLICATION_NOT_AUTHORIZED',
    );
  }
}

export function assertActiveApplicationActor(actor: AuthenticatedUser): void {
  if (
    actor.status !== 'active' ||
    (actor.role !== 'owner' && actor.role !== 'contributor')
  ) {
    throw new ForbiddenApplicationError(
      'Application access is not authorized',
      'APPLICATION_NOT_AUTHORIZED',
    );
  }
}
