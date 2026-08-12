import { ConfigService } from '@nestjs/config';
import { ApplicationAuditAction, ApplicationStatus } from '@prisma/client';

import { ApplicationReviewWindowService } from './application-review-window.service';

describe('ApplicationReviewWindowService', () => {
  const now = new Date('2026-08-05T12:00:00.000Z');
  const expiryCandidate = {
    id: '11111111-1111-4111-8111-111111111111',
    contribution_request_id: '22222222-2222-4222-8222-222222222222',
    contributor_id: '33333333-3333-4333-8333-333333333333',
    expires_at: now,
  };
  const reminderCandidate = {
    id: '44444444-4444-4444-8444-444444444444',
    contribution_request_id: '55555555-5555-4555-8555-555555555555',
  };

  function createFixture() {
    const database = {
      application: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      applicationAudit: { create: jest.fn() },
      ownerDecision: { create: jest.fn() },
      assignment: { create: jest.fn() },
      contributionRequest: { update: jest.fn(), updateMany: jest.fn() },
      reputationRecord: { update: jest.fn(), updateMany: jest.fn() },
      skillProfile: { update: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn(),
    };
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) =>
        callback(database),
    );
    const contributionTasks = {
      lockContributionRequestOwnerContext: jest
        .fn()
        .mockResolvedValue({ ownerId: '66666666-6666-4666-8666-666666666666' }),
    };
    const notifications = {
      createApplicationNotification: jest.fn(),
      emitApplicationNotifications: jest.fn(),
    };
    const config = new ConfigService({
      APPLICATION_REVIEW_SWEEP_BATCH_SIZE: 25,
    });
    const service = new ApplicationReviewWindowService(
      database as never,
      config,
      contributionTasks as never,
      notifications as never,
    );
    return { service, database, contributionTasks, notifications };
  }

  it('processes inclusive day-7 expiry before an inclusive day-3 reminder', async () => {
    const { service, database, contributionTasks, notifications } =
      createFixture();
    database.application.findMany
      .mockResolvedValueOnce([expiryCandidate])
      .mockResolvedValueOnce([reminderCandidate]);
    database.application.updateMany.mockResolvedValue({ count: 1 });
    database.applicationAudit.create.mockResolvedValue({});
    notifications.createApplicationNotification
      .mockResolvedValueOnce({
        created: true,
        notification: { notificationId: 'expiry-notification' },
      })
      .mockResolvedValueOnce({
        created: true,
        notification: { notificationId: 'reminder-notification' },
      });

    await expect(service.processDue(now)).resolves.toEqual({
      reminded: 1,
      expired: 1,
    });

    expect(database.application.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        status: ApplicationStatus.pending_owner_review,
        expires_at: { lte: now },
      },
      orderBy: [{ expires_at: 'asc' }, { id: 'asc' }],
      take: 25,
      select: {
        id: true,
        contribution_request_id: true,
        contributor_id: true,
        expires_at: true,
      },
    });
    expect(database.application.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        status: ApplicationStatus.pending_owner_review,
        review_due_at: { lte: now },
        review_reminder_sent_at: null,
        expires_at: { gt: now },
      },
      orderBy: [{ review_due_at: 'asc' }, { id: 'asc' }],
      take: 25,
      select: { id: true, contribution_request_id: true },
    });
    expect(database.application.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: expiryCandidate.id,
        status: ApplicationStatus.pending_owner_review,
        expires_at: { lte: now },
      },
      data: { status: ApplicationStatus.expired, expired_at: now },
    });
    expect(database.applicationAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        application_id: expiryCandidate.id,
        actor_id: null,
        action: ApplicationAuditAction.expired,
        from_status: ApplicationStatus.pending_owner_review,
        to_status: ApplicationStatus.expired,
        idempotency_key: `application-review-expiry:${expiryCandidate.id}`,
        metadata: {
          payloadVersion: 1,
          trigger: 'owner_review_window',
          expiredAt: now.toISOString(),
        },
      }),
    });
    expect(contributionTasks.lockContributionRequestOwnerContext).toHaveBeenCalledWith({
      requestId: reminderCandidate.contribution_request_id,
      transaction: database,
    });
    expect(notifications.createApplicationNotification).toHaveBeenNthCalledWith(
      1,
      {
        userId: expiryCandidate.contributor_id,
        applicationId: expiryCandidate.id,
        contributionRequestId: expiryCandidate.contribution_request_id,
        action: 'expired',
      },
      { transaction: database, emitRealtime: false },
    );
    expect(notifications.createApplicationNotification).toHaveBeenNthCalledWith(
      2,
      {
        userId: '66666666-6666-4666-8666-666666666666',
        applicationId: reminderCandidate.id,
        contributionRequestId: reminderCandidate.contribution_request_id,
        action: 'owner_review_reminder',
      },
      { transaction: database, emitRealtime: false },
    );
    expect(notifications.emitApplicationNotifications).toHaveBeenNthCalledWith(
      1,
      [{ notificationId: 'expiry-notification' }],
    );
    expect(notifications.emitApplicationNotifications).toHaveBeenNthCalledWith(
      2,
      [{ notificationId: 'reminder-notification' }],
    );
  });

  it('marks a due reminder without changing Application lifecycle fields', async () => {
    const { service, database, notifications } = createFixture();
    database.application.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([reminderCandidate]);
    database.application.updateMany.mockResolvedValue({ count: 1 });
    notifications.createApplicationNotification.mockResolvedValue({
      created: false,
      notification: null,
    });

    await expect(service.processDue(now)).resolves.toEqual({
      reminded: 1,
      expired: 0,
    });

    expect(database.application.updateMany).toHaveBeenCalledTimes(1);
    expect(database.application.updateMany).toHaveBeenCalledWith({
      where: {
        id: reminderCandidate.id,
        status: ApplicationStatus.pending_owner_review,
        review_due_at: { lte: now },
        review_reminder_sent_at: null,
        expires_at: { gt: now },
      },
      data: { review_reminder_sent_at: now },
    });
    expect(database.applicationAudit.create).not.toHaveBeenCalled();
  });

  it('expires only the due Application without changing decision-neutral state', async () => {
    const { service, database, notifications } = createFixture();
    const siblingId = '77777777-7777-4777-8777-777777777777';
    database.application.findMany
      .mockResolvedValueOnce([expiryCandidate])
      .mockResolvedValueOnce([]);
    database.application.updateMany.mockResolvedValue({ count: 1 });
    database.applicationAudit.create.mockResolvedValue({});
    notifications.createApplicationNotification.mockResolvedValue({
      created: false,
      notification: null,
    });

    await expect(service.processDue(now)).resolves.toEqual({
      reminded: 0,
      expired: 1,
    });

    expect(database.application.updateMany).toHaveBeenCalledTimes(1);
    expect(database.application.updateMany).toHaveBeenCalledWith({
      where: {
        id: expiryCandidate.id,
        status: ApplicationStatus.pending_owner_review,
        expires_at: { lte: now },
      },
      data: { status: ApplicationStatus.expired, expired_at: now },
    });
    expect(database.application.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: siblingId }),
      }),
    );
    expect(database.ownerDecision.create).not.toHaveBeenCalled();
    expect(database.assignment.create).not.toHaveBeenCalled();
    expect(database.contributionRequest.update).not.toHaveBeenCalled();
    expect(database.contributionRequest.updateMany).not.toHaveBeenCalled();
    expect(database.reputationRecord.update).not.toHaveBeenCalled();
    expect(database.reputationRecord.updateMany).not.toHaveBeenCalled();
    expect(database.skillProfile.update).not.toHaveBeenCalled();
    expect(database.skillProfile.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing immediately before persisted reminder and expiry boundaries', async () => {
    const { service, database, contributionTasks, notifications } =
      createFixture();
    const before = new Date(now.getTime() - 1);
    database.application.findMany.mockResolvedValue([]);

    await expect(service.processDue(before)).resolves.toEqual({
      reminded: 0,
      expired: 0,
    });
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(contributionTasks.lockContributionRequestOwnerContext).not.toHaveBeenCalled();
    expect(notifications.createApplicationNotification).not.toHaveBeenCalled();
  });

  it('processes persisted reminder and expiry boundaries immediately after they pass', async () => {
    const { service, database, notifications } = createFixture();
    const after = new Date(now.getTime() + 1);
    database.application.findMany
      .mockResolvedValueOnce([expiryCandidate])
      .mockResolvedValueOnce([reminderCandidate]);
    database.application.updateMany.mockResolvedValue({ count: 1 });
    database.applicationAudit.create.mockResolvedValue({});
    notifications.createApplicationNotification
      .mockResolvedValueOnce({
        created: true,
        notification: { notificationId: 'expiry-notification' },
      })
      .mockResolvedValueOnce({
        created: true,
        notification: { notificationId: 'reminder-notification' },
      });

    await expect(service.processDue(after)).resolves.toEqual({
      reminded: 1,
      expired: 1,
    });
    expect(database.application.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ expires_at: { lte: after } }),
      }),
    );
    expect(database.application.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ review_due_at: { lte: after } }),
      }),
    );
  });

  it('rechecks pending state so a decision racing expiry wins without stale effects', async () => {
    const { service, database, notifications } = createFixture();
    database.application.findMany
      .mockResolvedValueOnce([expiryCandidate])
      .mockResolvedValueOnce([]);
    database.application.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.processDue(now)).resolves.toEqual({
      reminded: 0,
      expired: 0,
    });
    expect(database.applicationAudit.create).not.toHaveBeenCalled();
    expect(notifications.createApplicationNotification).not.toHaveBeenCalled();
    expect(notifications.emitApplicationNotifications).not.toHaveBeenCalled();
  });

  it('is idempotent when the same candidates are delivered more than once', async () => {
    const { service, database, notifications } = createFixture();
    database.application.findMany
      .mockResolvedValueOnce([expiryCandidate])
      .mockResolvedValueOnce([reminderCandidate])
      .mockResolvedValueOnce([expiryCandidate])
      .mockResolvedValueOnce([reminderCandidate]);
    database.application.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    database.applicationAudit.create.mockResolvedValue({});
    notifications.createApplicationNotification
      .mockResolvedValueOnce({
        created: true,
        notification: { notificationId: 'expiry-notification' },
      })
      .mockResolvedValueOnce({
        created: true,
        notification: { notificationId: 'reminder-notification' },
      });

    await expect(service.processDue(now)).resolves.toEqual({
      reminded: 1,
      expired: 1,
    });
    await expect(service.processDue(now)).resolves.toEqual({
      reminded: 0,
      expired: 0,
    });
    expect(database.applicationAudit.create).toHaveBeenCalledTimes(1);
    expect(notifications.createApplicationNotification).toHaveBeenCalledTimes(2);
    expect(notifications.emitApplicationNotifications).toHaveBeenCalledTimes(2);
  });

  it('can retry safely after a failed transaction', async () => {
    const { service, database, notifications } = createFixture();
    database.application.findMany
      .mockResolvedValueOnce([expiryCandidate])
      .mockResolvedValueOnce([expiryCandidate])
      .mockResolvedValueOnce([]);
    database.$transaction
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockImplementation(
        (callback: (transaction: typeof database) => unknown) =>
          callback(database),
      );
    database.application.updateMany.mockResolvedValue({ count: 1 });
    database.applicationAudit.create.mockResolvedValue({});
    notifications.createApplicationNotification.mockResolvedValue({
      created: true,
      notification: { notificationId: 'expiry-notification' },
    });

    await expect(service.processDue(now)).rejects.toThrow('database unavailable');
    await expect(service.processDue(now)).resolves.toEqual({
      reminded: 0,
      expired: 1,
    });
    expect(database.applicationAudit.create).toHaveBeenCalledTimes(1);
    expect(notifications.createApplicationNotification).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid controlled clock before querying', async () => {
    const { service, database } = createFixture();
    await expect(service.processDue(new Date('invalid'))).rejects.toThrow(
      'Application review sweep requires a valid clock value',
    );
    expect(database.application.findMany).not.toHaveBeenCalled();
  });
});
