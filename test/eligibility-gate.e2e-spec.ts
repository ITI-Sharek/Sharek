import { ContributionRequestStatus, SkillProfileProficiencyLevel } from '@prisma/client';

import { ApplicationsService } from '../src/modules/applications/applications.service';
import { ApplicationDailyQuotaService } from '../src/modules/applications/services/application-daily-quota.service';
import { EligibilityService } from '../src/modules/eligibility/services/eligibility.service';
import { EntitlementsService } from '../src/modules/subscriptions/entitlements.service';

const CONTRIBUTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const { beginner, intermediate, advanced } = SkillProfileProficiencyLevel;

const contributor = {
  id: CONTRIBUTOR_ID,
  email: 'contributor@example.com',
  role: 'contributor' as const,
  status: 'active' as const,
};

/**
 * The gate through the real `EligibilityService` and the real
 * `ApplicationsService`, against a mocked database.
 *
 * The point is the seam: a unit test of the comparison proves the arithmetic,
 * but only running the two together proves that a block actually prevents an
 * Application row, that the refusal survives the rollback it causes, and that
 * an admin approving a higher level flips the verdict with nothing else done.
 */
describe('Eligibility gate end to end', () => {
  const database = {
    application: { findUnique: jest.fn(), create: jest.fn() },
    applicationAudit: { findFirst: jest.fn(), create: jest.fn() },
    applicationRequirementSnapshot: { create: jest.fn() },
    applicationEvidenceSnapshot: { create: jest.fn() },
    eligibilityEvaluation: { create: jest.fn() },
    usageTracker: { upsert: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    subscription: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const contributionTasks = {
    getApplicationSubmissionContext: jest.fn(),
    lockApplicationSubmissionContext: jest.fn(),
  };
  const skillProfiles = {
    listAuthorizedSkillsForApplicationSnapshot: jest.fn(),
  };
  const identity = { getUserById: jest.fn() };
  const notifications = {
    emitApplicationNotifications: jest.fn(),
    createApplicationNotification: jest.fn(),
  };
  const contributorProfiles = { getApplicationProfileContext: jest.fn() };

  const eligibility = new EligibilityService(
    database as never,
    contributionTasks as never,
    skillProfiles as never,
  );
  const applications = new ApplicationsService(
    database as never,
    contributionTasks as never,
    skillProfiles as never,
    eligibility,
    identity as never,
    notifications as never,
    contributorProfiles as never,
    new ApplicationDailyQuotaService(
      new EntitlementsService(database as never),
      database as never,
    ),
  );

  /** The Request's frozen bar. */
  const bar = (
    skillName: string,
    requiredLevel: SkillProfileProficiencyLevel,
    kind: 'required' | 'preferred' = 'required',
  ) => ({
    id: `skill-${skillName}`,
    skillName,
    skillNameNormalized: skillName.toLowerCase(),
    requiredLevel,
    kind,
    position: 0,
  });

  const requestContext = (
    skillRequirements: ReturnType<typeof bar>[],
  ) => ({
    id: REQUEST_ID,
    ownerId: OWNER_ID,
    status: ContributionRequestStatus.published,
    applicationsCloseAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-14T11:00:00.000Z'),
    requirements: [
      { id: 'required-1', kind: 'required', position: 0, text: 'NestJS' },
    ],
    skillRequirements,
  });

  /** What the contributor's approved skills currently are. */
  const approvedSkills = (
    skills: Array<[string, SkillProfileProficiencyLevel]>,
  ): void => {
    skillProfiles.listAuthorizedSkillsForApplicationSnapshot.mockResolvedValue(
      skills.map(([name, proficiencyLevel]) => ({
        skillProfileId: `profile-${name}`,
        name,
        proficiencyLevel,
        confidence: 0.9,
        evidenceSummary: null,
        evidenceSources: null,
      })),
    );
  };

  const submit = () =>
    applications.submit({
      actor: contributor,
      contributionRequestId: REQUEST_ID,
      contributionApproach: 'I will implement and test the NestJS workflow.',
      proposedDeliveryDurationDays: 5,
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    });

  beforeEach(() => {
    jest.resetAllMocks();
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) => callback(database),
    );
    database.$queryRaw.mockResolvedValue([]);
    database.$executeRaw.mockResolvedValue(1);
    database.application.findUnique.mockResolvedValue(null);
    database.applicationAudit.findFirst.mockResolvedValue(null);
    database.eligibilityEvaluation.create.mockResolvedValue({ id: 'eval-1' });
    database.subscription.findFirst.mockResolvedValue(null);
    database.usageTracker.upsert.mockResolvedValue({ count: 0 });
    database.usageTracker.update.mockResolvedValue({ count: 1 });
    identity.getUserById.mockResolvedValue({
      id: CONTRIBUTOR_ID,
      username: 'contributor',
      first_name: 'Example',
      last_name: 'Contributor',
    });
    contributorProfiles.getApplicationProfileContext.mockResolvedValue({});

    const context = requestContext([bar('react', advanced)]);
    contributionTasks.getApplicationSubmissionContext.mockResolvedValue(context);
    contributionTasks.lockApplicationSubmissionContext.mockResolvedValue(context);
  });

  describe('a blocked submission', () => {
    beforeEach(() => {
      approvedSkills([['React', beginner]]);
    });

    it('returns 403 naming the skill, the bar, and the level held', async () => {
      await expect(submit()).rejects.toMatchObject({
        code: 'APPLICATION_BLOCKED_SKILL_GAP',
        statusCode: 403,
        metadata: {
          blockingSkills: [
            {
              skillName: 'react',
              requiredLevel: advanced,
              contributorLevel: beginner,
            },
          ],
        },
      });
    });

    it('creates no Application row and no Application audit row', async () => {
      // The block happens before the Application exists, which is why no new
      // status was needed and the state machine is untouched.
      await submit().catch(() => undefined);

      expect(database.application.create).not.toHaveBeenCalled();
      expect(database.applicationAudit.create).not.toHaveBeenCalled();
    });

    it('creates no orphaned snapshot', async () => {
      await submit().catch(() => undefined);

      expect(
        database.applicationRequirementSnapshot.create,
      ).not.toHaveBeenCalled();
      expect(database.applicationEvidenceSnapshot.create).not.toHaveBeenCalled();
    });

    it('spends no daily Application slot', async () => {
      // DEC-079: a slot is consumed by a created Application alone — never by a
      // replay, a duplicate, a validation failure, or an eligibility block.
      await submit().catch(() => undefined);

      expect(database.usageTracker.upsert).not.toHaveBeenCalled();
    });

    it('records exactly one blocked evaluation, outside the rolled-back transaction', async () => {
      await submit().catch(() => undefined);

      expect(database.eligibilityEvaluation.create).toHaveBeenCalledTimes(1);
      expect(database.eligibilityEvaluation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contributor_id: CONTRIBUTOR_ID,
            contribution_request_id: REQUEST_ID,
            outcome: 'blocked',
          }),
        }),
      );
    });

    it('notifies nobody — the owner never learns of a refused attempt', async () => {
      await submit().catch(() => undefined);
      expect(notifications.createApplicationNotification).not.toHaveBeenCalled();
    });
  });

  describe('an eligible submission', () => {
    beforeEach(() => {
      approvedSkills([['React', advanced]]);
      database.application.create.mockResolvedValue({
        id: 'application-1',
        contribution_request_id: REQUEST_ID,
        contributor_id: CONTRIBUTOR_ID,
        status: 'pending_owner_review',
        submitted_at: new Date(),
        requirementSnapshot: { requirements: [], skill_requirements: [] },
        evidenceSnapshot: { contributor_context: {}, evidence: [] },
        contributionRequest: { owner_id: OWNER_ID, title: 'Add a caching layer' },
        auditEvents: [],
      });
    });

    it('behaves exactly as before: creates the Application and its snapshots', async () => {
      await submit();

      expect(database.application.create).toHaveBeenCalled();
      expect(database.applicationRequirementSnapshot.create).toHaveBeenCalled();
      expect(database.applicationEvidenceSnapshot.create).toHaveBeenCalled();
      expect(database.usageTracker.upsert).toHaveBeenCalled();
    });

    it('records the eligible evaluation with the Application', async () => {
      await submit();

      expect(database.eligibilityEvaluation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: 'eligible',
            blocking_skills: [],
          }),
        }),
      );
    });

    it('lets a contributor who exactly meets the bar through', async () => {
      approvedSkills([['React', advanced]]);
      contributionTasks.lockApplicationSubmissionContext.mockResolvedValue(
        requestContext([bar('react', advanced)]),
      );

      await expect(submit()).resolves.toBeDefined();
    });

    it('is not blocked by a preferred row the contributor lacks', async () => {
      approvedSkills([['React', advanced]]);
      const context = requestContext([
        bar('react', advanced),
        bar('rust', advanced, 'preferred'),
      ]);
      contributionTasks.getApplicationSubmissionContext.mockResolvedValue(context);
      contributionTasks.lockApplicationSubmissionContext.mockResolvedValue(context);

      await expect(submit()).resolves.toBeDefined();
    });
  });

  describe('TOCTOU', () => {
    it('blocks at submit even when the preview said eligible', async () => {
      // The preview is advisory by construction. Skills revoked between the two
      // calls must still block, which is only true because the verdict is
      // recomputed inside the submission transaction.
      approvedSkills([['React', advanced]]);
      const preview = await eligibility.previewForRequest(
        CONTRIBUTOR_ID,
        REQUEST_ID,
      );
      expect(preview.outcome).toBe('eligible');

      // An admin revokes the approval in between.
      approvedSkills([]);

      await expect(submit()).rejects.toMatchObject({
        code: 'APPLICATION_BLOCKED_SKILL_GAP',
      });
      expect(database.application.create).not.toHaveBeenCalled();
    });
  });

  describe('the recovery path', () => {
    it('flips the verdict once the higher level is approved, with nothing else done', async () => {
      // Blocked -> admin approves a higher level -> the same contributor
      // submits successfully. No retry token, no new Request, no owner action.
      approvedSkills([['React', beginner]]);
      await expect(submit()).rejects.toMatchObject({
        code: 'APPLICATION_BLOCKED_SKILL_GAP',
      });

      approvedSkills([['React', advanced]]);
      database.application.create.mockResolvedValue({
        id: 'application-1',
        contribution_request_id: REQUEST_ID,
        contributor_id: CONTRIBUTOR_ID,
        status: 'pending_owner_review',
        submitted_at: new Date(),
        requirementSnapshot: { requirements: [], skill_requirements: [] },
        evidenceSnapshot: { contributor_context: {}, evidence: [] },
        contributionRequest: { owner_id: OWNER_ID, title: 'Add a caching layer' },
        auditEvents: [],
      });

      await expect(submit()).resolves.toBeDefined();
      expect(database.application.create).toHaveBeenCalledTimes(1);
    });

    it('names every required skill when the contributor has no approved skills', async () => {
      approvedSkills([]);
      const context = requestContext([
        bar('react', advanced),
        bar('rust', beginner),
        bar('go', intermediate),
      ]);
      contributionTasks.getApplicationSubmissionContext.mockResolvedValue(context);
      contributionTasks.lockApplicationSubmissionContext.mockResolvedValue(context);

      await expect(submit()).rejects.toMatchObject({
        metadata: {
          blockingSkills: [
            { skillName: 'react', requiredLevel: advanced, contributorLevel: null },
            { skillName: 'rust', requiredLevel: beginner, contributorLevel: null },
            { skillName: 'go', requiredLevel: intermediate, contributorLevel: null },
          ],
        },
      });
    });
  });

  describe('a Request with no bar', () => {
    it('lets anyone through, because there is nothing to measure against', async () => {
      // Publication requires a required row (P0-B02), but Requests published
      // before Phase 0 have none — and must keep working exactly as they did.
      approvedSkills([]);
      const context = requestContext([]);
      contributionTasks.getApplicationSubmissionContext.mockResolvedValue(context);
      contributionTasks.lockApplicationSubmissionContext.mockResolvedValue(context);
      database.application.create.mockResolvedValue({
        id: 'application-1',
        contribution_request_id: REQUEST_ID,
        contributor_id: CONTRIBUTOR_ID,
        status: 'pending_owner_review',
        submitted_at: new Date(),
        requirementSnapshot: { requirements: [], skill_requirements: [] },
        evidenceSnapshot: { contributor_context: {}, evidence: [] },
        contributionRequest: { owner_id: OWNER_ID, title: 'Add a caching layer' },
        auditEvents: [],
      });

      await expect(submit()).resolves.toBeDefined();
    });
  });
});
