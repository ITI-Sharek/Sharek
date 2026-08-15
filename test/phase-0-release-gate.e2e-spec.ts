import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContributionRequestStatus, SkillProfileProficiencyLevel } from '@prisma/client';

import { ApplicationsService } from '../src/modules/applications/applications.service';
import { ApplicationDailyQuotaService } from '../src/modules/applications/services/application-daily-quota.service';
import { EligibilityService } from '../src/modules/eligibility/services/eligibility.service';
import { EligibilityGuidanceService } from '../src/modules/skill-guidance/services/eligibility-guidance.service';
import { EligibilityGuidanceProcessorService } from '../src/modules/skill-guidance/services/eligibility-guidance-processor.service';
import { EntitlementsService } from '../src/modules/subscriptions/entitlements.service';

const CONTRIBUTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const EVALUATION_ID = 'e1111111-1111-4111-8111-111111111111';
const { beginner, advanced } = SkillProfileProficiencyLevel;

const contributor = {
  id: CONTRIBUTOR_ID,
  email: 'contributor@example.com',
  role: 'contributor' as const,
  status: 'active' as const,
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 0 RELEASE GATE (P0-Q01, #119)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Two questions, and the second is the one that makes Phase 0 shippable alone.
 *
 * 1. Does the gate work end to end — blocked with named gaps, then unblocked by
 *    an admin approving a higher level, with nothing else done?
 * 2. Is the phase genuinely independent of Phases 1-3 — no subscription rows,
 *    no payments, no paid task, and no surface that mentions money?
 *
 * Deterministic throughout: a controlled clock, stubbed providers, and no paid
 * model call. A live provider is never release authority.
 */
describe('Phase 0 release gate', () => {
  const database = {
    application: { findUnique: jest.fn(), create: jest.fn() },
    applicationAudit: { findFirst: jest.fn(), create: jest.fn() },
    applicationRequirementSnapshot: { create: jest.fn() },
    applicationEvidenceSnapshot: { create: jest.fn() },
    eligibilityEvaluation: { create: jest.fn(), findFirst: jest.fn() },
    eligibilityGuidance: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    usageTracker: { upsert: jest.fn(), update: jest.fn() },
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
    listApprovedSkillsForEligibility: jest.fn(),
  };
  const identity = { getUserById: jest.fn() };
  const notifications = { createApplicationNotification: jest.fn() };
  const contributorProfiles = { getApplicationProfileContext: jest.fn() };
  const guidanceQueue = { enqueueGeneration: jest.fn() };
  const ai = { requestSkillGapGuidance: jest.fn() };

  const eligibility = new EligibilityService(
    database as never,
    contributionTasks as never,
    skillProfiles as never,
  );
  const guidance = new EligibilityGuidanceService(
    database as never,
    guidanceQueue as never,
  );
  const guidanceProcessor = new EligibilityGuidanceProcessorService(
    database as never,
    skillProfiles as never,
    ai as never,
    guidance,
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

  /** The Request's frozen bar: one required skill at `advanced`. */
  const publishedRequest = () => ({
    id: REQUEST_ID,
    ownerId: OWNER_ID,
    status: ContributionRequestStatus.published,
    applicationsCloseAt: new Date('2030-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-14T11:00:00.000Z'),
    requirements: [
      { id: 'required-1', kind: 'required', position: 0, text: 'React' },
    ],
    skillRequirements: [
      {
        id: 'skill-1',
        skillName: 'React',
        skillNameNormalized: 'react',
        requiredLevel: advanced,
        kind: 'required',
        position: 0,
      },
    ],
  });

  /** What the admin has approved for this contributor, right now. */
  const approvedSkills = (
    skills: Array<[string, SkillProfileProficiencyLevel]>,
  ): void => {
    const rows = skills.map(([name, proficiencyLevel]) => ({
      skillProfileId: `profile-${name}`,
      name,
      proficiencyLevel,
      confidence: 0.9,
      evidenceSummary: null,
      evidenceSources: null,
    }));
    skillProfiles.listAuthorizedSkillsForApplicationSnapshot.mockResolvedValue(rows);
    skillProfiles.listApprovedSkillsForEligibility.mockResolvedValue(rows);
  };

  const submit = () =>
    applications.submit({
      actor: contributor,
      contributionRequestId: REQUEST_ID,
      contributionApproach: 'I will implement and test the React workflow.',
      proposedDeliveryDurationDays: 5,
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    });

  const createdApplication = () => ({
    id: 'application-1',
    contribution_request_id: REQUEST_ID,
    contributor_id: CONTRIBUTOR_ID,
    status: 'pending_owner_review',
    submitted_at: new Date('2026-08-14T12:00:00.000Z'),
    requirementSnapshot: { requirements: [], skill_requirements: [] },
    evidenceSnapshot: { contributor_context: {}, evidence: [] },
    contributionRequest: { owner_id: OWNER_ID, title: 'React work' },
    auditEvents: [],
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Controlled clock: every timestamp in this gate is fixed, so a rerun a
    // month from now produces the same evidence.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-14T12:00:00.000Z'));

    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) => callback(database),
    );
    database.$queryRaw.mockResolvedValue([]);
    database.$executeRaw.mockResolvedValue(1);
    database.application.findUnique.mockResolvedValue(null);
    database.applicationAudit.findFirst.mockResolvedValue(null);
    database.eligibilityEvaluation.create.mockResolvedValue({ id: EVALUATION_ID });
    // THE INDEPENDENCE PRECONDITION: not one subscription row exists.
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

    const context = publishedRequest();
    contributionTasks.getApplicationSubmissionContext.mockResolvedValue(context);
    contributionTasks.lockApplicationSubmissionContext.mockResolvedValue(context);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('the journey: blocked, then recovered', () => {
    it('blocks an under-levelled contributor with the gap named', async () => {
      // The admin has approved React at `beginner`; the work needs `advanced`.
      approvedSkills([['React', beginner]]);

      await expect(submit()).rejects.toMatchObject({
        code: 'APPLICATION_BLOCKED_SKILL_GAP',
        statusCode: 403,
        metadata: {
          blockingSkills: [
            {
              skillName: 'React',
              requiredLevel: advanced,
              contributorLevel: beginner,
            },
          ],
          // Carries the recorded evaluation, so the UI can ask for guidance
          // about this exact block rather than only naming it.
          eligibilityEvaluationId: EVALUATION_ID,
        },
      });
    });

    it('leaves no Application row and no orphaned snapshot behind', async () => {
      approvedSkills([['React', beginner]]);

      await submit().catch(() => undefined);

      expect(database.application.create).not.toHaveBeenCalled();
      expect(database.applicationAudit.create).not.toHaveBeenCalled();
      expect(
        database.applicationRequirementSnapshot.create,
      ).not.toHaveBeenCalled();
      expect(database.applicationEvidenceSnapshot.create).not.toHaveBeenCalled();
    });

    it('records exactly one blocked evaluation', async () => {
      approvedSkills([['React', beginner]]);

      await submit().catch(() => undefined);

      expect(database.eligibilityEvaluation.create).toHaveBeenCalledTimes(1);
      expect(database.eligibilityEvaluation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ outcome: 'blocked' }),
        }),
      );
    });

    it('succeeds once the admin approves a higher level, with nothing else done', async () => {
      // The whole recovery loop, compressed: add repositories, re-analysis,
      // admin approval. From the gate's side that is one thing — the approved
      // set changed — and no other action is required to unblock.
      approvedSkills([['React', beginner]]);
      await expect(submit()).rejects.toMatchObject({
        code: 'APPLICATION_BLOCKED_SKILL_GAP',
      });

      approvedSkills([['React', advanced]]);
      database.application.create.mockResolvedValue(createdApplication());

      await expect(submit()).resolves.toBeDefined();
      expect(database.application.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('guidance for the block', () => {
    beforeEach(() => {
      database.eligibilityEvaluation.findFirst.mockResolvedValue({
        id: EVALUATION_ID,
        outcome: 'blocked',
        blocking_skills: [
          {
            skillName: 'React',
            requiredLevel: advanced,
            contributorLevel: beginner,
          },
        ],
      });
      database.eligibilityGuidance.findFirst.mockResolvedValue(null);
      database.eligibilityGuidance.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'guidance-1',
          narrative: null,
          recommendations: null,
          created_at: new Date('2026-08-14T12:00:00.000Z'),
          updated_at: new Date('2026-08-14T12:00:00.000Z'),
          ...data,
        }),
      );
    });

    it('answers immediately with the deterministic reason', async () => {
      const requested = await guidance.request(contributor, EVALUATION_ID);

      expect(requested.status).toBe('pending');
      expect(requested.blockingSkills).toEqual([
        {
          skillName: 'React',
          requiredLevel: advanced,
          contributorLevel: beginner,
        },
      ]);
      // Not one provider call was needed to tell the contributor why.
      expect(ai.requestSkillGapGuidance).not.toHaveBeenCalled();
    });

    it('keeps the reason visible when the provider fails', async () => {
      // The criterion that matters: a contributor is never left with only
      // "you are blocked" and nothing to act on.
      database.eligibilityGuidance.findUnique.mockResolvedValue({
        id: 'guidance-1',
        contributor_id: CONTRIBUTOR_ID,
        status: 'pending',
        blocking_skills: [
          {
            skillName: 'React',
            requiredLevel: advanced,
            contributorLevel: beginner,
          },
        ],
      });
      ai.requestSkillGapGuidance.mockRejectedValue(new Error('provider down'));

      await guidanceProcessor.process('guidance-1');

      const { data } = database.eligibilityGuidance.updateMany.mock.calls[0][0];
      expect(data.status).toBe('failed');
      // The reason was not touched by the failure.
      expect(data).not.toHaveProperty('blocking_skills');
    });
  });

  describe('independence from Phases 1, 2 and 3', () => {
    it('gates and recovers with no subscription row in the database', async () => {
      // `subscription.findFirst` returns null throughout this file. The gate
      // reaching a verdict at all is the assertion.
      approvedSkills([['React', beginner]]);
      await expect(submit()).rejects.toMatchObject({
        code: 'APPLICATION_BLOCKED_SKILL_GAP',
      });

      approvedSkills([['React', advanced]]);
      database.application.create.mockResolvedValue(createdApplication());
      await expect(submit()).resolves.toBeDefined();

      expect(database.subscription.findFirst).toHaveBeenCalled();
    });

    it('never consults a plan to decide eligibility', async () => {
      // The verdict is a comparison of levels. A plan lookup anywhere in it
      // would make the differentiator purchasable, which DEC-078 forbids.
      approvedSkills([['React', beginner]]);
      await submit().catch(() => undefined);

      const evaluationWrite =
        database.eligibilityEvaluation.create.mock.calls[0][0];
      const serialized = JSON.stringify(evaluationWrite).toLowerCase();
      for (const term of ['plan', 'tier', 'gold', 'subscription', 'price']) {
        expect(serialized).not.toContain(term);
      }
    });

    it('never tier-gates guidance', async () => {
      // DEC-076. A block is the moment a paywall would be least defensible:
      // the platform has just refused them.
      database.eligibilityEvaluation.findFirst.mockResolvedValue({
        id: EVALUATION_ID,
        outcome: 'blocked',
        blocking_skills: [],
      });
      database.eligibilityGuidance.findFirst.mockResolvedValue(null);
      database.eligibilityGuidance.create.mockResolvedValue({
        id: 'guidance-1',
        eligibility_evaluation_id: EVALUATION_ID,
        contributor_id: CONTRIBUTOR_ID,
        status: 'pending',
        blocking_skills: [],
        narrative: null,
        recommendations: null,
        created_at: new Date('2026-08-14T12:00:00.000Z'),
        updated_at: new Date('2026-08-14T12:00:00.000Z'),
      });
      database.subscription.findFirst.mockClear();

      await guidance.request(contributor, EVALUATION_ID);

      expect(database.subscription.findFirst).not.toHaveBeenCalled();
    });

    it('mentions no money on any surface this phase introduced', () => {
      // A static read of the files Phase 0 added, because the rule is about
      // what a contributor can ever be shown — not only what these tests
      // happen to render.
      const surfaces = [
        'src/modules/eligibility/services/eligibility.service.ts',
        'src/modules/eligibility/dto/eligibility.dto.ts',
        'src/modules/eligibility/eligibility.controller.ts',
        'src/modules/skill-guidance/services/eligibility-guidance.service.ts',
        'src/modules/skill-guidance/controllers/eligibility-guidance.controller.ts',
        'src/modules/skill-guidance/dto/eligibility-guidance.dto.ts',
      ];
      const forbidden = [
        'gold',
        'upgrade',
        'paymob',
        'checkout',
        'commission',
        'payout',
        'escrow',
        'price',
      ];

      for (const surface of surfaces) {
        const source = readFileSync(join(__dirname, '..', surface), 'utf8');
        // Comments count. A TODO promising a tier gate is still a surface that
        // mentions one, and it is how the next person learns it is expected.
        const lowered = source.toLowerCase();
        for (const term of forbidden) {
          expect(`${surface}:${lowered.includes(term)}`).toBe(
            `${surface}:false`,
          );
        }
      }
    });

    it('reaches a verdict without any paid-task concept', async () => {
      // No TaskFunding, no reward, no commission anywhere in the path. The
      // Request in this gate has no reward at all and the gate does not care.
      approvedSkills([['React', advanced]]);
      database.application.create.mockResolvedValue(createdApplication());

      await expect(submit()).resolves.toBeDefined();

      const context = contributionTasks.lockApplicationSubmissionContext.mock
        .results[0].value as Promise<Record<string, unknown>>;
      expect(Object.keys(await context)).not.toContain('reward');
    });
  });

  describe('nothing that worked before Phase 0 changed', () => {
    it('an eligible submission behaves exactly as it did', async () => {
      approvedSkills([['React', advanced]]);
      database.application.create.mockResolvedValue(createdApplication());

      const application = await submit();

      expect(application).toBeDefined();
      expect(database.applicationRequirementSnapshot.create).toHaveBeenCalled();
      expect(database.applicationEvidenceSnapshot.create).toHaveBeenCalled();
      expect(database.applicationAudit.create).toHaveBeenCalled();
      expect(database.usageTracker.update).toHaveBeenCalled();
      expect(notifications.createApplicationNotification).toHaveBeenCalled();
    });

    it('a Request published before Phase 0 has no bar and blocks nobody', async () => {
      // Requests that predate the gate carry no skill requirements. They must
      // keep working identically rather than becoming unappliable.
      const legacy = { ...publishedRequest(), skillRequirements: [] };
      contributionTasks.getApplicationSubmissionContext.mockResolvedValue(legacy);
      contributionTasks.lockApplicationSubmissionContext.mockResolvedValue(legacy);
      approvedSkills([]);
      database.application.create.mockResolvedValue(createdApplication());

      await expect(submit()).resolves.toBeDefined();
    });
  });
});
