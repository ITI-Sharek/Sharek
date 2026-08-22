/**
 * Magic-byte content validation, shared by every module that accepts an
 * uploaded file.
 *
 * A declared Content-Type is attacker-controlled, so an allowlist alone is
 * worthless: renaming `payload.exe` to `brief.pdf` would sail through. Every
 * accepted format is therefore confirmed against its bytes via a matcher
 * registered here.
 *
 * The registry is deliberately reject-on-unknown. The bug this avoids is
 * real: a chained-ternary check (PDF ? ... : DOCX ? ... : looksLikeText) lets
 * any newly allowed mime type silently fall through to the text check --
 * and a valid PNG contains NUL bytes, so it would be rejected as
 * `content_mismatch` the moment someone added `image/png` to an allowlist
 * without also adding a case. A `Map<mime, matcher>` makes that omission a
 * loud, immediate rejection instead of a silent, wrong one.
 */

export type ContentSignatureMatcher = (content: Buffer) => boolean;

export type ContentSignatureCheck =
  | { ok: true; mimeType: string }
  | { ok: false; reason: 'unsupported_type' | 'content_mismatch' };

const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');
/** Local file header of any ZIP; DOCX is a ZIP container. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
/** Present in the ZIP directory of any real WordprocessingML document. */
const DOCX_PART = Buffer.from('word/document.xml', 'ascii');
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const GIF87_MAGIC = Buffer.from('GIF87a', 'ascii');
const GIF89_MAGIC = Buffer.from('GIF89a', 'ascii');
const RIFF_MAGIC = Buffer.from('RIFF', 'ascii');
const WEBP_MAGIC = Buffer.from('WEBP', 'ascii');

export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Text formats have no magic bytes, so "does the header match" cannot be
 * asked of them. The check instead is that the bytes are genuinely text:
 * decodable as UTF-8 and free of NUL, which is what a binary masquerading as
 * `text/plain` trips over.
 */
function looksLikeText(content: Buffer): boolean {
  if (content.includes(0x00)) return false;
  const decoded = new TextDecoder('utf-8', { fatal: true });
  try {
    decoded.decode(content);
    return true;
  } catch {
    return false;
  }
}

function looksLikePdf(content: Buffer): boolean {
  return content.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}

function looksLikeDocx(content: Buffer): boolean {
  if (!content.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) return false;
  // A ZIP alone is not a DOCX. Requiring the WordprocessingML main part keeps
  // a renamed archive out. This reads the raw container rather than
  // unzipping, so it is a strong signal rather than a parse -- a deliberately
  // crafted ZIP could still satisfy it, which the malware scan exists to
  // catch.
  return content.includes(DOCX_PART);
}

function looksLikeJpeg(content: Buffer): boolean {
  return content.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC);
}

function looksLikePng(content: Buffer): boolean {
  return content.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);
}

function looksLikeGif(content: Buffer): boolean {
  const head = content.subarray(0, GIF87_MAGIC.length);
  return head.equals(GIF87_MAGIC) || head.equals(GIF89_MAGIC);
}

function looksLikeWebp(content: Buffer): boolean {
  if (content.length < 12) return false;
  return (
    content.subarray(0, 4).equals(RIFF_MAGIC) &&
    content.subarray(8, 12).equals(WEBP_MAGIC)
  );
}

const CONTENT_SIGNATURE_MATCHERS: ReadonlyMap<string, ContentSignatureMatcher> =
  new Map([
    ['application/pdf', looksLikePdf],
    [DOCX_MIME_TYPE, looksLikeDocx],
    ['text/plain', looksLikeText],
    ['text/markdown', looksLikeText],
    ['image/jpeg', looksLikeJpeg],
    ['image/png', looksLikePng],
    ['image/gif', looksLikeGif],
    ['image/webp', looksLikeWebp],
  ]);

/**
 * Confirms declared content against its bytes. `allowedMimeTypes` is the
 * caller's own configured allowlist -- a mime type may be registered here and
 * still rejected as `unsupported_type` if the caller does not allow it.
 */
export function checkContentSignature(
  declaredMimeType: string,
  content: Buffer,
  allowedMimeTypes: readonly string[],
): ContentSignatureCheck {
  const mimeType = declaredMimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!allowedMimeTypes.includes(mimeType)) {
    return { ok: false, reason: 'unsupported_type' };
  }

  const matcher = CONTENT_SIGNATURE_MATCHERS.get(mimeType);
  if (!matcher) {
    // Reject-on-unknown: an allowed mime type with no registered matcher must
    // never silently fall through to a check it was not written to perform.
    return { ok: false, reason: 'content_mismatch' };
  }

  return matcher(content)
    ? { ok: true, mimeType }
    : { ok: false, reason: 'content_mismatch' };
}

/**
 * Sniffs an image's mime type from its bytes alone, or null if none match.
 *
 * Deliberately PNG/JPEG/WebP only, matching the three formats the avatar
 * upload path has always accepted -- adding GIF here would silently widen
 * what an avatar accepts. Chat attachments validate GIF separately, through
 * {@link checkContentSignature}'s registry.
 */
export function sniffImageMimeType(content: Buffer): string | null {
  if (looksLikePng(content)) return 'image/png';
  if (looksLikeJpeg(content)) return 'image/jpeg';
  if (looksLikeWebp(content)) return 'image/webp';
  return null;
}

export function parseAllowedMimeTypes(configured: string): string[] {
  return configured
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}
