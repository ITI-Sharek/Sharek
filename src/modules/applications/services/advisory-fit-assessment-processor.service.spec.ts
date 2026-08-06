import { Logger } from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';

import { ApplicationError } from '../../../shared/errors/application.error';
import { AdvisoryFitAssessmentProcessorService } from './advisory-fit-assessment-processor.service';

describe('AdvisoryFitAssessmentProcessorService', () => {
  const ownerId = '77777777-7777-4777-8777-777777777777';
  const contributorId = '11111111-1111-4111-8111-111111111111';
  const applicationId = '33333333-3333-4333-8333-333333333333';
  const requestId = '22222222-2222-4222-8222-222222222222';
  const assessmentId = '55555555-5555-4555-8555-555555555555';

  const application = (overrides: Record<string, unknown> = {}) => ({
    id: applicationId,
    contribution_request_id: requestId,
    contributor_id: contributorId,
    status: ApplicationStatus.pending_owner_review,
    requirement_snapshot_id: '66666666-6666-4666-8666-666666666666',
    evidence_snapshot_id: '77777777-7777-4777-8777-777777777778',
    requirementSnapshot: {
      id: '66666666-6666-4666-8666-666666666666',
      requirements: [
        { id: 'required-1', kind: 'required', position: 0, text: 'NestJS' },
        { id: 'preferred-1', kind: 'preferred', position: 0, text: 'Redis' },
      ],
    },
    evidenceSnapshot: {
      id: '77777777-7777-4777-8777-777777777778',
      evidence: [
        {
          skillProfileId: 'skill-1',
          name: 'NestJS',
          evidenceSources: { evidenceIds: ['github:evidence-1'] },
        },
      ],
    },
    ...overrides,
  });

  /** A request as the worker finds it: still `requested`, no attempts yet. */
  const requestedRequest = (overrides: Record<string, unknown> = {}) => ({
    id: assessmentId,
    application_id: applicationId,
    contribution_request_id: requestId,
    owner_id: ownerId,
    status: 'requested',
    requested_at: new Date('2026-08-02T12:00:00.000Z'),
    completed_at: null,
    attempts: [],
    ...overrides,
  });

  const providerResult = (
    requiredFinding: 'SUPPORTED' | 'PARTIALLY_SUPPORTED' | 'NOT_EVIDENCED' | 'INCONCLUSIVE',
  ) => ({
    kind: 'completed' as const,
    provider: 'deterministic-fake',
    model: 'fixture-v1',
    promptVersion: 'advisory-fit-v1',
    schemaVersion: '1',
    serviceVersion: 'test',
    findings: [
      {
        requirementId: 'required-1',
        requirementKind: 'required' as const,
        finding: requiredFinding,
        confidence: 'HIGH' as const,
        citations: ['github:evidence-1'],
        uncertainty: [],
        explanation: 'The evidence was evaluated against the fixed requirement.',
      },
      {
        requirementId: 'preferred-1',
        requirementKind: 'preferred' as const,
        finding: 'NOT_EVIDENCED' as const,
        confidence: 'LOW' as const,
        citations: ['github:evidence-1'],
        uncertainty: ['The snapshot contains no Redis-specific evidence.'],
        explanation: 'The preferred signal is not demonstrated in the supplied evidence.',
      },
    ],
  });

  const database = {
    $transaction: jest.fn(),
    application: { findUnique: jest.fn() },
    assessmentRequest: { findUnique: jest.fn(), updateMany: jest.fn() },
    assessmentAttempt: { create: jest.fn() },
    advisoryFitAssessment: { create: jest.fn() },
    assessmentFinding: { createMany: jest.fn() },
    assessmentRequestAudit: { create: jest.fn() },
  };
  const ai = { requestAdvisoryFit: jest.fn() };
  const processor = new AdvisoryFitAssessmentProcessorService(
    database as never,
    ai as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) => callback(database),
    );
    database.assessmentRequest.findUnique.mockResolvedValue(requestedRequest());
    database.application.findUnique.mockResolvedValue(application());
    // The claim succeeds by default; individual tests override it to simulate
    // losing the race to the reaper or a duplicate delivery.
    database.assessmentRequest.updateMany.mockResolvedValue({ count: 1 });
    database.assessmentAttempt.create.mockResolvedValue({ id: 'attempt-1' });
    database.advisoryFitAssessment.create.mockResolvedValue({ id: 'fit-1' });
    database.assessmentFinding.createMany.mockResolvedValue({ count: 2 });
    database.assessmentRequestAudit.create.mockResolvedValue({});
    ai.requestAdvisoryFit.mockResolvedValue(providerResult('SUPPORTED'));
  });

  async function recordedErrorCode(): Promise<unknown> {
    await processor.process(assessmentId, 1);
    const call = database.assessmentAttempt.create.mock.calls[0]?.[0] as {
      data: { error_code?: string };
    };
    return call?.data.error_code;
  }

  it('completes an attempt from the fixed snapshots and derives a strong band', async () => {
    await expect(processor.process(assessmentId, 1)).resolves.toEqual({
      outcome: 'completed',
      attemptNumber: 1,
    });

    expect(database.advisoryFitAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fit_band: 'strong' }),
      }),
    );
    expect(database.assessmentFinding.createMany).toHaveBeenCalled();
    expect(database.assessmentRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: assessmentId, status: 'requested' },
        data: expect.objectContaining({ status: 'completed' }),
      }),
    );
  });

  it.each([
    ['SUPPORTED', 'strong'],
    ['PARTIALLY_SUPPORTED', 'partial'],
    ['NOT_EVIDENCED', 'limited'],
    ['INCONCLUSIVE', 'unknown'],
  ] as const)('derives %s as %s while ignoring Preferred findings', async (finding, band) => {
    ai.requestAdvisoryFit.mockResolvedValueOnce(providerResult(finding));

    await processor.process(assessmentId, 1);

    expect(database.advisoryFitAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fit_band: band }) }),
    );
  });

  it('rejects findings citing evidence outside the fixed snapshot', async () => {
    // Full coverage on purpose: an incomplete response fails earlier, on the
    // coverage check, and would never reach the citation validation.
    const result = providerResult('SUPPORTED');
    result.findings[0].citations = ['invented-evidence'];
    ai.requestAdvisoryFit.mockResolvedValueOnce(result);

    await expect(processor.process(assessmentId, 1)).resolves.toEqual({
      outcome: 'unavailable',
      attemptNumber: 1,
    });
    expect(database.advisoryFitAssessment.create).not.toHaveBeenCalled();
    expect(database.assessmentAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          error_code: 'AI_ADVISORY_FIT_RESPONSE_INVALID',
        }),
      }),
    );
  });

  it('does not call the provider when the fixed evidence snapshot is not assessable', async () => {
    database.application.findUnique.mockResolvedValue(
      application({
        evidenceSnapshot: {
          id: '77777777-7777-4777-8777-777777777778',
          evidence: [],
        },
      }),
    );

    await expect(processor.process(assessmentId, 1)).resolves.toEqual({
      outcome: 'not_started_no_assessable_evidence',
      attemptNumber: null,
    });
    expect(ai.requestAdvisoryFit).not.toHaveBeenCalled();
    expect(database.assessmentAttempt.create).not.toHaveBeenCalled();
  });

  it('keeps a system-limit result retriable without inventing an attempt', async () => {
    ai.requestAdvisoryFit.mockResolvedValueOnce({ kind: 'system_limit' });

    await expect(processor.process(assessmentId, 1)).resolves.toEqual({
      outcome: 'not_started_system_limit',
      attemptNumber: null,
    });
    expect(database.assessmentAttempt.create).not.toHaveBeenCalled();
    expect(database.assessmentRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'not_started_system_limit',
          completed_at: null,
        }),
      }),
    );
  });

  it('cancels without an attempt when the Application left owner review', async () => {
    database.application.findUnique.mockResolvedValue(
      application({ status: ApplicationStatus.accepted }),
    );

    await expect(processor.process(assessmentId, 1)).resolves.toEqual({
      outcome: 'cancelled_not_needed',
      attemptNumber: null,
    });
    expect(ai.requestAdvisoryFit).not.toHaveBeenCalled();
    expect(database.assessmentAttempt.create).not.toHaveBeenCalled();
  });

  it('links a retry to the prior immutable attempt', async () => {
    const firstAttemptId = '88888888-8888-4888-8888-888888888888';
    database.assessmentRequest.findUnique.mockResolvedValue(
      requestedRequest({
        attempts: [
          {
            id: firstAttemptId,
            attempt_number: 1,
            status: 'failed',
            advisoryFitAssessment: null,
          },
        ],
      }),
    );

    await expect(processor.process(assessmentId, 2)).resolves.toEqual({
      outcome: 'completed',
      attemptNumber: 2,
    });
    expect(database.assessmentAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attempt_number: 2,
          retry_of_attempt_id: firstAttemptId,
        }),
      }),
    );
  });

  describe('failure attribution', () => {
    it('blames our own snapshot when a requirement entry is malformed', async () => {
      const broken = application();
      broken.requirementSnapshot.requirements = [
        { id: '', kind: 'required', position: 0, text: 'NestJS' },
        { id: 'preferred-1', kind: 'preferred', position: 0, text: 'Redis' },
      ];
      database.application.findUnique.mockResolvedValue(broken);

      await expect(recordedErrorCode()).resolves.toBe(
        'ASSESSMENT_REQUIREMENT_SNAPSHOT_INVALID',
      );
    });

    it('blames our own snapshot when it carries duplicate requirement ids', async () => {
      const duplicated = application();
      duplicated.requirementSnapshot.requirements = [
        { id: 'required-1', kind: 'required', position: 0, text: 'NestJS' },
        { id: 'required-1', kind: 'required', position: 1, text: 'NestJS' },
      ];
      database.application.findUnique.mockResolvedValue(duplicated);

      await expect(recordedErrorCode()).resolves.toBe(
        'ASSESSMENT_REQUIREMENT_SNAPSHOT_INVALID',
      );
    });

    it('blames the provider when it does not cover every requirement', async () => {
      const partial = providerResult('SUPPORTED');
      partial.findings = [partial.findings[0]];
      ai.requestAdvisoryFit.mockResolvedValueOnce(partial);

      await expect(recordedErrorCode()).resolves.toBe(
        'AI_ADVISORY_FIT_COVERAGE_INCOMPLETE',
      );
    });

    it('records an unclassified provider throw as unavailable and logs it', async () => {
      const logged = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      ai.requestAdvisoryFit.mockRejectedValueOnce(
        new TypeError('client is not a function'),
      );

      await expect(recordedErrorCode()).resolves.toBe(
        'AI_ADVISORY_FIT_SERVICE_UNAVAILABLE',
      );
      expect(logged).toHaveBeenCalled();
    });
  });

  describe('job contract', () => {
    it('never throws when the provider fails, so the job is not retried', async () => {
      // BullMQ's three attempts and the provider's two are different budgets.
      // Rethrowing here would write three attempt rows against a two-attempt
      // limit and collide on the (request, attempt_number) unique index.
      ai.requestAdvisoryFit.mockRejectedValueOnce(
        new ApplicationError(
          'Advisory Fit service is unavailable',
          'AI_ADVISORY_FIT_SERVICE_UNAVAILABLE',
        ),
      );

      await expect(processor.process(assessmentId, 1)).resolves.toEqual({
        outcome: 'unavailable',
        attemptNumber: 1,
      });
      expect(database.assessmentAttempt.create).toHaveBeenCalledTimes(1);
    });

    it('throws on infrastructure failure so the queue can retry it', async () => {
      database.assessmentRequest.findUnique.mockRejectedValueOnce(
        new Error('connection terminated unexpectedly'),
      );

      await expect(processor.process(assessmentId, 1)).rejects.toThrow(
        'connection terminated',
      );
    });

    it('writes nothing when the request is no longer requested', async () => {
      // The claim is the first statement of the terminal transaction, so this
      // only passes if that ordering holds -- which is what stops a reaper race
      // from producing a second attempt and a duplicate pair of audit rows.
      database.assessmentRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(processor.process(assessmentId, 1)).resolves.toEqual({
        outcome: 'superseded',
      });
      expect(database.assessmentAttempt.create).not.toHaveBeenCalled();
      expect(database.advisoryFitAssessment.create).not.toHaveBeenCalled();
      expect(database.assessmentRequestAudit.create).not.toHaveBeenCalled();
    });

    it('ignores a duplicate delivery of an attempt that already ran', async () => {
      database.assessmentRequest.findUnique.mockResolvedValue(
        requestedRequest({
          attempts: [{ id: 'attempt-1', attempt_number: 1, status: 'failed' }],
        }),
      );

      await expect(processor.process(assessmentId, 1)).resolves.toEqual({
        outcome: 'superseded',
      });
      expect(ai.requestAdvisoryFit).not.toHaveBeenCalled();
    });

    it('ignores a request that a terminal write already finished', async () => {
      database.assessmentRequest.findUnique.mockResolvedValue(
        requestedRequest({ status: 'completed' }),
      );

      await expect(processor.process(assessmentId, 1)).resolves.toEqual({
        outcome: 'superseded',
      });
      expect(ai.requestAdvisoryFit).not.toHaveBeenCalled();
    });

    it('does not throw when the request row has disappeared', async () => {
      database.assessmentRequest.findUnique.mockResolvedValue(null);

      await expect(processor.process(assessmentId, 1)).resolves.toEqual({
        outcome: 'superseded',
      });
    });
  });
});
