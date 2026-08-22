import { AssignmentConversationStatus } from '@prisma/client';

import { ChatAttachmentSummaryDto } from '../../chat-attachments/dto/chat-attachment-response.dto';

export interface AssignmentConversationResponseDto {
  conversationId: string;
  assignmentId: string;
  status: AssignmentConversationStatus;
  ownerId: string;
  ownerName: string;
  contributorId: string;
  contributorName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageResponseDto {
  messageId: string;
  conversationId: string;
  sequence: number;
  senderId: string;
  senderName: string;
  body: string;
  replyToMessageId: string | null;
  createdAt: Date;
  editedAt: Date | null;
  retractedAt: Date | null;
  attachments: ChatAttachmentSummaryDto[];
}

export interface AssignmentConversationListResponseDto {
  items: AssignmentConversationResponseDto[];
  nextCursor: string | null;
}

export interface MessageListResponseDto {
  items: MessageResponseDto[];
  nextCursor: string | null;
}
