import { ApplicationStatus, OwnerDecisionType } from '@prisma/client';

import { ApplicationWithSnapshots } from './application.mapper';
import {
  addDays,
  toApplicationDto,
  toApplicationStatusDto,
  toEmptyOwnerWorkspaceSummaryDto,
  toJsonObject,
  toOwnerDecisionResultDto,
} from './application.mapper';

function buildApplication(
  overrides: Record<string, unknown> = {},
): ApplicationWithSnapshots {
  const submittedAt = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'application-1',
    contribution_request_id: 'request-1',
    contributor_id: 'contributor-1',
    contribution_approach: 'Approach text',
    cover_message: null,
    proposed_delivery_duration_days: 14,
    status: ApplicationStatus.pending_owner_review,
    submitted_at: submittedAt,
    review_due_at: addDays(submittedAt, 3),
    expires_at: addDays(submittedAt, 7),
    expired_at: null,
    requirementSnapshot: {
      requirements: [
        { id: 'req-1', kind: 'required', position: 1, text: 'First' },
        { id: 'req-2', kind: 'preferred', position: 2, text: 'Second' },
        { id: 'req-3', kind: 'unknown', position: 3, text: 'Junk' },
      ],
    },
    evidenceSnapshot: {
      contributor_context: {
        username: 'contributor',
        displayName: 'Contributor Name',
        profile: {
          bio: 'Bio',
          availability: 'part-time',
          experienceLevel: {
            key: 'senior',
            labelEn: 'Senior',
            labelAr: 'كبير',
          },
          fields: [{ key: 'frontend', labelEn: 'Frontend', labelAr: 'واجهة' }],
          declaredSkills: ['typescript', 42],
        },
      },
      evidence: [
        {
          skillProfileId: 'skill-1',
          name: 'TypeScript',
          proficiencyLevel: 'advanced',
          evidenceSummary: 'Shipped three projects',
          evidenceSources: { limitations: ['No backend depth', 7] },
        },
        'not-an-object',
      ],
    },
    ownerDecision: null,
    assignment: null,
    ...overrides,
  } as unknown as ApplicationWithSnapshots;
}

describe('application.mapper', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('maps an Application with snapshots to the DTO contract', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));

    expect(toApplicationDto(buildApplication())).toEqual({
      id: 'application-1',
      contributionRequestId: 'request-1',
      contributor: {
        id: 'contributor-1',
        username: 'contributor',
        displayName: 'Contributor Name',
      },
      profileContext: {
        bio: 'Bio',
        availability: 'part-time',
        experienceLevel: {
          key: 'senior',
          labelEn: 'Senior',
          labelAr: 'كبير',
        },
        fields: [{ key: 'frontend', labelEn: 'Frontend', labelAr: 'واجهة' }],
        declaredSkills: ['typescript'],
      },
      contributionApproach: 'Approach text',
      proposedDeliveryDurationDays: 14,
      status: 'PENDING_OWNER_REVIEW',
      requirementSnapshot: {
        required: [
          { id: 'req-1', position: 1, text: 'First' },
        ],
        preferred: [{ id: 'req-2', position: 2, text: 'Second' }],
      },
      evidenceSummary: [
        {
          skillProfileId: 'skill-1',
          name: 'TypeScript',
          proficiencyLevel: 'advanced',
          evidenceSummary: 'Shipped three projects',
          limitations: ['No backend depth'],
        },
        // A junk snapshot entry is coerced to defaults, not dropped —
        // preserving the pre-extraction service behavior.
        {
          skillProfileId: '',
          name: '',
          proficiencyLevel: 'beginner',
          evidenceSummary: null,
          limitations: [],
        },
      ],
      submittedAt: new Date('2026-01-01T00:00:00.000Z'),
      reviewDueAt: new Date('2026-01-04T00:00:00.000Z'),
      expiresAt: new Date('2026-01-08T00:00:00.000Z'),
      expiredAt: null,
      overdue: false,
      ownerDecision: null,
      assignment: null,
    });
  });

  it('falls back to cover_message and a generic display name when context is missing', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));

    const dto = toApplicationDto(
      buildApplication({
        contribution_approach: null,
        cover_message: 'Legacy cover message',
        evidenceSnapshot: null,
      }),
    );

    expect(dto.contributionApproach).toBe('Legacy cover message');
    expect(dto.contributor.displayName).toBe('Contributor');
    expect(dto.profileContext.declaredSkills).toEqual([]);
    expect(dto.evidenceSummary).toEqual([]);
  });

  it('marks overdue inclusively at the day-5 boundary only while review is pending', () => {
    jest.useFakeTimers();
    const submittedAt = new Date('2026-01-01T00:00:00.000Z');
    jest.setSystemTime(addDays(submittedAt, 5));

    expect(
      toApplicationDto(buildApplication({ submitted_at: submittedAt })).overdue,
    ).toBe(true);

    jest.setSystemTime(addDays(submittedAt, 5).getTime() - 1);
    expect(
      toApplicationDto(buildApplication({ submitted_at: submittedAt })).overdue,
    ).toBe(false);

    jest.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    expect(
      toApplicationDto(
        buildApplication({
          submitted_at: submittedAt,
          status: ApplicationStatus.accepted,
        }),
      ).overdue,
    ).toBe(false);
  });

  it('maps an Owner Decision with its Application and Assignment', () => {
    const application = buildApplication();
    const decidedAt = new Date('2026-01-03T00:00:00.000Z');
    const decision = {
      id: 'decision-1',
      application_id: 'application-1',
      contribution_request_id: 'request-1',
      decision_type: OwnerDecisionType.accepted,
      feedback: null,
      decided_at: decidedAt,
      application,
      assignment: {
        id: 'assignment-1',
        contribution_request_id: 'request-1',
        application_id: 'application-1',
        owner_decision_id: 'decision-1',
        contributor_id: 'contributor-1',
        agreed_delivery_duration_days: 14,
        agreed_delivery_due_at: new Date('2026-01-15T00:00:00.000Z'),
        assigned_at: decidedAt,
      },
    };

    const result = toOwnerDecisionResultDto(
      decision as Parameters<typeof toOwnerDecisionResultDto>[0],
    );

    expect(result.ownerDecision).toEqual({
      id: 'decision-1',
      applicationId: 'application-1',
      contributionRequestId: 'request-1',
      decisionType: 'ACCEPTED',
      feedback: null,
      decidedAt,
    });
    expect(result.assignment).toEqual({
      id: 'assignment-1',
      contributionRequestId: 'request-1',
      applicationId: 'application-1',
      ownerDecisionId: 'decision-1',
      contributorId: 'contributor-1',
      agreedDeliveryDurationDays: 14,
      agreedDeliveryDueDate: new Date('2026-01-15T00:00:00.000Z'),
      assignedAt: decidedAt,
    });
    expect(result.application.id).toBe('application-1');
  });

  it('builds a zero-count owner workspace summary preserving scope order', () => {
    expect(
      toEmptyOwnerWorkspaceSummaryDto([
        { projectId: 'project-2', contributionRequestIds: [] },
        { projectId: 'project-1', contributionRequestIds: ['request-1'] },
      ]),
    ).toEqual({
      projects: [
        { projectId: 'project-2', pendingApplicationCount: 0 },
        { projectId: 'project-1', pendingApplicationCount: 0 },
      ],
    });
  });

  it('uppercases Prisma statuses and coerces JSON values defensively', () => {
    expect(toApplicationStatusDto(ApplicationStatus.not_selected)).toBe(
      'NOT_SELECTED',
    );
    expect(toJsonObject({ a: 1 })).toEqual({ a: 1 });
    expect(toJsonObject(['array'])).toEqual({});
    expect(toJsonObject(null)).toEqual({});
  });
});
