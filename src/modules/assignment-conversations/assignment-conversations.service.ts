import { Injectable, Optional } from '@nestjs/common';
import {
  AssignmentConversationStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { DatabaseService } from '../../shared/database/database.service';
import {
  BadRequestApplicationError,
  ConflictApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';
import {
  decodeConversationCursor,
  decodeConversationListCursor,
  encodeConversationCursor,
  encodeConversationListCursor,
} from './assignment-conversation-cursor';
import {
  AssignmentConversationListResponseDto,
  AssignmentConversationResponseDto,
  MessageListResponseDto,
  MessageResponseDto,
} from './dto/assignment-conversation-response.dto';
import {
  AssignmentConversationQueryDto,
  AssignmentMessageQueryDto,
} from './dto/assignment-conversation-query.dto';
import { AssignmentConversationRealtimeService } from './assignment-conversation-realtime.service';
import { NotificationsService } from '../notifications/notifications.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_MESSAGE_LENGTH = 4000;

const CONVERSATION_AUTHORIZATION_SELECT = {
  id: true,
  assignment_id: true,
  status: true,
  aggregate_version: true,
  created_at: true,
  updated_at: true,
  assignment: {
    select: {
      contributor_id: true,
      contributor: { select: { first_name: true, last_name: true } },
      contributionRequest: {
        select: {
          owner_id: true,
          owner: { select: { first_name: true, last_name: true } },
        },
      },
    },
  },
} satisfies Prisma.AssignmentConversationSelect;

const MESSAGE_SELECT = {
  id: true,
  conversation_id: true,
  sequence: true,
  sender_id: true,
  body: true,
  reply_to_message_id: true,
  created_at: true,
  edited_at: true,
  retracted_at: true,
  sender: { select: { first_name: true, last_name: true } },
} satisfies Prisma.MessageSelect;

type AuthorizedConversation = Prisma.AssignmentConversationGetPayload<{
  select: typeof CONVERSATION_AUTHORIZATION_SELECT;
}>;

type MessageRecord = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

@Injectable()
export class AssignmentConversationsService {
  constructor(
    private readonly database: DatabaseService,
    @Optional()
    private readonly realtime?: AssignmentConversationRealtimeService,
    @Optional()
    private readonly notifications?: NotificationsService,
  ) {}

  async ensureForAssignment(input: {
    assignmentId: string;
    transaction: Prisma.TransactionClient;
  }): Promise<{ conversationId: string }> {
    const conversation = await input.transaction.assignmentConversation.upsert({
      where: { assignment_id: input.assignmentId },
      create: { assignment_id: input.assignmentId },
      update: {},
      select: { id: true },
    });
    return { conversationId: conversation.id };
  }

  async listForActor(
    actorId: string,
    query: AssignmentConversationQueryDto = {},
  ): Promise<AssignmentConversationListResponseDto> {
    const limit = this.pageSize(query.limit);
    const cursor = query.cursor
      ? decodeConversationListCursor(query.cursor)
      : undefined;
    const conversations = await this.database.assignmentConversation.findMany({
      where: {
        assignment: {
          OR: [
            { contributor_id: actorId },
            { contributionRequest: { owner_id: actorId } },
          ],
        },
        ...(cursor
          ? {
              OR: [
                { updated_at: { lt: cursor.updatedAt } },
                {
                  updated_at: cursor.updatedAt,
                  id: { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: CONVERSATION_AUTHORIZATION_SELECT,
    });
    const page = conversations.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((conversation) => this.toConversationDto(conversation)),
      nextCursor: conversations.length > limit && last
        ? encodeConversationListCursor({ updatedAt: last.updated_at, id: last.id })
        : null,
    };
  }

  async getForActor(
    actorId: string,
    conversationId: string,
  ): Promise<AssignmentConversationResponseDto> {
    const conversation = await this.findAuthorizedConversation(
      this.database,
      actorId,
      conversationId,
    );
    return this.toConversationDto(conversation);
  }

  async listMessages(
    actorId: string,
    conversationId: string,
    query: AssignmentMessageQueryDto = {},
  ): Promise<MessageListResponseDto> {
    await this.findAuthorizedConversation(this.database, actorId, conversationId);
    const limit = this.pageSize(query.limit);
    const cursor = query.cursor
      ? decodeConversationCursor(query.cursor)
      : undefined;
    const messages = await this.database.message.findMany({
      where: {
        conversation_id: conversationId,
        ...(query.query
          ? { body: { contains: query.query, mode: 'insensitive' } }
          : {}),
        ...(cursor
          ? {
              OR: [
                { sequence: { lt: cursor.sequence } },
                { sequence: cursor.sequence, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ sequence: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: MESSAGE_SELECT,
    });
    const page = messages.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((message) => this.toMessageDto(message)),
      nextCursor: messages.length > limit && last
        ? encodeConversationCursor({ sequence: last.sequence, id: last.id })
        : null,
    };
  }

  async sendMessage(input: {
    actor: AuthenticatedUser;
    conversationId: string;
    body: string;
    idempotencyKey: string;
    replyToMessageId?: string;
  }): Promise<MessageResponseDto> {
    const body = input.body.trim();
    if (!body) {
      throw new BadRequestApplicationError(
        'Message body is required',
        'MESSAGE_BODY_REQUIRED',
      );
    }
    if ([...body].length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestApplicationError(
        'Message body is too long',
        'MESSAGE_TOO_LONG',
      );
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const persisted = await this.database.$transaction(async (transaction) => {
          const conversation = await this.findAuthorizedConversation(
            transaction,
            input.actor.id,
            input.conversationId,
          );
          if (conversation.status !== AssignmentConversationStatus.active) {
            throw new ConflictApplicationError(
              'This conversation is read-only',
              'ASSIGNMENT_CONVERSATION_READ_ONLY',
            );
          }

          const existing = await transaction.message.findUnique({
            where: {
              conversation_id_sender_id_idempotency_key: {
                conversation_id: input.conversationId,
                sender_id: input.actor.id,
                idempotency_key: input.idempotencyKey,
              },
            },
            select: MESSAGE_SELECT,
          });
          if (existing) {
            if (existing.body !== body) {
              throw new ConflictApplicationError(
                'Message idempotency key was already used with another body',
                'MESSAGE_IDEMPOTENCY_CONFLICT',
              );
            }
            return { message: this.toMessageDto(existing), eventId: null, notificationId: null };
          }

          const updated = await transaction.assignmentConversation.updateMany({
            where: {
              id: input.conversationId,
              status: AssignmentConversationStatus.active,
              aggregate_version: conversation.aggregate_version,
            },
            data: { aggregate_version: { increment: 1 } },
          });
          if (updated.count !== 1) throw new ConcurrentMessageMutation();

          const message = await transaction.message.create({
            data: {
              id: randomUUID(),
              conversation_id: input.conversationId,
              sequence: conversation.aggregate_version,
              sender_id: input.actor.id,
              body,
              idempotency_key: input.idempotencyKey,
              reply_to_message_id: input.replyToMessageId,
            },
            select: MESSAGE_SELECT,
          });
          const event = await transaction.messageEvent.create({
            data: {
              message_id: message.id,
              conversation_id: message.conversation_id,
              event_type: 'created',
              aggregate_version: message.sequence,
            },
            select: { id: true },
          });
          const ownerId = conversation.assignment.contributionRequest.owner_id;
          const contributorId = conversation.assignment.contributor_id;
          const senderIsOwner = input.actor.id === ownerId;
          const recipientId = senderIsOwner ? contributorId : ownerId;
          const senderName = senderIsOwner
            ? this.displayName(
                conversation.assignment.contributionRequest.owner,
                ownerId,
              )
            : this.displayName(conversation.assignment.contributor, contributorId);
          const conversationNotification = this.notifications
            ? await this.notifications.createConversationActivityNotification(
                {
                  userId: recipientId,
                  conversationId: message.conversation_id,
                  messageId: message.id,
                  senderName,
                  messagePreview: body.slice(0, 240),
                },
                { transaction, emitRealtime: false },
              )
            : undefined;
          return {
            message: this.toMessageDto(message),
            eventId: event.id,
            notificationId: conversationNotification &&
              (conversationNotification.created || conversationNotification.updated === true)
              ? conversationNotification.notificationId
              : null,
          };
        });

        const publications: Promise<unknown>[] = [];
        if (persisted.eventId) {
          publications.push(
            Promise.resolve(this.realtime?.publishCreated(persisted.eventId)),
          );
        }
        if (persisted.notificationId && this.notifications) {
          publications.push(
            this.notifications.emitNotificationCreated(persisted.notificationId),
          );
        }
        try {
          await Promise.all(publications);
        } catch {
          // The committed Message, Notification, and outbox events remain authoritative.
        }
        return persisted.message;
      } catch (error) {
        if (error instanceof ConcurrentMessageMutation) continue;
        if (this.isUniqueConstraintError(error)) continue;
        throw error;
      }
    }

    throw new ConflictApplicationError(
      'Message changed concurrently; retry the command',
      'MESSAGE_CONCURRENT_UPDATE',
    );
  }

  private async findAuthorizedConversation(
    database: Pick<Prisma.TransactionClient, 'assignmentConversation'>,
    actorId: string,
    conversationId: string,
  ): Promise<AuthorizedConversation> {
    const conversation = await database.assignmentConversation.findFirst({
      where: {
        id: conversationId,
        assignment: {
          OR: [
            { contributor_id: actorId },
            { contributionRequest: { owner_id: actorId } },
          ],
        },
      },
      select: CONVERSATION_AUTHORIZATION_SELECT,
    });
    if (!conversation) {
      throw new NotFoundApplicationError(
        'Assignment conversation was not found',
        'ASSIGNMENT_CONVERSATION_NOT_FOUND',
      );
    }
    return conversation;
  }

  private toConversationDto(
    conversation: AuthorizedConversation,
  ): AssignmentConversationResponseDto {
    return {
      conversationId: conversation.id,
      assignmentId: conversation.assignment_id,
      status: conversation.status,
      ownerId: conversation.assignment.contributionRequest.owner_id,
      ownerName: this.displayName(
        conversation.assignment.contributionRequest.owner,
        conversation.assignment.contributionRequest.owner_id,
      ),
      contributorId: conversation.assignment.contributor_id,
      contributorName: this.displayName(
        conversation.assignment.contributor,
        conversation.assignment.contributor_id,
      ),
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
    };
  }

  private toMessageDto(message: MessageRecord): MessageResponseDto {
    return {
      messageId: message.id,
      conversationId: message.conversation_id,
      sequence: message.sequence,
      senderId: message.sender_id,
      senderName: this.displayName(message.sender, message.sender_id),
      body: message.body,
      replyToMessageId: message.reply_to_message_id,
      createdAt: message.created_at,
      editedAt: message.edited_at,
      retractedAt: message.retracted_at,
    };
  }

  private displayName(
    user: { first_name: string; last_name: string } | undefined,
    fallback: string,
  ): string {
    const name = user
      ? `${user.first_name} ${user.last_name}`.trim()
      : '';
    return name || fallback;
  }

  private pageSize(limit: number | undefined): number {
    const value = limit ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new BadRequestApplicationError(
        'Conversation page size is invalid',
        'ASSIGNMENT_CONVERSATION_LIMIT_INVALID',
      );
    }
    return value;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}

class ConcurrentMessageMutation extends Error {}
