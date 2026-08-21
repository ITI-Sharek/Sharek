import { ApplicationStatus, ContributionRequestStatus } from '@prisma/client';

import { ConflictApplicationError, ForbiddenApplicationError } from '../../../shared/errors/application.error';
import { ApplicationRequestContextDto } from '../../contribution-tasks/dto/application-request-context.dto';

export function assertRequestAcceptsApplications(
  context: ApplicationRequestContextDto | null,
  now: Date,
): asserts context is ApplicationRequestContextDto {
  if (!context || context.status === ContributionRequestStatus.draft) {
    throw new ForbiddenApplicationError(
      'This Contribution Request is not available for Applications',
      'APPLICATION_NOT_AUTHORIZED',
    );
  }
  if (context.status === ContributionRequestStatus.cancelled) {
    throw new ConflictApplicationError(
      'The Contribution Request was cancelled',
      'REQUEST_CANCELLED',
    );
  }
  if (context.status !== ContributionRequestStatus.published) {
    throw new ConflictApplicationError(
      'The Contribution Request no longer accepts Applications',
      'REQUEST_TERMINAL',
      { status: context.status },
    );
  }
  if (!context.applicationsCloseAt || context.applicationsCloseAt <= now) {
    throw new ConflictApplicationError(
      'Applications Close Time has passed',
      'APPLICATIONS_CLOSED',
    );
  }
}

export function assertPendingOwnerDecision(status: ApplicationStatus): void {
  if (status !== ApplicationStatus.pending_owner_review) {
    throw new ConflictApplicationError(
      'Only a pending Application can receive an Owner Decision',
      'APPLICATION_TERMINAL',
      { status },
    );
  }
}

export function assertOwnerDecisionWindowOpen(
  expiresAt: Date | null,
  now: Date,
): void {
  if (expiresAt !== null && expiresAt <= now) {
    throw new ConflictApplicationError(
      'Only a pending Application can receive an Owner Decision',
      'APPLICATION_TERMINAL',
      { status: ApplicationStatus.expired },
    );
  }
}
