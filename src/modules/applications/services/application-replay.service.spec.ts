import { ApplicationAuditAction, Prisma } from '@prisma/client';

import {
  ApplicationReplayService,
  applicationCommandFingerprint,
} from './application-replay.service';
import { ConflictApplicationError } from '../../../shared/errors/application.error';

const fingerprint = applicationCommandFingerprint({
  action: ApplicationAuditAction.submitted,
});

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
  });
}

describe('ApplicationReplayService', () => {
  const database = {
    applicationAudit: { findFirst: jest.fn() },
    ownerDecision: { findUnique: jest.fn() },
  };
  const service = new ApplicationReplayService(database as never);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('applicationCommandFingerprint', () => {
    it('is deterministic for a command and differs across commands', () => {
      expect(applicationCommandFingerprint({ a: 1 })).toBe(
        applicationCommandFingerprint({ a: 1 }),
      );
      expect(applicationCommandFingerprint({ a: 1 })).not.toBe(
        applicationCommandFingerprint({ a: 2 }),
      );
    });
  });

  describe('readReplay', () => {
    it('returns null without querying when no idempotency key was given', async () => {
      await expect(
        service.readReplay({
          actorId: 'contributor-1',
          action: ApplicationAuditAction.submitted,
          idempotencyKey: null,
          fingerprint,
        }),
      ).resolves.toBeNull();
      expect(database.applicationAudit.findFirst).not.toHaveBeenCalled();
    });

    it('returns the audited Application when the command fingerprint matches', async () => {
      const application = { id: 'application-1' };
      database.applicationAudit.findFirst.mockResolvedValue({
        command_fingerprint: fingerprint,
        application,
      });

      await expect(
        service.readReplay({
          actorId: 'contributor-1',
          action: ApplicationAuditAction.submitted,
          idempotencyKey: 'key-1',
          fingerprint,
        }),
      ).resolves.toBe(application);
    });

    it('refuses a key reused for a different Application command', async () => {
      database.applicationAudit.findFirst.mockResolvedValue({
        command_fingerprint: 'different-command',
        application: { id: 'application-1' },
      });

      await expect(
        service.readReplay({
          actorId: 'contributor-1',
          action: ApplicationAuditAction.submitted,
          idempotencyKey: 'key-1',
          fingerprint,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'APPLICATION_IDEMPOTENCY_CONFLICT',
          statusCode: 409,
        }),
      );
    });

    it('reads the same audit inside the caller transaction', async () => {
      const transaction = {
        applicationAudit: {
          findFirst: jest.fn().mockResolvedValue({
            command_fingerprint: fingerprint,
            application: { id: 'application-1' },
          }),
        },
      };

      await expect(
        service.readReplayFromTransaction({
          transaction: transaction as never,
          actorId: 'contributor-1',
          action: ApplicationAuditAction.submitted,
          idempotencyKey: 'key-1',
          fingerprint,
        }),
      ).resolves.toEqual({ id: 'application-1' });
      expect(transaction.applicationAudit.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe('readOwnerDecisionReplay', () => {
    it('returns the decision on a fingerprint match and refuses a mismatch', async () => {
      const decision = { id: 'decision-1', command_fingerprint: fingerprint };
      database.ownerDecision.findUnique.mockResolvedValueOnce(decision);
      await expect(
        service.readOwnerDecisionReplay({
          ownerId: 'owner-1',
          idempotencyKey: 'key-1',
          fingerprint,
        }),
      ).resolves.toBe(decision);

      database.ownerDecision.findUnique.mockResolvedValueOnce({
        id: 'decision-2',
        command_fingerprint: 'different-command',
      });
      await expect(
        service.readOwnerDecisionReplay({
          ownerId: 'owner-1',
          idempotencyKey: 'key-1',
          fingerprint,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: 'APPLICATION_IDEMPOTENCY_CONFLICT' }),
      );
    });
  });

  describe('resolveOwnerDecisionRaceOrThrow', () => {
    const input = {
      ownerId: 'owner-1',
      idempotencyKey: 'key-1',
      fingerprint,
    };

    it('returns the recorded decision when a P2002 loser finds a matching replay', async () => {
      const decision = { id: 'decision-1', command_fingerprint: fingerprint };
      database.ownerDecision.findUnique.mockResolvedValueOnce(decision);

      await expect(
        service.resolveOwnerDecisionRaceOrThrow({ ...input, error: p2002() }),
      ).resolves.toBe(decision);
    });

    it('maps an unreplayed P2002 to APPLICATION_CONCURRENT_MODIFICATION', async () => {
      database.ownerDecision.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.resolveOwnerDecisionRaceOrThrow({ ...input, error: p2002() }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'APPLICATION_CONCURRENT_MODIFICATION',
          statusCode: 409,
        }),
      );
    });

    it('resolves concurrency-code races through the replay before rethrowing', async () => {
      const decision = { id: 'decision-1', command_fingerprint: fingerprint };
      database.ownerDecision.findUnique.mockResolvedValueOnce(decision);

      await expect(
        service.resolveOwnerDecisionRaceOrThrow({
          ...input,
          error: new ConflictApplicationError(
            'Application changed during the Owner Decision',
            'APPLICATION_CONCURRENT_MODIFICATION',
          ),
        }),
      ).resolves.toBe(decision);
    });

    it('rethrows errors that cannot be a lost race untouched', async () => {
      const unrelated = new Error('infrastructure');

      await expect(
        service.resolveOwnerDecisionRaceOrThrow({ ...input, error: unrelated }),
      ).rejects.toBe(unrelated);
      expect(database.ownerDecision.findUnique).not.toHaveBeenCalled();
    });
  });
});
