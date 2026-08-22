/** Recorded when the ring-timeout sweep or a rejected `answer` finds nobody answered. */
export const ASSIGNMENT_CALL_RING_EXPIRED_ERROR_CODE = 'ASSIGNMENT_CALL_RING_EXPIRED';

/** `end_reason` values. Free text in the schema; enumerated here for consistency. */
export const ASSIGNMENT_CALL_END_REASON = {
  hangup: 'hangup',
  declined: 'declined',
  reconnectTimeout: 'reconnect_timeout',
  maxDuration: 'max_duration',
  ringTimeout: 'ring_timeout',
} as const;
