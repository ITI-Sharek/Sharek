/**
 * Recorded on an attachment the scanner reported as malware. A permanent
 * tombstone, matching `MATERIAL_SCAN_INFECTED_ERROR_CODE`'s reasoning.
 */
export const CHAT_ATTACHMENT_INFECTED_ERROR_CODE = 'CHAT_ATTACHMENT_INFECTED';

/**
 * Recorded on an attachment retried to the scan attempt limit without ever
 * producing a verdict. The row stays `quarantined` -- never `rejected` --
 * because "scan unavailable" must never be presented as a malware claim.
 */
export const CHAT_ATTACHMENT_SCAN_ABANDONED_ERROR_CODE =
  'CHAT_ATTACHMENT_SCAN_ABANDONED';

export const CHAT_ATTACHMENT_MAX_PER_MESSAGE_DEFAULT = 5;
