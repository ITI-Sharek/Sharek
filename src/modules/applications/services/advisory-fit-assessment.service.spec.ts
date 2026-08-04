import { createHash } from 'node:crypto';
import {
  ApplicationStatus,
  ContributionRequestRequirementKind,
  Prisma,
} from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { ApplicationError } from '../../../shared/errors/application.error';
import { AdvisoryFitAssessmentService } from './advisory-fit-assessment.service';

describe('AdvisoryFitAssessmentService', () => {
  const owner: AuthenticatedUser = {
    id: '77777777-7777-4777-8777-777777777777',
    email: 'owner@example.com',
    role: 'owner',
    status: 'active',
  };
  const contributorId = '11111111-1111-4111-8111-111111111111';
  const applicationId = '33333333-3333-4333-8333-333333333333';
  const requestId = '22222222-2222-4222-8222-222222222222';
  const requestKey = '44444444-4444-4444-8444-444444444444';
  const assessmentId = '55555555-5555-4555-8555-555555555555';

  const application = () => ({
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
    contributionRequest: { owner_id: owner.id },
  });

  const completedRequest = (overrides: Record<string, unknown> = {}) => ({
    id: assessmentId,
    application_id: applicationId,
    contribution_request_id: requestId,
    owner_id: owner.id,
    requirement_snapshot_id: application().requirementSnapshot.id,
    evidence_snapshot_id: application().evidenceSnapshot.id,
    status: 'completed',
    fit_band: 'strong',
    idempotency_key: requestKey,
    command_fingerprint: createHash('sha256')
      .update(JSON.stringify({ action: 'requested', applicationId }))
      .digest('hex'),
    requested_at: new Date('2026-08-02T12:00:00.000Z'),
    completed_at: new Date('2026-08-02T12:00:01.000Z'),
    attempts: [
      {
        id: '88888888-8888-4888-8888-888888888888',
        attempt_number: 1,
        status: 'completed',
        advisoryFitAssessment: {
          id: '99999999-9999-4999-8999-999999999999',
          fit_band: 'strong',
          findings: [
            {
              requirement_id: 'required-1',
              requirement_kind: 'required',
              finding: 'supported',
              confidence: 'high',
              citations: ['github:evidence-1'],
              uncertainty: [],
              explanation: 'The evidence demonstrates NestJS work.',
            },
            {
              requirement_id: 'preferred-1',
              requirement_kind: 'preferred',
              finding: 'not_evidenced',
              confidence: 'low',
              citations: ['github:evidence-1'],
              uncertainty: ['The snapshot contains no Redis-specific evidence.'],
              explanation: 'Redis is not demonstrated in the supplied evidence.',
            },
          ],
        },
      },
    ],
    presentation: null,
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
    assessmentRequest: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    assessmentAttempt: { create: jest.fn() },
    advisoryFitAssessment: { create: jest.fn() },
    assessmentFinding: { createMany: jest.fn() },
    assessmentRequestAudit: { create: jest.fn(), findFirst: jest.fn() },
    assessmentPresentation: { create: jest.fn(), findUnique: jest.fn() },
  };
  const contributionTasks = {
    confirmOwnerDecisionActor: jest.fn(),
    reconfirmOwnerDecisionActor: jest.fn(),
  };
  const advisoryFitClient = { requestAdvisoryFit: jest.fn() };
  const service = new AdvisoryFitAssessmentService(
    database as never,
    contributionTasks as never,
    advisoryFitClient as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) => callback(database),
    );
    database.application.findUnique.mockResolvedValue(application());
    database.assessmentRequest.findUnique.mockResolvedValue(null);
    database.assessmentRequest.findFirst.mockResolvedValue(null);
    database.assessmentRequestAudit.findFirst.mockResolvedValue(null);
    database.assessmentRequest.updateMany.mockResolvedValue({ count: 1 });
    database.assessmentRequest.create.mockResolvedValue({
      ...completedRequest(),
      status: 'requested',
      fit_band: null,
      completed_at: null,
      attempts: [],
      presentation: null,
    });
    database.assessmentRequest.update.mockResolvedValue(completedRequest());
    database.assessmentAttempt.create.mockResolvedValue({ id: 'attempt-1' });
    database.advisoryFitAssessment.create.mockResolvedValue({ id: 'fit-1' });
    database.assessmentFinding.createMany.mockResolvedValue({ count: 2 });
    database.assessmentRequestAudit.create.mockResolvedValue({});
    database.assessmentPresentation.findUnique.mockResolvedValue(null);
    contributionTasks.confirmOwnerDecisionActor.mockResolvedValue(undefined);
    contributionTasks.reconfirmOwnerDecisionActor.mockResolvedValue(undefined);
    advisoryFitClient.requestAdvisoryFit.mockResolvedValue(providerResult('SUPPORTED'));
  });

  it('creates an owner-authorized assessment from fixed snapshots and derives a strong band', async () => {
    const result = await service.request({
      actor: owner,
      applicationId,
      idempotencyKey: requestKey,
    });

    expect(result).toMatchObject({
      id: assessmentId,
      requestStatus: 'COMPLETED',
      fitBand: 'STRONG',
      findings: [
        expect.objectContaining({ requirementId: 'required-1' }),
        expect.objectContaining({ requirementId: 'preferred-1' }),
      ],
    });
    expect(advisoryFitClient.requestAdvisoryFit).toHaveBeenCalledWith(
      expect.objectContaining({
        assessmentRequestId: assessmentId,
        requirements: application().requirementSnapshot.requirements,
        evidence: application().evidenceSnapshot.evidence,
        allowedEvidenceIds: ['github:evidence-1'],
      }),
    );
    expect(database.assessmentFinding.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            requirement_id: 'required-1',
            requirement_kind: ContributionRequestRequirementKind.required,
          }),
        ]),
      }),
    );
    expect(database.application.findUnique).toHaveBeenCalled();
  });

  it('rejects findings with missing requirements or out-of-snapshot citations', async () => {
    advisoryFitClient.requestAdvisoryFit.mockResolvedValueOnce({
      kind: 'completed',
      provider: 'deterministic-fake',
      model: 'fixture-v1',
      promptVersion: 'advisory-fit-v1',
      schemaVersion: '1',
      serviceVersion: 'test',
      findings: [
        {
          requirementId: 'required-1',
          requirementKind: 'required',
          finding: 'SUPPORTED',
          confidence: 'HIGH',
          citations: ['invented-evidence'],
          uncertainty: [],
          explanation: 'Invalid citation.',
        },
      ],
    });

    await expect(
      service.request({ actor: owner, applicationId, idempotencyKey: requestKey }),
    ).resolves.toMatchObject({ requestStatus: 'UNAVAILABLE', fitBand: 'UNAVAILABLE' });
    expect(database.advisoryFitAssessment.create).not.toHaveBeenCalled();
    expect(database.assessmentFinding.createMany).not.toHaveBeenCalled();
    expect(database.assessmentAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          provider: 'deterministic-fake',
          model: 'fixture-v1',
          prompt_version: 'advisory-fit-v1',
          error_code: 'AI_ADVISORY_FIT_RESPONSE_INVALID',
        }),
      }),
    );
  });

  it.each([
    ['SUPPORTED', 'STRONG'],
    ['PARTIALLY_SUPPORTED', 'PARTIAL'],
    ['NOT_EVIDENCED', 'LIMITED'],
    ['INCONCLUSIVE', 'UNKNOWN'],
  ] as const)('derives %s as %s while ignoring Preferred findings', async (finding, fitBand) => {
    advisoryFitClient.requestAdvisoryFit.mockResolvedValueOnce(providerResult(finding));

    await expect(
      service.request({ actor: owner, applicationId, idempotencyKey: requestKey }),
    ).resolves.toMatchObject({ requestStatus: 'COMPLETED', fitBand });
  });

  it('does not call AI when the fixed evidence snapshot is not assessable', async () => {
    database.application.findUnique.mockResolvedValueOnce({
      ...application(),
      evidenceSnapshot: { ...application().evidenceSnapshot, evidence: [] },
    });

    await expect(
      service.request({ actor: owner, applicationId, idempotencyKey: requestKey }),
    ).resolves.toMatchObject({
      requestStatus: 'NOT_STARTED_NO_ASSESSABLE_EVIDENCE',
      fitBand: null,
      findings: [],
    });
    expect(advisoryFitClient.requestAdvisoryFit).not.toHaveBeenCalled();
    expect(database.assessmentAttempt.create).not.toHaveBeenCalled();
  });

  it('keeps a system-limit request retriable without inventing an attempt', async () => {
    advisoryFitClient.requestAdvisoryFit.mockResolvedValueOnce({ kind: 'system_limit' });

    await expect(
      service.request({ actor: owner, applicationId, idempotencyKey: requestKey }),
    ).resolves.toMatchObject({
      requestStatus: 'NOT_STARTED_SYSTEM_LIMIT',
      fitBand: null,
      findings: [],
    });
    expect(database.assessmentAttempt.create).not.toHaveBeenCalled();
  });

  it('links a bounded technical retry to the prior immutable attempt', async () => {
    advisoryFitClient.requestAdvisoryFit.mockRejectedValueOnce(
      new ApplicationError(
        'Advisory Fit service is unavailable',
        'AI_ADVISORY_FIT_SERVICE_UNAVAILABLE',
      ),
    );

    await expect(
      service.request({ actor: owner, applicationId, idempotencyKey: requestKey }),
    ).resolves.toMatchObject({
      requestStatus: 'UNAVAILABLE',
      fitBand: 'UNAVAILABLE',
      attempts: 1,
      retryAvailable: true,
    });

    const firstAttemptId = '88888888-8888-4888-8888-888888888888';
    const unavailableRequest = {
      ...completedRequest(),
      status: 'unavailable',
      completed_at: new Date('2026-08-02T12:00:01.000Z'),
      attempts: [
        {
          id: firstAttemptId,
          attempt_number: 1,
          status: 'failed',
          advisoryFitAssessment: null,
        },
      ],
    };
    database.assessmentRequest.findFirst.mockResolvedValueOnce(unavailableRequest);
    database.assessmentRequest.updateMany.mockResolvedValueOnce({ count: 1 });
    advisoryFitClient.requestAdvisoryFit.mockResolvedValueOnce(providerResult('SUPPORTED'));

    const retryKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await expect(
      service.request({ actor: owner, applicationId, idempotencyKey: retryKey }),
    ).resolves.toMatchObject({
      requestStatus: 'COMPLETED',
      fitBand: 'STRONG',
      attempts: 2,
      retryAvailable: false,
    });

    expect(database.assessmentAttempt.create).toHaveBeenCalledTimes(2);
    expect(database.assessmentAttempt.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attempt_number: 2,
          retry_of_attempt_id: firstAttemptId,
        }),
      }),
    );
    expect(database.assessmentRequestAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'requested',
          from_status: 'unavailable',
          metadata: expect.objectContaining({ retry: true }),
        }),
      }),
    );
  });

  it('rejects a technical retry after the bounded attempt budget is exhausted', async () => {
    database.assessmentRequest.findFirst.mockResolvedValueOnce({
      ...completedRequest(),
      status: 'unavailable',
      attempts: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          attempt_number: 2,
          status: 'failed',
          advisoryFitAssessment: null,
        },
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          attempt_number: 1,
          status: 'failed',
          advisoryFitAssessment: null,
        },
      ],
    });

    await expect(
      service.request({
        actor: owner,
        applicationId,
        idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    ).rejects.toMatchObject({ code: 'ASSESSMENT_RETRY_LIMIT_REACHED' });
    expect(advisoryFitClient.requestAdvisoryFit).not.toHaveBeenCalled();
    expect(database.assessmentAttempt.create).not.toHaveBeenCalled();
  });

  it('presents an exhausted unavailable request without another retry', async () => {
    database.assessmentRequest.findFirst.mockResolvedValueOnce({
      ...completedRequest(),
      status: 'unavailable',
      attempts: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          attempt_number: 2,
          status: 'failed',
          advisoryFitAssessment: null,
        },
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          attempt_number: 1,
          status: 'failed',
          advisoryFitAssessment: null,
        },
      ],
    });

    await expect(service.getAssessment(owner, applicationId)).resolves.toMatchObject({
      requestStatus: 'UNAVAILABLE',
      attempts: 2,
      retryAvailable: false,
    });
  });

  it.each([
    [ApplicationStatus.accepted, 'APPLICATION_TERMINAL'],
    [ApplicationStatus.declined_by_owner, 'APPLICATION_TERMINAL'],
    [ApplicationStatus.withdrawn, 'APPLICATION_TERMINAL'],
  ])('never requests assessment for terminal Application state %s', async (status, code) => {
    database.application.findUnique.mockResolvedValueOnce({
      ...application(),
      status,
    });

    await expect(
      service.request({ actor: owner, applicationId, idempotencyKey: requestKey }),
    ).rejects.toMatchObject({ code });
    expect(advisoryFitClient.requestAdvisoryFit).not.toHaveBeenCalled();
  });

  it('replays the same idempotent request without a second provider call', async () => {
    database.assessmentRequest.findUnique.mockResolvedValueOnce(
      completedRequest(),
    );

    await expect(
      service.request({ actor: owner, applicationId, idempotencyKey: requestKey }),
    ).resolves.toMatchObject({ requestStatus: 'COMPLETED', fitBand: 'STRONG' });
    expect(advisoryFitClient.requestAdvisoryFit).not.toHaveBeenCalled();
    expect(database.assessmentRequest.create).not.toHaveBeenCalled();
  });

  it('replays a retry idempotency key from the append-only request audit', async () => {
    const retryKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    database.assessmentRequestAudit.findFirst.mockResolvedValueOnce({
      command_fingerprint: createHash('sha256')
        .update(JSON.stringify({ action: 'requested', applicationId }))
        .digest('hex'),
      assessmentRequest: completedRequest(),
    });

    await expect(
      service.request({ actor: owner, applicationId, idempotencyKey: retryKey }),
    ).resolves.toMatchObject({ requestStatus: 'COMPLETED', fitBand: 'STRONG' });
    expect(advisoryFitClient.requestAdvisoryFit).not.toHaveBeenCalled();
  });

  it('records first owner presentation in the assessment transaction', async () => {
    database.assessmentRequest.findFirst.mockResolvedValueOnce(completedRequest());

    await service.getAssessment(owner, applicationId);

    expect(database.assessmentPresentation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          advisory_fit_assessment_id: '99999999-9999-4999-8999-999999999999',
          owner_id: owner.id,
        }),
      }),
    );
    expect(database.assessmentRequestAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'presented',
          to_status: 'completed',
        }),
      }),
    );
  });

  it('returns the persisted first presentation when a concurrent read loses the uniqueness race', async () => {
    database.assessmentRequest.findFirst.mockResolvedValueOnce(completedRequest());
    database.assessmentPresentation.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('presentation already exists', {
        code: 'P2002',
        clientVersion: '6.1.0',
      }),
    );
    const persistedPresentationAt = new Date('2026-08-02T12:05:00.000Z');
    database.assessmentPresentation.findUnique.mockResolvedValueOnce({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      advisory_fit_assessment_id: '99999999-9999-4999-8999-999999999999',
      owner_id: owner.id,
      presented_at: persistedPresentationAt,
    });

    await expect(service.getAssessment(owner, applicationId)).resolves.toMatchObject({
      requestStatus: 'COMPLETED',
      presentedAt: persistedPresentationAt,
    });
    expect(database.assessmentRequestAudit.create).not.toHaveBeenCalled();
  });

});
