import {
  ApplicationStatus,
  ContributionRequestStatus,
} from '@prisma/client';

import {
  ConflictApplicationError,
  ForbiddenApplicationError,
} from '../../../shared/errors/application.error';
import { ApplicationRequestContextDto } from '../../contribution-tasks/dto/application-request-context.dto';
import {
  assertOwnerDecisionWindowOpen,
  assertPendingOwnerDecision,
  assertRequestAcceptsApplications,
} from './application-window.policy';

const now = new Date('2026-01-10T00:00:00.000Z');

function context(
  overrides: Partial<ApplicationRequestContextDto> = {},
): ApplicationRequestContextDto {
  return {
    status: ContributionRequestStatus.published,
    applicationsCloseAt: new Date('2026-01-20T00:00:00.000Z'),
    ...overrides,
  } as unknown as ApplicationRequestContextDto;
}

describe('assertRequestAcceptsApplications', () => {
  it('admits a published Request whose close time is still ahead', () => {
    expect(() =>
      assertRequestAcceptsApplications(context(), now),
    ).not.toThrow();
  });

  it('refuses a missing or draft Request with 403 APPLICATION_NOT_AUTHORIZED', () => {
    for (const value of [
      null,
      context({ status: ContributionRequestStatus.draft }),
    ]) {
      try {
        assertRequestAcceptsApplications(value, now);
        throw new Error('expected a throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenApplicationError);
        expect((error as ForbiddenApplicationError).statusCode).toBe(403);
        expect((error as ForbiddenApplicationError).code).toBe(
          'APPLICATION_NOT_AUTHORIZED',
        );
      }
    }
  });

  it('maps a cancelled Request to REQUEST_CANCELLED', () => {
    expect(() =>
      assertRequestAcceptsApplications(
        context({ status: ContributionRequestStatus.cancelled }),
        now,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'REQUEST_CANCELLED',
        statusCode: 409,
      }),
    );
  });

  it('maps a terminal non-published Request to REQUEST_TERMINAL with its status', () => {
    try {
      assertRequestAcceptsApplications(
        context({ status: 'closed' as ContributionRequestStatus }),
        now,
      );
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictApplicationError);
      const conflict = error as ConflictApplicationError;
      expect(conflict.code).toBe('REQUEST_TERMINAL');
      expect(conflict.metadata).toEqual({
        status: 'closed' as ContributionRequestStatus,
      });
    }
  });

  it('refuses a Request with no close time or a passed close time', () => {
    for (const closeAt of [null, now, new Date('2026-01-09T23:59:59.999Z')]) {
      expect(() =>
        assertRequestAcceptsApplications(
          context({ applicationsCloseAt: closeAt }),
          now,
        ),
      ).toThrowError(
        expect.objectContaining({ code: 'APPLICATIONS_CLOSED' }),
      );
    }
  });
});

describe('assertPendingOwnerDecision', () => {
  it('admits only a pending Application', () => {
    expect(() =>
      assertPendingOwnerDecision(ApplicationStatus.pending_owner_review),
    ).not.toThrow();

    expect(() =>
      assertPendingOwnerDecision(ApplicationStatus.accepted),
    ).toThrowError(
      expect.objectContaining({
        code: 'APPLICATION_TERMINAL',
        metadata: { status: ApplicationStatus.accepted },
      }),
    );
  });
});

describe('assertOwnerDecisionWindowOpen', () => {
  it('admits a null or future expiry and refuses an elapsed one as expired', () => {
    expect(() => assertOwnerDecisionWindowOpen(null, now)).not.toThrow();
    expect(() =>
      assertOwnerDecisionWindowOpen(
        new Date('2026-01-11T00:00:00.000Z'),
        now,
      ),
    ).not.toThrow();

    for (const expired of [now, new Date('2026-01-09T00:00:00.000Z')]) {
      expect(() => assertOwnerDecisionWindowOpen(expired, now)).toThrowError(
        expect.objectContaining({
          code: 'APPLICATION_TERMINAL',
          metadata: { status: ApplicationStatus.expired },
        }),
      );
    }
  });
});
