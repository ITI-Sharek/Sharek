import { BadRequestApplicationError } from '../../shared/errors/application.error';

export interface MessageCursor {
  sequence: number;
  id: string;
}

export interface ConversationListCursor {
  updatedAt: Date;
  id: string;
}

export function encodeConversationCursor(cursor: MessageCursor): string {
  return Buffer.from(
    JSON.stringify({ v: 1, sequence: cursor.sequence, id: cursor.id }),
  ).toString('base64url');
}

export function decodeConversationCursor(value: string): MessageCursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid characters');
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      v?: unknown;
      sequence?: unknown;
      id?: unknown;
    };
    if (
      parsed.v !== 1 ||
      typeof parsed.sequence !== 'number' ||
      !Number.isSafeInteger(parsed.sequence) ||
      parsed.sequence < 1 ||
      typeof parsed.id !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(parsed.id)
    ) {
      throw new Error('invalid shape');
    }
    return { sequence: parsed.sequence, id: parsed.id };
  } catch {
    throw new BadRequestApplicationError(
      'Conversation cursor is invalid',
      'ASSIGNMENT_CONVERSATION_CURSOR_INVALID',
    );
  }
}

export function encodeConversationListCursor(
  cursor: ConversationListCursor,
): string {
  return Buffer.from(
    JSON.stringify({ v: 1, updatedAt: cursor.updatedAt.toISOString(), id: cursor.id }),
  ).toString('base64url');
}

export function decodeConversationListCursor(
  value: string,
): ConversationListCursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid characters');
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      v?: unknown;
      updatedAt?: unknown;
      id?: unknown;
    };
    if (
      parsed.v !== 1 ||
      typeof parsed.updatedAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(parsed.id)
    ) {
      throw new Error('invalid shape');
    }
    const updatedAt = new Date(parsed.updatedAt);
    if (Number.isNaN(updatedAt.getTime()) || updatedAt.toISOString() !== parsed.updatedAt) {
      throw new Error('invalid timestamp');
    }
    return { updatedAt, id: parsed.id };
  } catch {
    throw new BadRequestApplicationError(
      'Conversation cursor is invalid',
      'ASSIGNMENT_CONVERSATION_CURSOR_INVALID',
    );
  }
}
