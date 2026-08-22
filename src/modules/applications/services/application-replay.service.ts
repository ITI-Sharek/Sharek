import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ApplicationAuditAction, Prisma } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { ConflictApplicationError } from '../../../shared/errors/application.error';
import {
  APPLICATION_INCLUDE,
  ApplicationWithSnapshots,
  OWNER_DECISION_INCLUDE,
  OwnerDecisionWithResult,
} from '../mappers/application.mapper';
import { concurrentDecision } from '../policies/application-command.policy';

export function applicationCommandFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Idempotent-command replay and race resolution for Applications: reads back
 * what a previous attempt with the same idempotency key recorded, refuses a
 * key reused for a different command, and turns a lost uniqueness or
 * concurrency race into either the recorded result or a stable conflict.
 */
@Injectable()
export class ApplicationReplayService {
  constructor(private readonly database: DatabaseService) {}

  async readReplay(input: {
    actorId: string;
    action: ApplicationAuditAction;
    idempotencyKey: string | null;
    fingerprint: string;
  }): Promise<ApplicationWithSnapshots | null> {
    if (!input.idempotencyKey) return null;
    const audit = await this.database.applicationAudit.findFirst({
      where: {
        actor_id: input.actorId,
        action: input.action,
        idempotency_key: input.idempotencyKey,
      },
      include: { application: { include: APPLICATION_INCLUDE } },
    });
    return this.presentReplay(audit, input.fingerprint);
  }

  async readReplayFromTransaction(input: {
    transaction: Prisma.TransactionClient;
    actorId: string;
    action: ApplicationAuditAction;
    idempotencyKey: string;
    fingerprint: string;
  }): Promise<ApplicationWithSnapshots | null> {
    const audit = await input.transaction.applicationAudit.findFirst({
      where: {
        actor_id: input.actorId,
        action: input.action,
        idempotency_key: input.idempotencyKey,
      },
      include: { application: { include: APPLICATION_INCLUDE } },
    });
    return this.presentReplay(audit, input.fingerprint);
  }

  async readOwnerDecisionReplay(input: {
    ownerId: string;
    idempotencyKey: string;
    fingerprint: string;
  }): Promise<OwnerDecisionWithResult | null> {
    const decision = await this.database.ownerDecision.findUnique({
      where: {
        owner_id_idempotency_key: {
          owner_id: input.ownerId,
          idempotency_key: input.idempotencyKey,
        },
      },
      include: OWNER_DECISION_INCLUDE,
    });
    return this.presentOwnerDecisionReplay(decision, input.fingerprint);
  }

  async readOwnerDecisionReplayFromTransaction(input: {
    transaction: Prisma.TransactionClient;
    ownerId: string;
    idempotencyKey: string;
    fingerprint: string;
  }): Promise<OwnerDecisionWithResult | null> {
    const decision = await input.transaction.ownerDecision.findUnique({
      where: {
        owner_id_idempotency_key: {
          owner_id: input.ownerId,
          idempotency_key: input.idempotencyKey,
        },
      },
      include: OWNER_DECISION_INCLUDE,
    });
    return this.presentOwnerDecisionReplay(decision, input.fingerprint);
  }

  async resolveOwnerDecisionRaceOrThrow(input: {
    error: unknown;
    ownerId: string;
    idempotencyKey: string;
    fingerprint: string;
  }): Promise<OwnerDecisionWithResult> {
    const mayHaveLostRace =
      (input.error instanceof Prisma.PrismaClientKnownRequestError &&
        input.error.code === 'P2002') ||
      (input.error instanceof ConflictApplicationError &&
        [
          'APPLICATION_CONCURRENT_MODIFICATION',
          'APPLICATION_TERMINAL',
          'REQUEST_TERMINAL',
        ].includes(input.error.code));
    if (mayHaveLostRace) {
      const replay = await this.readOwnerDecisionReplay(input);
      if (replay) return replay;
      if (
        input.error instanceof Prisma.PrismaClientKnownRequestError &&
        input.error.code === 'P2002'
      ) {
        throw concurrentDecision();
      }
    }
    throw input.error;
  }

  private presentReplay(
    audit: Prisma.ApplicationAuditGetPayload<{
      include: { application: { include: typeof APPLICATION_INCLUDE } };
    }> | null,
    fingerprint: string,
  ): ApplicationWithSnapshots | null {
    if (!audit) return null;
    if (audit.command_fingerprint !== fingerprint) {
      throw new ConflictApplicationError(
        'Idempotency key was already used for another Application command',
        'APPLICATION_IDEMPOTENCY_CONFLICT',
      );
    }
    return audit.application;
  }

  private presentOwnerDecisionReplay(
    decision: OwnerDecisionWithResult | null,
    fingerprint: string,
  ): OwnerDecisionWithResult | null {
    if (!decision) return null;
    if (decision.command_fingerprint !== fingerprint) {
      throw new ConflictApplicationError(
        'Idempotency key was already used for another Owner Decision',
        'APPLICATION_IDEMPOTENCY_CONFLICT',
      );
    }
    return decision;
  }
}
