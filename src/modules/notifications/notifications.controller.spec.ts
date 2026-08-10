import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { createApplicationValidationPipe } from '../../shared/validation/application-validation.pipe';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationsController } from './notifications.controller';

interface TestRequest {
  headers?: { authorization?: string };
  user?: Record<string, unknown>;
}

describe('NotificationsController', () => {
  let app: INestApplication;
  const inbox = {
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    unreadCount: jest.fn().mockResolvedValue({ unreadCount: 0 }),
    setReadState: jest.fn().mockResolvedValue({ notificationId: 'id' }),
    markAllRead: jest.fn().mockResolvedValue({
      updatedCount: 0,
      snapshotAt: '2026-08-08T10:00:00.000Z',
    }),
  };
  const preferences = {
    get: jest.fn().mockResolvedValue({ revision: 1 }),
    update: jest.fn().mockResolvedValue({ revision: 2 }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationInboxService, useValue: inbox },
        { provide: NotificationPreferencesService, useValue: preferences },
      ],
    })
      .overrideProvider(NotificationInboxService)
      .useValue(inbox)
      .overrideProvider(NotificationPreferencesService)
      .useValue(preferences)
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: { switchToHttp: () => { getRequest: () => TestRequest } }) => {
          const request = context.switchToHttp().getRequest();
          if (request.headers && !request.headers.authorization) {
            throw new UnauthorizedException();
          }
          request.user = {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'user@example.com',
            role: 'contributor',
            status: 'active',
          };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(createApplicationValidationPipe());
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires authentication and scopes list/count to the current user', async () => {
    await request(app.getHttpServer()).get('/notifications').expect(401);
    await request(app.getHttpServer())
      .get('/notifications?limit=2&readState=unread&type=application_status')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(inbox.list).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ limit: 2, readState: 'unread', type: 'application_status' }),
    );
  });

  it('rejects malformed UUIDs and forwards read, mark-all, and preference commands', async () => {
    await request(app.getHttpServer())
      .patch('/notifications/not-a-uuid/read-state')
      .set('Authorization', 'Bearer token')
      .send({ state: 'read' })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/notifications/22222222-2222-4222-8222-222222222222/read-state')
      .set('Authorization', 'Bearer token')
      .send({ state: 'read' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/notifications/mark-all-read')
      .set('Authorization', 'Bearer token')
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .patch('/me/notification-preferences')
      .set('Authorization', 'Bearer token')
      .send({ expectedRevision: 1, retentionDays: 180 })
      .expect(200);

    expect(inbox.setReadState).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'read',
    );
    expect(inbox.markAllRead).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(preferences.update).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ expectedRevision: 1, retentionDays: 180 }),
    );
  });
});
