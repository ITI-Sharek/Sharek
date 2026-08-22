import { Prisma } from '@prisma/client';

/** Shared between every service that reads and re-presents an `AssignmentCall` row. */
export const CALL_SELECT = {
  id: true,
  conversation_id: true,
  caller_id: true,
  callee_id: true,
  outcome: true,
  started_at: true,
  answered_at: true,
  ended_at: true,
  duration_seconds: true,
  end_reason: true,
  aggregate_version: true,
  caller: { select: { first_name: true, last_name: true } },
  callee: { select: { first_name: true, last_name: true } },
} satisfies Prisma.AssignmentCallSelect;

export type CallRecord = Prisma.AssignmentCallGetPayload<{ select: typeof CALL_SELECT }>;
