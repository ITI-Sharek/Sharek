import { Prisma } from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import {
  ChatAttachmentsService,
  UploadedAttachmentFile,
} from './chat-attachments.service';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = '55555555-5555-4555-8555-555555555555';
const ATTACHMENT_ID = '66666666-6666-4666-8666-666666666666';
const IDEMPOTENCY_KEY = '77777777-7777-4777-8777-777777777777';

const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  DOCX_MIME_TYPE,
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/markdown',
].join(',');

const actor: AuthenticatedUser = {
  id: ACTOR_ID,
  email: 'contributor@example.com',
  role: 'contributor',
  status: 'active',
};

const pdfBytes = () => Buffer.from('%PDF-1.7\nbrief body');
const docxBytes = () =>
  Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('word/document.xml'),
  ]);
const pngBytes = () =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('extra'),
  ]);
const jpegBytes = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const gifBytes = () =>
  Buffer.concat([Buffer.from('GIF89a'), Buffer.from([0x01, 0x00, 0x01, 0x00])]);
const webpBytes = () =>
  Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP'),
  ]);
const textBytes = () => Buffer.from('Please see the attached brief.', 'utf8');

function file(overrides: Partial<UploadedAttachmentFile> = {}): UploadedAttachmentFile {
  const buffer = overrides.buffer ?? pdfBytes();
  return {
    buffer,
    mimetype: overrides.mimetype ?? 'application/pdf',
    size: buffer.byteLength,
    originalname: overrides.originalname ?? 'brief.pdf',
  };
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
  });
}

describe('ChatAttachmentsService', () => {
  const database = {
    chatAttachment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
  };
  const configValues: Record<string, unknown> = {
    CHAT_ATTACHMENTS_ENABLED: true,
    CHAT_ATTACHMENT_ALLOWED_MIME_TYPES: ALLOWED_MIME_TYPES,
    CHAT_ATTACHMENT_MAX_BYTES: 26_214_400,
    CHAT_ATTACHMENT_UPLOAD_INTENT_TTL_SECONDS: 1800,
    CHAT_ATTACHMENT_UPLOADS_PER_MINUTE: 20,
    S3_CHAT_ATTACHMENTS_KEY_PREFIX: 'chat-attachments/',
  };
  const config = { get: jest.fn() };
  const conversations = { getParticipation: jest.fn() };
  const storage = { put: jest.fn(), delete: jest.fn() };
  const scanQueue = { enqueueScan: jest.fn() };
  const service = new ChatAttachmentsService(
    database as never,
    config as never,
    conversations as never,
    storage as never,
    scanQueue as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string, fallback: unknown) =>
      key in configValues ? configValues[key] : fallback,
    );
    conversations.getParticipation.mockResolvedValue({
      conversationId: CONVERSATION_ID,
      assignmentId: 'assignment-1',
      status: 'active',
      ownerId: OWNER_ID,
      contributorId: ACTOR_ID,
      peerId: OWNER_ID,
      aggregateVersion: 1,
    });
    database.chatAttachment.count.mockResolvedValue(0);
    storage.put.mockImplementation((storageKey: string, content: Buffer) =>
      Promise.resolve({
        storageKey,
        byteSize: content.byteLength,
        contentHash: 'a'.repeat(64),
      }),
    );
    storage.delete.mockResolvedValue(undefined);
    database.chatAttachment.create.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: ATTACHMENT_ID,
          original_filename: args.data.original_filename,
          byte_size: args.data.byte_size,
          mime_type: args.data.mime_type,
          scan_status: 'quarantined',
          scan_error_code: null,
          expires_at: args.data.expires_at,
        }),
    );
    scanQueue.enqueueScan.mockResolvedValue(undefined);
  });

  const createUpload = (
    overrides: Partial<Parameters<ChatAttachmentsService['createUpload']>[0]> = {},
  ) =>
    service.createUpload({
      actor,
      conversationId: CONVERSATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      file: file(),
      ...overrides,
    });

  it.each([
    ['application/pdf', pdfBytes, 'brief.pdf'],
    [DOCX_MIME_TYPE, docxBytes, 'brief.docx'],
    ['image/png', pngBytes, 'photo.png'],
    ['image/jpeg', jpegBytes, 'photo.jpg'],
    ['image/gif', gifBytes, 'photo.gif'],
    ['image/webp', webpBytes, 'photo.webp'],
    ['text/plain', textBytes, 'notes.txt'],
    ['text/markdown', textBytes, 'notes.md'],
  ])(
    'accepts a %s attachment whose bytes agree with the declared type',
    async (mimetype, bytes, originalname) => {
      await expect(
        createUpload({ file: file({ mimetype, buffer: bytes(), originalname }) }),
      ).resolves.toMatchObject({ mimeType: mimetype });
      expect(storage.put).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects PNG bytes declared as application/pdf as a content mismatch', async () => {
    // The declared Content-Type is attacker-controlled; the allowlist alone
    // would let a renamed PNG sail through as a PDF.
    await expect(
      createUpload({
        file: file({
          mimetype: 'application/pdf',
          buffer: pngBytes(),
          originalname: 'sneaky.pdf',
        }),
      }),
    ).rejects.toMatchObject({ code: 'CHAT_ATTACHMENT_CONTENT_MISMATCH' });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('rejects an oversize attachment and reports the configured limit', async () => {
    config.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'CHAT_ATTACHMENT_MAX_BYTES'
        ? 8
        : key in configValues
          ? configValues[key]
          : fallback,
    );

    await expect(createUpload()).rejects.toMatchObject({
      code: 'CHAT_ATTACHMENT_TOO_LARGE',
      metadata: { maxBytes: 8 },
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('rejects an empty attachment buffer', async () => {
    await expect(
      createUpload({ file: file({ buffer: Buffer.alloc(0) }) }),
    ).rejects.toMatchObject({ code: 'CHAT_ATTACHMENT_FILE_REQUIRED' });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('rejects a mime type outside the configured allowlist', async () => {
    await expect(
      createUpload({
        file: file({
          mimetype: 'application/zip',
          buffer: Buffer.concat([
            Buffer.from([0x50, 0x4b, 0x03, 0x04]),
            Buffer.from('archive.bin'),
          ]),
          originalname: 'archive.zip',
        }),
      }),
    ).rejects.toMatchObject({
      code: 'CHAT_ATTACHMENT_TYPE_UNSUPPORTED',
      metadata: { allowedMimeTypes: expect.any(Array) as string[] },
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('refuses an upload when chat attachments are disabled, before touching storage or the scan queue', async () => {
    config.get.mockImplementation((key: string, fallback: unknown) =>
      key === 'CHAT_ATTACHMENTS_ENABLED'
        ? false
        : key in configValues
          ? configValues[key]
          : fallback,
    );

    await expect(createUpload()).rejects.toMatchObject({
      code: 'CHAT_ATTACHMENTS_DISABLED',
      statusCode: 403,
    });
    expect(conversations.getParticipation).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
    expect(scanQueue.enqueueScan).not.toHaveBeenCalled();
  });

  it('rejects an upload into a conversation that is not active', async () => {
    conversations.getParticipation.mockResolvedValue({
      conversationId: CONVERSATION_ID,
      assignmentId: 'assignment-1',
      status: 'read_only',
      ownerId: OWNER_ID,
      contributorId: ACTOR_ID,
      peerId: OWNER_ID,
      aggregateVersion: 1,
    });

    await expect(createUpload()).rejects.toMatchObject({
      code: 'ASSIGNMENT_CONVERSATION_READ_ONLY',
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('returns the original upload intent for a replayed idempotency key with matching content', async () => {
    // Simulates the unique constraint on (conversation, uploader, key) firing
    // on the second attempt, exactly as `MaterialsService` handles P2002.
    database.chatAttachment.create.mockRejectedValue(p2002());
    database.chatAttachment.findUnique.mockResolvedValue({
      id: ATTACHMENT_ID,
      original_filename: 'brief.pdf',
      byte_size: pdfBytes().byteLength,
      mime_type: 'application/pdf',
      scan_status: 'quarantined',
      scan_error_code: null,
      expires_at: new Date('2026-08-21T13:00:00.000Z'),
      content_hash: 'a'.repeat(64), // matches storage.put's mocked contentHash
    });

    const result = await createUpload();

    expect(result).toMatchObject({ uploadId: ATTACHMENT_ID, mimeType: 'application/pdf' });
    // One S3 put attempt, one failed DB row -- the replay reads the existing
    // row rather than writing a second one.
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(database.chatAttachment.create).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(scanQueue.enqueueScan).not.toHaveBeenCalled();
  });

  it('rejects a replayed idempotency key whose content hash has changed', async () => {
    database.chatAttachment.create.mockRejectedValue(p2002());
    database.chatAttachment.findUnique.mockResolvedValue({
      id: ATTACHMENT_ID,
      original_filename: 'brief.pdf',
      byte_size: pdfBytes().byteLength,
      mime_type: 'application/pdf',
      scan_status: 'quarantined',
      scan_error_code: null,
      expires_at: new Date('2026-08-21T13:00:00.000Z'),
      content_hash: 'b'.repeat(64), // does not match this attempt's content
    });

    await expect(createUpload()).rejects.toMatchObject({
      code: 'CHAT_ATTACHMENT_IDEMPOTENCY_CONFLICT',
    });
  });

  it('deletes the just-written bytes and rethrows when the row insert fails for a non-idempotency reason', async () => {
    // The bytes are already in the bucket by the time the insert runs, so a
    // failure here would otherwise strand an object no row references.
    const dbError = new Error('connection terminated unexpectedly');
    database.chatAttachment.create.mockRejectedValue(dbError);

    await expect(createUpload()).rejects.toBe(dbError);

    const [storageKeyPutWith] = storage.put.mock.calls[0] as [string, Buffer];
    expect(storage.delete).toHaveBeenCalledWith(storageKeyPutWith);
    // Not treated as an idempotency replay -- no lookup for an existing row.
    expect(database.chatAttachment.findUnique).not.toHaveBeenCalled();
  });

  it('rejects new uploads once the per-minute rate limit is reached, before ever touching storage', async () => {
    database.chatAttachment.count.mockResolvedValue(20);

    await expect(createUpload()).rejects.toMatchObject({
      code: 'CHAT_ATTACHMENT_UPLOAD_RATE_LIMITED',
      statusCode: 429,
      metadata: { retryAfterSeconds: 60 },
    });
    expect(storage.put).not.toHaveBeenCalled();
    expect(database.chatAttachment.create).not.toHaveBeenCalled();
  });
});
