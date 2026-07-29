import {
  APPLICATION_REVIEW_EXPIRY_DAYS,
  APPLICATION_REVIEW_OVERDUE_DAYS,
  APPLICATION_REVIEW_REMINDER_DAYS,
} from './application-review-window.policy';

describe('Application review-window policy', () => {
  it('exposes the approved reminder, overdue, and expiry boundaries', () => {
    expect({
      reminderDays: APPLICATION_REVIEW_REMINDER_DAYS,
      overdueDays: APPLICATION_REVIEW_OVERDUE_DAYS,
      expiryDays: APPLICATION_REVIEW_EXPIRY_DAYS,
    }).toEqual({ reminderDays: 3, overdueDays: 5, expiryDays: 7 });
  });
});
