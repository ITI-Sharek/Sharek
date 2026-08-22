/**
 * Content validation for uploaded Materials.
 *
 * Delegates to the shared `Map<mime, matcher>` registry in
 * `shared/content/file-signature.ts` so Materials, chat attachments, and any
 * future upload path share one signature table instead of drifting apart.
 * This file exists to keep the names Materials call sites already use.
 */

import {
  checkContentSignature,
  DOCX_MIME_TYPE as SHARED_DOCX_MIME_TYPE,
  parseAllowedMimeTypes as sharedParseAllowedMimeTypes,
} from '../../../shared/content/file-signature';

export type MaterialContentCheck =
  | { ok: true; mimeType: string }
  | { ok: false; reason: 'unsupported_type' | 'content_mismatch' };

export const DOCX_MIME_TYPE = SHARED_DOCX_MIME_TYPE;

export function checkMaterialContent(
  declaredMimeType: string,
  content: Buffer,
  allowedMimeTypes: readonly string[],
): MaterialContentCheck {
  return checkContentSignature(declaredMimeType, content, allowedMimeTypes);
}

export function parseAllowedMimeTypes(configured: string): string[] {
  return sharedParseAllowedMimeTypes(configured);
}
