export type AssignmentCallOutcomeDto =
  | 'RINGING'
  | 'ANSWERED'
  | 'MISSED'
  | 'DECLINED'
  | 'FAILED_BUSY'
  | 'FAILED_PROVIDER'
  | 'ENDED';

export interface AssignmentCallResponseDto {
  callId: string;
  conversationId: string;
  callerId: string;
  callerName: string;
  calleeId: string;
  calleeName: string;
  outcome: AssignmentCallOutcomeDto;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number | null;
  endReason: string | null;
  maxDurationSeconds: number;
}

export interface IceServerDto {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface JoinCredentialsDto {
  iceServers: IceServerDto[];
  expiresAt: Date;
  maxDurationSeconds: number;
}

/**
 * `start` and `answer` return this inline -- join credentials in the same
 * response as the durable command -- to save a round trip against the
 * invitation-latency target. `callSessionId` is a fresh, per-tab, opaque
 * correlation id: never persisted, generated per call, and echoed on every
 * signal so a multi-tab callee can tell which of its own tabs a signal
 * belongs to.
 */
export interface StartOrAnswerCallResponseDto {
  call: AssignmentCallResponseDto;
  joinCredentials: JoinCredentialsDto;
  callSessionId: string;
}

export interface CommunicationCapacityDto {
  turnBytesUsed: number;
  turnBytesBudget: number;
  warningAt80: boolean;
  exhausted: boolean;
}
