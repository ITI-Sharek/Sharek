import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { createApplicationValidationPipe } from '../../shared/validation/application-validation.pipe';
import { AssignmentConversationsController } from './assignment-conversations.controller';
import { AssignmentConversationsService } from './assignment-conversations.service';

interface TestRequest {
  headers?: { authorization?: string };
  user?: Record<string, unknown>;
}

describe('AssignmentConversationsController', () => {
  let app: INestApplication;
  const service = {
    listForActor: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    getForActor: jest.fn().mockResolvedValue({ conversationId: 'id' }),
    listMessages: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    sendMessage: jest.fn().mockResolvedValue({ messageId: 'message-id' }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AssignmentConversationsController],
      providers: [{ provide: AssignmentConversationsService, useValue: service }],
    })
      .overrideGuard(AccessTokenGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => TestRequest };
        }) => {
          const request = context.switchToHttp().getRequest();
          if (!request.headers?.authorization) throw new UnauthorizedException();
          request.user = {
            id: '11111111-1111-4111-8111-111111111111',
            email: 'owner@example.com',
            role: 'owner',
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

  beforeEach(() => jest.clearAllMocks());

  it('requires authentication and scopes reads to the current actor', async () => {
    await request(app.getHttpServer()).get('/assignment-conversations').expect(401);
    await request(app.getHttpServer())
      .get('/assignment-conversations?limit=2')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(service.listForActor).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ limit: 2 }),
    );
  });

  it('rejects malformed conversation identifiers and forwards message commands', async () => {
    await request(app.getHttpServer())
      .get('/assignment-conversations/not-a-uuid')
      .set('Authorization', 'Bearer token')
      .expect(400);
    await request(app.getHttpServer())
      .post('/assignment-conversations/55555555-5555-4555-8555-555555555555/messages')
      .set('Authorization', 'Bearer token')
      .send({ idempotencyKey: 'message-http-1', body: 'Hello' })
      .expect(201);

    expect(service.sendMessage).toHaveBeenCalledWith({
      actor: expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111' }),
      conversationId: '55555555-5555-4555-8555-555555555555',
      body: 'Hello',
      idempotencyKey: 'message-http-1',
      replyToMessageId: undefined,
    });
  });
});
