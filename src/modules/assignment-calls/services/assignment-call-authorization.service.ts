import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssignmentCallOutcome } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import {
  ASSIGNMENT_CALL_SIGNAL_KINDS,
  AssignmentCallSignalCandidateDto,
  AssignmentCallSignalInboundDto,
} from '../dto/assignment-call-signal.dto';

const CALL_STATE_CACHE_TTL_MS = 3_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANDIDATE_MAX_BYTES = 1_024;

type CallStateSnapshot = {
  callerId: string;
  outcome: AssignmentCallOutcome;
  answeredAt: Date | null;
  endedAt: Date | null;
  participants: ReadonlyMap<string, { active: boolean; status: string }>;
};

type ShapeResult =
  | { ok: true; signal: AssignmentCallSignalInboundDto }
  | { ok: false; code: string };

export type AuthorizeSignalResult =
  | { ok: true; signal: AssignmentCallSignalInboundDto; peerId: string }
  | { ok: false; code: string; disconnect?: boolean };

/**
 * The ONE place answering "may this actor send this signal, right now" --
 * socket authentication alone (`client.data.user`) is not enough, because it
 * only proves who connected, not that the call they are naming still exists,
 * still permits this kind of signal, or that they have not since been
 * suspended. Every check below runs on every delivered signal.
 */
@Injectable()
export class AssignmentCallAuthorizationService {
  private readonly callStateCache = new Map<
    string,
    { value: CallStateSnapshot | null; expiresAt: number }
  >();
  // Timestamps (ms) of recent signals, keyed by `${socketId}:${callId}`.
  private readonly allSignalTimestamps = new Map<string, number[]>();
  private readonly offerAnswerTimestamps = new Map<string, number[]>();

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async authorize(input: {
    socketId: string;
    actorId: string;
    payload: unknown;
  }): Promise<AuthorizeSignalResult> {
    const shaped = this.validateShape(input.payload);
    if (!shaped.ok) return shaped;
    const signal = shaped.signal;

    const rateLimit = this.checkRateLimit(input.socketId, signal.callId, signal.kind);
    if (!rateLimit.ok) return rateLimit;

    const call = await this.loadCallState(signal.callId);
    if (
      !call ||
      call.endedAt !== null ||
      !(call.outcome === 'ringing' || call.outcome === 'answered')
    ) {
      return { ok: false, code: 'ASSIGNMENT_CALL_NOT_FOUND' };
    }

    // `loadCallState` only populates `participants` from rows already
    // queried with `active: true`, so a present entry is active by
    // construction -- nothing to re-check there. Suspension is the one
    // thing that DOES need a fresh check: it must kill signaling
    // immediately (COMMUNICATION.md Suspension rule 1), re-read within the
    // cache window on every signal rather than trusted from the socket's
    // connect-time snapshot.
    const sender = call.participants.get(input.actorId);
    if (!sender || sender.status !== 'active') {
      return { ok: false, code: 'ASSIGNMENT_CALL_NOT_FOUND' };
    }

    const peerId = [...call.participants.keys()].find((id) => id !== input.actorId);
    if (!peerId) {
      return { ok: false, code: 'ASSIGNMENT_CALL_NOT_FOUND' };
    }

    const stateGate = this.checkStateGate(signal.kind, call, input.actorId);
    if (!stateGate.ok) return stateGate;

    return { ok: true, signal, peerId };
  }

  /** Call state changed underneath a cached entry (e.g. it just ended); drop it. */
  invalidate(callId: string): void {
    this.callStateCache.delete(callId);
  }

  /** Clears this socket's rate-limit history. Call on disconnect. */
  clearSocket(socketId: string): void {
    for (const key of this.allSignalTimestamps.keys()) {
      if (key.startsWith(`${socketId}:`)) this.allSignalTimestamps.delete(key);
    }
    for (const key of this.offerAnswerTimestamps.keys()) {
      if (key.startsWith(`${socketId}:`)) this.offerAnswerTimestamps.delete(key);
    }
  }

  private validateShape(payload: unknown): ShapeResult {
    if (typeof payload !== 'object' || payload === null) {
      return { ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_REJECTED' };
    }
    const record = payload as Record<string, unknown>;
    const callId = record.callId;
    const callSessionId = record.callSessionId;
    const kind = record.kind;
    const signalSeq = record.signalSeq;
    if (
      typeof callId !== 'string' ||
      !UUID_PATTERN.test(callId) ||
      typeof callSessionId !== 'string' ||
      !UUID_PATTERN.test(callSessionId) ||
      typeof kind !== 'string' ||
      !(ASSIGNMENT_CALL_SIGNAL_KINDS as readonly string[]).includes(kind) ||
      !Number.isInteger(signalSeq) ||
      (signalSeq as number) < 0
    ) {
      return { ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_REJECTED' };
    }

    const maxSdpBytes = this.config.get<number>(
      'ASSIGNMENT_CALL_SIGNAL_MAX_SDP_BYTES',
      65_536,
    );
    const sdp = record.sdp;
    if (sdp !== undefined) {
      if (typeof sdp !== 'string' || Buffer.byteLength(sdp, 'utf8') > maxSdpBytes) {
        return { ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_TOO_LARGE' };
      }
    }

    let validatedCandidate: AssignmentCallSignalCandidateDto | undefined;
    if (record.candidate !== undefined) {
      const candidateCheck = this.validateCandidate(record.candidate);
      if (!candidateCheck.ok) return candidateCheck;
      validatedCandidate = candidateCheck.candidate;
    }

    return {
      ok: true,
      signal: {
        callId,
        callSessionId,
        kind: kind as AssignmentCallSignalInboundDto['kind'],
        sdp: sdp as string | undefined,
        candidate: validatedCandidate,
        signalSeq: signalSeq as number,
      },
    };
  }

  private validateCandidate(
    candidate: unknown,
  ): { ok: true; candidate: AssignmentCallSignalCandidateDto } | { ok: false; code: string } {
    if (typeof candidate !== 'object' || candidate === null) {
      return { ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_REJECTED' };
    }
    const record = candidate as Record<string, unknown>;
    const value = record.candidate;
    if (
      typeof value !== 'string' ||
      Buffer.byteLength(value, 'utf8') > CANDIDATE_MAX_BYTES
    ) {
      return { ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_TOO_LARGE' };
    }
    const sdpMid = record.sdpMid;
    const sdpMLineIndex = record.sdpMLineIndex;
    if (
      (sdpMid !== null && sdpMid !== undefined && typeof sdpMid !== 'string') ||
      (sdpMLineIndex !== null &&
        sdpMLineIndex !== undefined &&
        !Number.isInteger(sdpMLineIndex))
    ) {
      return { ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_REJECTED' };
    }
    const usernameFragment = record.usernameFragment;
    if (usernameFragment !== undefined && typeof usernameFragment !== 'string') {
      return { ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_REJECTED' };
    }
    return {
      ok: true,
      candidate: {
        candidate: value,
        sdpMid: (sdpMid as string | null | undefined) ?? null,
        sdpMLineIndex: (sdpMLineIndex as number | null | undefined) ?? null,
        ...(usernameFragment !== undefined
          ? { usernameFragment: usernameFragment as string }
          : {}),
      },
    };
  }

  /**
   * 60 signals per 10s covers a normal ICE-candidate burst with headroom; 5
   * offers-or-answers per 30s is far tighter, since only one legitimate
   * offer and one legitimate answer should ever occur per call. Past 3x the
   * normal ceiling, the caller is told to drop the connection outright
   * rather than keep acking rejections.
   */
  private checkRateLimit(
    socketId: string,
    callId: string,
    kind: string,
  ): { ok: true } | { ok: false; code: string; disconnect?: boolean } {
    const key = `${socketId}:${callId}`;
    const now = Date.now();
    const signalsPer10s = this.config.get<number>('ASSIGNMENT_CALL_SIGNALS_PER_10S', 60);

    // Every attempt is recorded, not only the ones that pass -- a client
    // hammering well past the limit must still be countable up to the hard
    // ceiling below, or "past a hard ceiling, disconnect" can never trigger
    // (a rejected attempt that left no trace would let the count plateau
    // exactly at the ordinary limit forever, no matter how much it keeps
    // sending).
    const allWindow = this.prune(this.allSignalTimestamps, key, now, 10_000);
    allWindow.push(now);
    this.allSignalTimestamps.set(key, allWindow);

    if (allWindow.length > signalsPer10s * 3) {
      return {
        ok: false,
        code: 'ASSIGNMENT_CALL_SIGNAL_RATE_LIMITED',
        disconnect: true,
      };
    }
    if (allWindow.length > signalsPer10s) {
      return { ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_RATE_LIMITED' };
    }

    if (kind === 'offer' || kind === 'answer') {
      const offerAnswerWindow = this.prune(
        this.offerAnswerTimestamps,
        key,
        now,
        30_000,
      );
      offerAnswerWindow.push(now);
      this.offerAnswerTimestamps.set(key, offerAnswerWindow);
      if (offerAnswerWindow.length > 5) {
        return { ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_RATE_LIMITED' };
      }
    }

    return { ok: true };
  }

  private prune(
    store: Map<string, number[]>,
    key: string,
    now: number,
    windowMs: number,
  ): number[] {
    const existing = store.get(key) ?? [];
    return existing.filter((timestamp) => now - timestamp < windowMs);
  }

  private checkStateGate(
    kind: string,
    call: CallStateSnapshot,
    actorId: string,
  ): { ok: true } | { ok: false; code: string } {
    if (kind !== 'offer' && kind !== 'answer') return { ok: true };

    const isCaller = call.callerId === actorId;
    if (kind === 'offer' && !isCaller) {
      return { ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_REJECTED' };
    }
    // An answer is only legitimate from the callee, and only once the
    // durable command has actually recorded the call as answered -- without
    // this a callee could establish media on a call whose durable history
    // says `missed`.
    if (kind === 'answer' && (isCaller || call.answeredAt === null)) {
      return { ok: false, code: 'ASSIGNMENT_CALL_SIGNAL_REJECTED' };
    }
    return { ok: true };
  }

  private async loadCallState(callId: string): Promise<CallStateSnapshot | null> {
    const cached = this.callStateCache.get(callId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const row = await this.database.assignmentCall.findUnique({
      where: { id: callId },
      select: {
        outcome: true,
        answered_at: true,
        ended_at: true,
        caller_id: true,
        callee_id: true,
        caller: { select: { status: true } },
        callee: { select: { status: true } },
        participations: {
          where: { active: true },
          select: { user_id: true, active: true },
        },
      },
    });

    const value: CallStateSnapshot | null = row
      ? {
          callerId: row.caller_id,
          outcome: row.outcome,
          answeredAt: row.answered_at,
          endedAt: row.ended_at,
          participants: new Map(
            row.participations.map((participation) => [
              participation.user_id,
              {
                active: participation.active,
                status:
                  participation.user_id === row.caller_id
                    ? row.caller.status
                    : row.callee.status,
              },
            ]),
          ),
        }
      : null;

    this.callStateCache.set(callId, {
      value,
      expiresAt: Date.now() + CALL_STATE_CACHE_TTL_MS,
    });
    return value;
  }
}
