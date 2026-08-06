import { deflateRawSync } from 'node:zlib';

import {
  checkMaterialContent,
  DOCX_MIME_TYPE,
  parseAllowedMimeTypes,
} from './material-content';

const ALLOWED = [
  'application/pdf',
  DOCX_MIME_TYPE,
  'text/markdown',
  'text/plain',
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

describe('checkMaterialContent', () => {
  it('accepts each supported format when the bytes agree with the type', () => {
    expect(checkMaterialContent('application/pdf', pdf(), ALLOWED)).toEqual({
      ok: true,
      mimeType: 'application/pdf',
    });
    expect(checkMaterialContent(DOCX_MIME_TYPE, docx(), ALLOWED)).toEqual({
      ok: true,
      mimeType: DOCX_MIME_TYPE,
    });
    expect(
      checkMaterialContent('text/markdown', Buffer.from('# Brief\n'), ALLOWED),
    ).toEqual({ ok: true, mimeType: 'text/markdown' });
  });

  it('rejects a type that is not configured as supported', () => {
    expect(checkMaterialContent('image/png', pdf(), ALLOWED)).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
  });

  it('rejects bytes that disagree with the declared type', () => {
    // The whole point: the declared type is attacker-controlled, so an
    // allowlist alone would pass anything renamed to .pdf.
    expect(
      checkMaterialContent('application/pdf', Buffer.from('MZ\x90\x00binary'), ALLOWED),
    ).toEqual({ ok: false, reason: 'content_mismatch' });
  });

  it('rejects an ordinary archive renamed as a Word document', () => {
    expect(checkMaterialContent(DOCX_MIME_TYPE, zipButNotDocx(), ALLOWED)).toEqual({
      ok: false,
      reason: 'content_mismatch',
    });
  });

  it('rejects binary content declared as text', () => {
    // Text has no magic bytes, so the check is that it is genuinely text.
    // A NUL byte is what an executable trips over.
    expect(
      checkMaterialContent('text/plain', Buffer.from([0x41, 0x00, 0x42]), ALLOWED),
    ).toEqual({ ok: false, reason: 'content_mismatch' });
    expect(
      checkMaterialContent('text/plain', Buffer.from([0xff, 0xfe, 0xfd]), ALLOWED),
    ).toEqual({ ok: false, reason: 'content_mismatch' });
  });

  it('accepts non-ASCII text, which the project needs for Arabic content', () => {
    expect(
      checkMaterialContent('text/plain', Buffer.from('مواصفات المشروع', 'utf8'), ALLOWED),
    ).toEqual({ ok: true, mimeType: 'text/plain' });
  });

  it('normalises a type carrying a charset parameter', () => {
    expect(
      checkMaterialContent('text/plain; charset=utf-8', Buffer.from('hello'), ALLOWED),
    ).toEqual({ ok: true, mimeType: 'text/plain' });
  });

  it('rejects an empty declared type rather than defaulting to something', () => {
    expect(checkMaterialContent('', pdf(), ALLOWED)).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
  });
});

describe('parseAllowedMimeTypes', () => {
  it('parses, trims and lowercases the configured list', () => {
    expect(parseAllowedMimeTypes(' application/PDF , text/plain ')).toEqual([
      'application/pdf',
      'text/plain',
    ]);
  });

  it('ignores empty entries from a trailing comma', () => {
    expect(parseAllowedMimeTypes('text/plain,,')).toEqual(['text/plain']);
  });
});
