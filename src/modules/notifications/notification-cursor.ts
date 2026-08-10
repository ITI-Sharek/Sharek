import { BadRequestApplicationError } from '../../shared/errors/application.error';

export interface NotificationCursor {
  createdAt: Date;
  id: string;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeNotificationCursor(cursor: NotificationCursor): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
  ).toString('base64url');
}

export function decodeNotificationCursor(value: string): NotificationCursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid characters');

    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (parsed.v !== 1 || typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      throw new Error('invalid shape');
    }
    if (!UUID_V4.test(parsed.id)) throw new Error('invalid id');

    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== parsed.createdAt) {
      throw new Error('invalid timestamp');
    }

    return { createdAt, id: parsed.id };
  } catch {
    throw new BadRequestApplicationError(
      'Notification cursor is invalid',
      'NOTIFICATION_CURSOR_INVALID',
    );
  }
}
