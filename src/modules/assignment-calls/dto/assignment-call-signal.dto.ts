export type AssignmentCallSignalKind =
  | 'offer'
  | 'answer'
  | 'ice_candidate'
  | 'renegotiate_offer'
  | 'renegotiate_answer';

export const ASSIGNMENT_CALL_SIGNAL_KINDS: readonly AssignmentCallSignalKind[] =
  ['offer', 'answer', 'ice_candidate', 'renegotiate_offer', 'renegotiate_answer'];

export interface AssignmentCallSignalCandidateDto {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string;
}

/** Client -> server, event `assignment_call.signal`, sent WITH an ack callback. */
export interface AssignmentCallSignalInboundDto {
  callId: string;
  callSessionId: string;
  kind: AssignmentCallSignalKind;
  sdp?: string;
  candidate?: AssignmentCallSignalCandidateDto;
  signalSeq: number;
}

export interface AssignmentCallSignalAck {
  ok: boolean;
  code?: string;
}

/**
 * Server -> the peer, event `assignment_call.signal`. `fromUserId` and
 * `fromCallSessionId` are always the authenticated sender's own identity,
 * stamped server-side -- never copied from anything the client sent that
 * could be spoofed as someone else's.
 */
export interface AssignmentCallSignalOutboundDto {
  callId: string;
  fromUserId: string;
  fromCallSessionId: string;
  kind: AssignmentCallSignalKind;
  sdp?: string;
  candidate?: AssignmentCallSignalCandidateDto;
  signalSeq: number;
  relayedAt: string;
}
