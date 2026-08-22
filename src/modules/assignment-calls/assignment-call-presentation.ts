import { AssignmentCallOutcome } from '@prisma/client';

import { AssignmentCallOutcomeDto, AssignmentCallResponseDto } from './dto/assignment-call-response.dto';

const OUTCOME_TO_DTO: Record<AssignmentCallOutcome, AssignmentCallOutcomeDto> = {
  ringing: 'RINGING',
  answered: 'ANSWERED',
  missed: 'MISSED',
  declined: 'DECLINED',
  failed_busy: 'FAILED_BUSY',
  failed_provider: 'FAILED_PROVIDER',
  ended: 'ENDED',
};

export type AssignmentCallRecord = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  outcome: AssignmentCallOutcome;
  started_at: Date;
  answered_at: Date | null;
  ended_at: Date | null;
  duration_seconds: number | null;
  end_reason: string | null;
  caller: { first_name: string; last_name: string } | undefined;
  callee: { first_name: string; last_name: string } | undefined;
};

function displayName(
  user: { first_name: string; last_name: string } | undefined,
  fallback: string,
): string {
  const name = user ? `${user.first_name} ${user.last_name}`.trim() : '';
  return name || fallback;
}

export function toAssignmentCallResponseDto(
  call: AssignmentCallRecord,
  maxDurationSeconds: number,
): AssignmentCallResponseDto {
  return {
    callId: call.id,
    conversationId: call.conversation_id,
    callerId: call.caller_id,
    callerName: displayName(call.caller, call.caller_id),
    calleeId: call.callee_id,
    calleeName: displayName(call.callee, call.callee_id),
    outcome: OUTCOME_TO_DTO[call.outcome],
    startedAt: call.started_at,
    answeredAt: call.answered_at,
    endedAt: call.ended_at,
    durationSeconds: call.duration_seconds,
    endReason: call.end_reason,
    maxDurationSeconds,
  };
}
