import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import {
  checkContentSignature,
  parseAllowedMimeTypes,
} from '../../../shared/content/file-signature';
import { DatabaseService } from '../../../shared/database/database.service';
import {
  ApplicationError,
  BadRequestApplicationError,
  ConflictApplicationError,
} from '../../../shared/errors/application.error';
import { ObjectStorage } from '../../../shared/storage/object-storage';
import { AssignmentConversationsService } from '../../assignment-conversations/assignment-conversations.service';
import {
  ChatAttachmentUploadConstraintsDto,
  ChatAttachmentUploadResponseDto,
} from '../dto/chat-attachment-response.dto';
import { toAttachmentUploadResponseDto } from '../chat-attachment-presentation';
import { ChatAttachmentScanQueue } from '../jobs/chat-attachment-scan.queue';

export type UploadedAttachmentFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
};

const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Upload-intent commands: validate before store, mirroring
 * `MaterialsService`. Scanning starts here, at intent time, not at message
 * send time -- that keeps `sendMessage` off the scan queue and protects its
 * durable-command latency target.
 */
@Injectable()
export class ChatAttachmentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly conversations: AssignmentConversationsService,
    private readonly storage: ObjectStorage,
    private readonly scanQueue: ChatAttachmentScanQueue,
  ) {}

  getUploadConstraints(): ChatAttachmentUploadConstraintsDto {
    return {
      maxBytes: this.config.get<number>('CHAT_ATTACHMENT_MAX_BYTES', 26_214_400),
      maxPerMessage: this.config.get<number>(
        'CHAT_ATTACHMENT_MAX_PER_MESSAGE',
        5,
      ),
      allowedMimeTypes: parseAllowedMimeTypes(
        this.config.get<string>('CHAT_ATTACHMENT_ALLOWED_MIME_TYPES', ''),
      ),
    };
  }

  async createUpload(input: {
    actor: AuthenticatedUser;
    conversationId: string;
    idempotencyKey: string;
    caption?: string;
    file: UploadedAttachmentFile;
  }): Promise<ChatAttachmentUploadResponseDto> {
    if (!this.isEnabled()) {
      throw new ApplicationError(
        'Chat attachments are not enabled',
        'CHAT_ATTACHMENTS_DISABLED',
        403,
      );
    }

    const participation = await this.conversations.getParticipation(
      input.actor.id,
      input.conversationId,
    );
    if (participation.status !== 'active') {
      throw new ConflictApplicationError(
        'This conversation is read-only',
        'ASSIGNMENT_CONVERSATION_READ_ONLY',
      );
    }

    await this.enforceRateLimit(input.actor.id);

    const content = this.validateContent(input.file);
    const attachmentId = randomUUID();
    const storageKey = this.buildStorageKey(input.conversationId, attachmentId);
    const stored = await this.storage.put(storageKey, input.file.buffer);

    const ttlSeconds = this.config.get<number>(
      'CHAT_ATTACHMENT_UPLOAD_INTENT_TTL_SECONDS',
      1800,
    );
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const caption = input.caption?.trim();

    let created;
    try {
      created = await this.database.chatAttachment.create({
        data: {
          id: attachmentId,
          conversation_id: input.conversationId,
          uploaded_by: input.actor.id,
          storage_key: storageKey,
          content_hash: stored.contentHash,
          byte_size: stored.byteSize,
          mime_type: content.mimeType,
          original_filename: this.boundedFilename(input.file.originalname),
          caption: caption || null,
          expires_at: expiresAt,
          idempotency_key: input.idempotencyKey,
        },
        select: {
          id: true,
          original_filename: true,
          byte_size: true,
          mime_type: true,
          scan_status: true,
          scan_error_code: true,
          expires_at: true,
        },
      });
    } catch (error) {
      // The bytes are already written, so a failed insert would otherwise
      // leave an object no row references.
      await this.storage.delete(storageKey);
      if (this.isUniqueConstraintError(error)) {
        return this.resolveIdempotentReplay(
          input.conversationId,
          input.actor.id,
          input.idempotencyKey,
          stored.contentHash,
        );
      }
      throw error;
    }

    // After commit: enqueueing inside the write would let a worker pick up a
    // job for a row not visible yet. Throws if the queue is disabled -- the
    // same deliberate choice as `MaterialScanQueue.enqueueScan`, because an
    // attachment never queued for a scan is quarantined forever.
    await this.scanQueue.enqueueScan({ attachmentId: created.id, attemptNumber: 1 });

    return toAttachmentUploadResponseDto(created);
  }

  private async resolveIdempotentReplay(
    conversationId: string,
    actorId: string,
    idempotencyKey: string,
    contentHash: string,
  ): Promise<ChatAttachmentUploadResponseDto> {
    const existing = await this.database.chatAttachment.findUnique({
      where: {
        conversation_id_uploaded_by_idempotency_key: {
          conversation_id: conversationId,
          uploaded_by: actorId,
          idempotency_key: idempotencyKey,
        },
      },
      select: {
        id: true,
        original_filename: true,
        byte_size: true,
        mime_type: true,
        scan_status: true,
        scan_error_code: true,
        expires_at: true,
        content_hash: true,
      },
    });
    if (existing && existing.content_hash === contentHash) {
      return toAttachmentUploadResponseDto(existing);
    }
    throw new ConflictApplicationError(
      'This attachment upload was already recorded with different content',
      'CHAT_ATTACHMENT_IDEMPOTENCY_CONFLICT',
    );
  }

  private async enforceRateLimit(actorId: string): Promise<void> {
    const limit = this.config.get<number>(
      'CHAT_ATTACHMENT_UPLOADS_PER_MINUTE',
      20,
    );
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const count = await this.database.chatAttachment.count({
      where: { uploaded_by: actorId, created_at: { gte: windowStart } },
    });
    if (count >= limit) {
      throw new ApplicationError(
        'Too many attachment uploads; try again shortly',
        'CHAT_ATTACHMENT_UPLOAD_RATE_LIMITED',
        429,
        { retryAfterSeconds: 60 },
      );
    }
  }

  private validateContent(file: UploadedAttachmentFile): { mimeType: string } {
    if (!file?.buffer?.length) {
      throw new BadRequestApplicationError(
        'Attachment file is required',
        'CHAT_ATTACHMENT_FILE_REQUIRED',
      );
    }
    const maxBytes = this.config.get<number>('CHAT_ATTACHMENT_MAX_BYTES', 26_214_400);
    if (file.buffer.byteLength > maxBytes) {
      throw new ApplicationError(
        `Attachment exceeds the configured size limit of ${maxBytes} bytes`,
        'CHAT_ATTACHMENT_TOO_LARGE',
        400,
        { maxBytes },
      );
    }
    const allowed = parseAllowedMimeTypes(
      this.config.get<string>('CHAT_ATTACHMENT_ALLOWED_MIME_TYPES', ''),
    );
    const check = checkContentSignature(file.mimetype, file.buffer, allowed);
    if (!check.ok) {
      // Distinguished on purpose, same reasoning as Materials: "we do not
      // accept this format" and "this is not the format you said it was"
      // are different problems for the sender.
      throw check.reason === 'unsupported_type'
        ? new ApplicationError(
            'Attachment format is not supported',
            'CHAT_ATTACHMENT_TYPE_UNSUPPORTED',
            400,
            { allowedMimeTypes: allowed },
          )
        : new BadRequestApplicationError(
            'Attachment content does not match its declared type',
            'CHAT_ATTACHMENT_CONTENT_MISMATCH',
          );
    }
    return { mimeType: check.mimeType };
  }

  /**
   * Generated, never derived from the filename -- same reasoning as
   * `LocalMaterialStorage.buildStorageKey`.
   */
  private buildStorageKey(conversationId: string, attachmentId: string): string {
    const prefix = this.config.get<string>(
      'S3_CHAT_ATTACHMENTS_KEY_PREFIX',
      'chat-attachments/',
    );
    return `${prefix}${conversationId}/${attachmentId}/${randomUUID()}`;
  }

  private boundedFilename(value: string): string {
    const trimmed = (value ?? '').trim();
    return trimmed.length > 255 ? trimmed.slice(0, 255) : trimmed || 'untitled';
  }

  private isEnabled(): boolean {
    const value = this.config.get<unknown>('CHAT_ATTACHMENTS_ENABLED', false);
    return value === true || value === 'true';
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
