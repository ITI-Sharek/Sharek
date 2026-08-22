/**
 * Client-facing scan presentation. Deliberately not a 1:1 mirror of
 * `ChatAttachmentScanStatus`: `scanning` covers both `quarantined` (not yet
 * claimed by a worker) and `scanning` (in progress), because the client has
 * no download affordance to offer either way; `blocked` reads better than
 * `rejected` next to a permanent tombstone; `unavailable` is its own state so
 * "we never finished checking" is never presented as "this is malware".
 */
export type ChatAttachmentScanStateDto =
  | 'scanning'
  | 'ready'
  | 'blocked'
  | 'unavailable';

export interface ChatAttachmentUploadResponseDto {
  uploadId: string;
  filename: string;
  byteSize: number;
  mimeType: string;
  scanState: ChatAttachmentScanStateDto;
  expiresAt: Date;
}

/** Embedded on a Message once bound; carries never the storage key or a URL. */
export interface ChatAttachmentSummaryDto {
  attachmentId: string;
  filename: string;
  byteSize: number;
  mimeType: string;
  caption: string | null;
  scanState: ChatAttachmentScanStateDto;
  /** Monotonic per-attachment guard the client compares incoming events against. */
  eventVersion: number;
}

export interface ChatAttachmentUploadConstraintsDto {
  maxBytes: number;
  maxPerMessage: number;
  allowedMimeTypes: string[];
}

export interface ChatAttachmentDownloadUrlResponseDto {
  url: string;
  expiresAt: Date;
  disposition: string;
}
