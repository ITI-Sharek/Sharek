import { Prisma, ReportReason, ReportStatus } from '@prisma/client';

import { DecisionFeedbackReportsService } from './decision-feedback-reports.service';

describe('DecisionFeedbackReportsService', () => {
  const actor = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'contributor@example.com',
    role: 'contributor' as const,
    status: 'active' as const,
  };
  const ownerDecisionId = '22222222-2222-4222-8222-222222222222';
  const applicationId = '33333333-3333-4333-8333-333333333333';
  const database = {
    report: { create: jest.fn() },
  };
  const applications = {
    getOwnerDecisionReportContext: jest.fn(),
  };
  const service = new DecisionFeedbackReportsService(
    database as never,
    applications as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    applications.getOwnerDecisionReportContext.mockResolvedValue({
      ownerDecisionId,
      applicationId,
      contributionRequestId: '44444444-4444-4444-8444-444444444444',
      contributorId: actor.id,
      ownerId: '55555555-5555-4555-8555-555555555555',
      feedback: 'Abusive decision feedback',
    });
    database.report.create.mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      owner_decision_id: ownerDecisionId,
      reason: ReportReason.harassment,
      description: 'The feedback contains abusive language.',
      status: ReportStatus.open,
      created_at: new Date('2026-07-29T12:00:00.000Z'),
    });
  });

  it('creates a moderation Report linked to the declined Owner Decision without changing the Application', async () => {
    await expect(
      service.create({
        actor,
        ownerDecisionId,
        reason: ReportReason.harassment,
        description: '  The feedback contains abusive language.  ',
      }),
    ).resolves.toEqual({
      id: '66666666-6666-4666-8666-666666666666',
      ownerDecisionId,
      reason: ReportReason.harassment,
      description: 'The feedback contains abusive language.',
      status: ReportStatus.open,
      createdAt: new Date('2026-07-29T12:00:00.000Z'),
    });

    expect(applications.getOwnerDecisionReportContext).toHaveBeenCalledWith(
      actor,
      ownerDecisionId,
    );
    expect(database.report.create).toHaveBeenCalledWith({
      data: {
        reporter_id: actor.id,
        reported_user_id: '55555555-5555-4555-8555-555555555555',
        reported_content_id: ownerDecisionId,
        reported_content_type: 'owner_decision',
        owner_decision_id: ownerDecisionId,
        reason: ReportReason.harassment,
        description: 'The feedback contains abusive language.',
      },
    });
  });

  it('returns a stable conflict when the contributor already reported the decision', async () => {
    database.report.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['reporter_id', 'owner_decision_id'] },
      }),
    );

    await expect(
      service.create({
        actor,
        ownerDecisionId,
        reason: ReportReason.harassment,
        description: 'The feedback contains abusive language.',
      }),
    ).rejects.toMatchObject({
      code: 'OWNER_DECISION_REPORT_ALREADY_EXISTS',
      statusCode: 409,
    });
  });

  it('does not misreport an unrelated unique-constraint failure as a duplicate feedback report', async () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['id'] },
      },
    );
    database.report.create.mockRejectedValue(error);

    await expect(
      service.create({
        actor,
        ownerDecisionId,
        reason: ReportReason.harassment,
        description: 'The feedback contains abusive language.',
      }),
    ).rejects.toBe(error);
  });
});
