import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * The only thing `AssignmentConversationsService.sendMessage` calls directly.
 * Exported alone from this module, per the backend module-boundary
 * convention: every other chat-attachments service stays internal.
 */
@Injectable()
export class ChatAttachmentBindingService {
  /**
   * One conditional claim that enforces every intent rule at once --
   * conversation-scoped, owner-scoped, single-use, unexpired, unpurged -- and
   * is what makes a concurrent double-send safe. Must run inside the caller's
   * own transaction, after `message.create` (the message id is required) and
   * before the outbox `messageEvent.create`.
   */
  async bindToMessage(input: {
    transaction: Prisma.TransactionClient;
    conversationId: string;
    actorId: string;
    attachmentIds: string[];
    messageId: string;
    now: Date;
  }): Promise<{ boundCount: number }> {
    if (input.attachmentIds.length === 0) return { boundCount: 0 };

    const bound = await input.transaction.chatAttachment.updateMany({
      where: {
        id: { in: input.attachmentIds },
        conversation_id: input.conversationId,
        uploaded_by: input.actorId,
        message_id: null,
        purged_at: null,
        expires_at: { gt: input.now },
      },
      data: { message_id: input.messageId, bound_at: input.now },
    });
    return { boundCount: bound.count };
  }

  /** Used to detect an idempotent replay requesting a different attachment set. */
  async findBoundAttachmentIds(
    database: Pick<Prisma.TransactionClient, 'chatAttachment'>,
    messageId: string,
  ): Promise<string[]> {
    const rows = await database.chatAttachment.findMany({
      where: { message_id: messageId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
