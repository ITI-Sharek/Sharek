/**
 * Content validation for uploaded Materials.
 *
 * The declared Content-Type is attacker-controlled, so the allowlist is
 * worthless on its own: renaming `payload.exe` to `brief.pdf` would sail
 * through. Every accepted format is therefore confirmed against the bytes.
 */

export type MaterialContentCheck =
  | { ok: true; mimeType: string }
  | { ok: false; reason: 'unsupported_type' | 'content_mismatch' };

const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');
/** Local file header of any ZIP; DOCX is a ZIP container. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
/** Present in the ZIP directory of any real WordprocessingML document. */
const DOCX_PART = Buffer.from('word/document.xml', 'ascii');

export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Text formats have no magic bytes, so "does the header match" is not a
 * question that can be asked of them. The check instead is that the bytes are
 * genuinely text: decodable as UTF-8 and free of NUL, which is what a binary
 * masquerading as `text/plain` trips over.
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

function looksLikeDocx(content: Buffer): boolean {
  if (!content.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) return false;
  // A ZIP alone is not a DOCX. Requiring the WordprocessingML main part keeps a
  // renamed archive out. This reads the raw container rather than unzipping,
  // so it is a strong signal rather than a parse -- a deliberately crafted ZIP
  // could still satisfy it, which the malware scan exists to catch.
  return content.includes(DOCX_PART);
}

export function checkMaterialContent(
  declaredMimeType: string,
  content: Buffer,
  allowedMimeTypes: readonly string[],
): MaterialContentCheck {
  const mimeType = declaredMimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!allowedMimeTypes.includes(mimeType)) {
    return { ok: false, reason: 'unsupported_type' };
  }

  const matches =
    mimeType === 'application/pdf'
      ? content.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)
      : mimeType === DOCX_MIME_TYPE
        ? looksLikeDocx(content)
        : looksLikeText(content);

  return matches ? { ok: true, mimeType } : { ok: false, reason: 'content_mismatch' };
}

export function parseAllowedMimeTypes(configured: string): string[] {
  return configured
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}
