import { AdvisoryFitAssessmentReaperService } from './advisory-fit-assessment-reaper.service';

describe('AdvisoryFitAssessmentReaperService', () => {
  const requestId = '22222222-2222-4222-8222-222222222222';
  const now = new Date('2026-08-02T12:00:00.000Z');
  const STALE_AFTER_MS = 600_000;

  const database = {
    $transaction: jest.fn(),
    assessmentRequest: { findMany: jest.fn(), updateMany: jest.fn() },
    assessmentAttempt: { findFirst: jest.fn(), create: jest.fn() },
    assessmentRequestAudit: { create: jest.fn() },
  };
  const config = { get: jest.fn() };
  const reaper = new AdvisoryFitAssessmentReaperService(
    database as never,
    config as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockImplementation((_key: string, fallback: unknown) => fallback);
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) => callback(database),
    );
    database.assessmentRequest.findMany.mockResolvedValue([{ id: requestId }]);
    database.assessmentRequest.updateMany.mockResolvedValue({ count: 1 });
    database.assessmentAttempt.findFirst.mockResolvedValue(null);
    database.assessmentAttempt.create.mockResolvedValue({ id: 'attempt-1' });
    database.assessmentRequestAudit.create.mockResolvedValue({});
  });

  it('only considers requests untouched for longer than the stale window', async () => {
    await reaper.reapStale(now);

    // updated_at, not requested_at: a retry stamps updated_at but leaves
    // requested_at at the original creation, so keying on requested_at would
    // reap a retry that started seconds ago.
    expect(database.assessmentRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'requested',
          updated_at: { lte: new Date(now.getTime() - STALE_AFTER_MS) },
        },
      }),
    );
  });

  it('releases an abandoned request with a failed attempt and system audits', async () => {
    await expect(reaper.reapStale(now)).resolves.toEqual({ reaped: 1, skipped: 0 });

    expect(database.assessmentRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: requestId, status: 'requested' },
        data: expect.objectContaining({ status: 'unavailable' }),
      }),
    );
    // A failed attempt row, not just a status flip: without one the request
    // reads as retryAvailable forever and a broken worker loops the owner.
    expect(database.assessmentAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attempt_number: 1,
          status: 'failed',
          error_code: 'ASSESSMENT_PROCESSING_ABANDONED',
        }),
      }),
    );
    expect(database.assessmentRequestAudit.create).toHaveBeenCalledTimes(2);
    expect(database.assessmentRequestAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actor_id: null, attempt_number: 1 }),
      }),
    );
  });

  it('continues the attempt numbering from the last recorded attempt', async () => {
    database.assessmentAttempt.findFirst.mockResolvedValue({
      id: 'attempt-1',
      attempt_number: 1,
    });

    await reaper.reapStale(now);

    expect(database.assessmentAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attempt_number: 2,
          retry_of_attempt_id: 'attempt-1',
        }),
      }),
    );
  });

  it('writes nothing when a processor wins the claim first', async () => {
    database.assessmentRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(reaper.reapStale(now)).resolves.toEqual({ reaped: 0, skipped: 1 });
    expect(database.assessmentAttempt.create).not.toHaveBeenCalled();
    expect(database.assessmentRequestAudit.create).not.toHaveBeenCalled();
  });

  it('keeps sweeping after one candidate fails', async () => {
    database.assessmentRequest.findMany.mockResolvedValue([
      { id: 'first' },
      { id: requestId },
    ]);
    database.$transaction
      .mockImplementationOnce(() => Promise.reject(new Error('deadlock detected')))
      .mockImplementation((callback: (t: typeof database) => unknown) =>
        callback(database),
      );

    await expect(reaper.reapStale(now)).resolves.toEqual({ reaped: 1, skipped: 1 });
  });
});
