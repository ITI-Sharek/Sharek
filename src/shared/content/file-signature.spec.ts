import { deflateRawSync } from 'node:zlib';

import {
  checkContentSignature,
  DOCX_MIME_TYPE,
  parseAllowedMimeTypes,
  sniffImageMimeType,
} from './file-signature';

const ALLOWED = [
  'application/pdf',
  DOCX_MIME_TYPE,
  'text/markdown',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

const pdf = () => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('body')]);

/** Minimal ZIP-shaped buffer naming the WordprocessingML main part. */
const docx = () =>
  Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('word/document.xml'),
    deflateRawSync(Buffer.from('<w:document/>')),
  ]);

const zipButNotDocx = () =>
  Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('photos/holiday.jpg'),
  ]);

const jpeg = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const png = () =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0x00, 0x00, 0x00, 0x0d]),
  ]);
const gif87 = () => Buffer.concat([Buffer.from('GIF87a'), Buffer.from([0x01, 0x00])]);
const gif89 = () => Buffer.concat([Buffer.from('GIF89a'), Buffer.from([0x01, 0x00])]);
const webp = () =>
  Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP'),
  ]);

describe('checkContentSignature', () => {
  it('accepts each supported document/text format when the bytes agree with the type', () => {
    expect(checkContentSignature('application/pdf', pdf(), ALLOWED)).toEqual({
      ok: true,
      mimeType: 'application/pdf',
    });
    expect(checkContentSignature(DOCX_MIME_TYPE, docx(), ALLOWED)).toEqual({
      ok: true,
      mimeType: DOCX_MIME_TYPE,
    });
    expect(
      checkContentSignature('text/markdown', Buffer.from('# Brief\n'), ALLOWED),
    ).toEqual({ ok: true, mimeType: 'text/markdown' });
  });

  it('rejects a type that is not configured as supported', () => {
    expect(checkContentSignature('image/tiff', pdf(), ALLOWED)).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
  });

  it('rejects bytes that disagree with the declared type', () => {
    // The whole point: the declared type is attacker-controlled, so an
    // allowlist alone would pass anything renamed to .pdf.
    expect(
      checkContentSignature('application/pdf', Buffer.from('MZ\x90\x00binary'), ALLOWED),
    ).toEqual({ ok: false, reason: 'content_mismatch' });
  });

  it('rejects an ordinary archive renamed as a Word document', () => {
    expect(checkContentSignature(DOCX_MIME_TYPE, zipButNotDocx(), ALLOWED)).toEqual({
      ok: false,
      reason: 'content_mismatch',
    });
  });

  it('rejects binary content declared as text', () => {
    // Text has no magic bytes, so the check is that it is genuinely text.
    // A NUL byte is what an executable trips over.
    expect(
      checkContentSignature('text/plain', Buffer.from([0x41, 0x00, 0x42]), ALLOWED),
    ).toEqual({ ok: false, reason: 'content_mismatch' });
    expect(
      checkContentSignature('text/plain', Buffer.from([0xff, 0xfe, 0xfd]), ALLOWED),
    ).toEqual({ ok: false, reason: 'content_mismatch' });
  });

  it('accepts non-ASCII text, which the project needs for Arabic content', () => {
    expect(
      checkContentSignature('text/plain', Buffer.from('مواصفات المشروع', 'utf8'), ALLOWED),
    ).toEqual({ ok: true, mimeType: 'text/plain' });
  });

  it('normalises a type carrying a charset parameter', () => {
    expect(
      checkContentSignature('text/plain; charset=utf-8', Buffer.from('hello'), ALLOWED),
    ).toEqual({ ok: true, mimeType: 'text/plain' });
  });

  it('rejects an empty declared type rather than defaulting to something', () => {
    expect(checkContentSignature('', pdf(), ALLOWED)).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
  });

  describe('image formats', () => {
    it.each([
      ['image/jpeg', jpeg],
      ['image/png', png],
      ['image/gif', gif87],
      ['image/webp', webp],
    ])('accepts %s bytes declared as %s', (mime, bytes) => {
      expect(checkContentSignature(mime, bytes(), ALLOWED)).toEqual({
        ok: true,
        mimeType: mime,
      });
    });

    it('accepts both GIF magic-byte variants', () => {
      expect(checkContentSignature('image/gif', gif87(), ALLOWED)).toEqual({
        ok: true,
        mimeType: 'image/gif',
      });
      expect(checkContentSignature('image/gif', gif89(), ALLOWED)).toEqual({
        ok: true,
        mimeType: 'image/gif',
      });
    });

    it.each([
      ['image/jpeg', png],
      ['image/png', jpeg],
      ['image/gif', webp],
      ['image/webp', gif89],
    ])('rejects %s declared for bytes of a different image format', (mime, wrongBytes) => {
      expect(checkContentSignature(mime, wrongBytes(), ALLOWED)).toEqual({
        ok: false,
        reason: 'content_mismatch',
      });
    });

    it('rejects a WebP declaration for a RIFF container that is not WEBP', () => {
      const riffButNotWebp = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0x10, 0x00, 0x00, 0x00]),
        Buffer.from('WAVE'),
      ]);
      expect(checkContentSignature('image/webp', riffButNotWebp, ALLOWED)).toEqual({
        ok: false,
        reason: 'content_mismatch',
      });
    });

    it('rejects a WebP declaration for a buffer too short to carry the FourCC', () => {
      expect(checkContentSignature('image/webp', Buffer.from('RIFF'), ALLOWED)).toEqual({
        ok: false,
        reason: 'content_mismatch',
      });
    });
  });

  it('rejects an allowlisted mime type with no registered matcher, rather than falling through to a check it was never written to perform', () => {
    // This is the regression the `Map<mime, matcher>` registry design exists
    // to prevent (see this file's top-of-file comment). `application/zip` is
    // a real, plausible mime type: an operator could add it to the allowlist
    // believing "it's just another file type", without adding a matcher for
    // it. A chained-ternary fallback (PDF ? ... : DOCX ? ... : looksLikeText)
    // would run the text check against these bytes instead of rejecting
    // outright -- and that fallback is what makes this regression dangerous
    // rather than merely wrong: some binary content decodes as valid UTF-8
    // with no NUL byte and would be silently accepted as "text", under a
    // mime type nobody ever wrote a real check for. The Map lookup instead
    // fails fast and loud, every time, for a reason that names the actual
    // gap: nobody wrote a `looksLikeZip`.
    const allowedWithUnregisteredType = [...ALLOWED, 'application/zip'];
    const zipBytes = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('anything.bin'),
    ]);

    expect(
      checkContentSignature('application/zip', zipBytes, allowedWithUnregisteredType),
    ).toEqual({ ok: false, reason: 'content_mismatch' });
  });
});

describe('sniffImageMimeType', () => {
  it('identifies PNG, JPEG, and WebP bytes', () => {
    expect(sniffImageMimeType(png())).toBe('image/png');
    expect(sniffImageMimeType(jpeg())).toBe('image/jpeg');
    expect(sniffImageMimeType(webp())).toBe('image/webp');
  });

  it('returns null for bytes that match no recognised image signature', () => {
    expect(sniffImageMimeType(Buffer.from('not an image'))).toBeNull();
  });

  it('returns null for a GIF, not `image/gif` -- intentionally narrower than checkContentSignature', () => {
    // Documented in the source: this function backs the avatar upload path
    // in `contributor-profiles.service.ts`, which has only ever accepted
    // PNG/JPEG/WebP. Widening this to recognise GIF would silently widen
    // what an avatar upload accepts too -- chat attachments validate GIF
    // through `checkContentSignature`'s registry instead, a separate,
    // deliberately wider allowlist.
    expect(sniffImageMimeType(gif89())).toBeNull();
  });
});

describe('parseAllowedMimeTypes', () => {
  it('parses, trims and lowercases the configured list', () => {
    expect(parseAllowedMimeTypes(' application/PDF , image/PNG ')).toEqual([
      'application/pdf',
      'image/png',
    ]);
  });

  it('ignores empty entries from a trailing comma', () => {
    expect(parseAllowedMimeTypes('text/plain,,')).toEqual(['text/plain']);
  });
});
