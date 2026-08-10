import { NotificationPresenterService } from './notification-presenter.service';

describe('NotificationPresenterService', () => {
  const presenter = new NotificationPresenterService();
  const createdAt = new Date('2026-08-08T10:00:00.000Z');

  it('presents one retained semantic Application notification in the requested language', () => {
    const notification = {
      id: '11111111-1111-4111-8111-111111111111',
      type: 'application_status' as const,
      template_key: 'application.accepted',
      template_version: 1,
      parameters: {
        applicationId: '22222222-2222-4222-8222-222222222222',
        contributionRequestId: '33333333-3333-4333-8333-333333333333',
      },
      deep_link: '/applications/22222222-2222-4222-8222-222222222222',
      priority: 'attention' as const,
      is_read: false,
      read_at: null,
      created_at: createdAt,
      aggregate_version: 1,
    };

    expect(presenter.present(notification, 'en')).toEqual({
      notificationId: notification.id,
      type: 'application_status',
      templateKey: 'application.accepted',
      templateVersion: 1,
      title: 'Application accepted',
      body: 'Your Application was accepted and an Assignment was created.',
      deepLink: notification.deep_link,
      priority: 'attention',
      isRead: false,
      readAt: null,
      createdAt,
      aggregateVersion: 1,
    });

    expect(presenter.present(notification, 'ar')).toEqual({
      notificationId: notification.id,
      type: 'application_status',
      templateKey: 'application.accepted',
      templateVersion: 1,
      title: 'تم قبول طلب المساهمة',
      body: 'تم قبول طلب مساهمتك وإنشاء تكليف لك.',
      deepLink: notification.deep_link,
      priority: 'attention',
      isRead: false,
      readAt: null,
      createdAt,
      aggregateVersion: 1,
    });
  });

  it('uses localized safe copy for an unknown template version without exposing parameters', () => {
    const notification = {
      id: '44444444-4444-4444-8444-444444444444',
      type: 'system' as const,
      template_key: 'future.template',
      template_version: 99,
      parameters: {
        internalReason: 'must-never-be-returned',
      },
      deep_link: null,
      priority: 'ambient' as const,
      is_read: true,
      read_at: createdAt,
      created_at: createdAt,
      aggregate_version: 4,
    };

    expect(presenter.present(notification, 'ar')).toEqual({
      notificationId: notification.id,
      type: 'system',
      templateKey: 'future.template',
      templateVersion: 99,
      title: 'إشعار جديد',
      body: 'لديك تحديث جديد في شارك.',
      deepLink: null,
      priority: 'ambient',
      isRead: true,
      readAt: createdAt,
      createdAt,
      aggregateVersion: 4,
    });
  });

  it('repairs owner Application notification links to the owner review screen', () => {
    const notification = {
      id: '55555555-5555-4555-8555-555555555555',
      type: 'application_status' as const,
      template_key: 'application.submitted',
      template_version: 1,
      parameters: {
        applicationId: '66666666-6666-4666-8666-666666666666',
        contributionRequestId: '77777777-7777-4777-8777-777777777777',
      },
      deep_link: '/applications/66666666-6666-4666-8666-666666666666',
      priority: 'attention' as const,
      is_read: false,
      read_at: null,
      created_at: createdAt,
      aggregate_version: 1,
    };

    expect(presenter.present(notification, 'en', { audience: 'owner' })).toMatchObject({
      deepLink: '/contribution-requests/77777777-7777-4777-8777-777777777777',
    });
  });

  it('uses safe localized fallback copy when a retained template has invalid parameters', () => {
    const notification = {
      id: '88888888-8888-4888-8888-888888888888',
      type: 'skill_review' as const,
      template_key: 'skill_review.approved',
      template_version: 1,
      parameters: { internalReason: 'must-never-be-returned' },
      deep_link: '/settings?section=github',
      priority: 'attention' as const,
      is_read: false,
      read_at: null,
      created_at: createdAt,
      aggregate_version: 1,
    };

    expect(presenter.present(notification, 'en')).toMatchObject({
      title: 'New notification',
      body: 'You have a new update in Share-k.',
      deepLink: '/settings?section=github',
    });
    expect(presenter.present(notification, 'ar')).toMatchObject({
      title: 'إشعار جديد',
      body: 'لديك تحديث جديد في شارك.',
    });
  });
});
