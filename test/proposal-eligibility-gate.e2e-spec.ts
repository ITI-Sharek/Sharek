import { ConfigService } from '@nestjs/config';
import {
  ContributionProposalStatus,
  SkillProfileProficiencyLevel,
} from '@prisma/client';

import { ContributionProposalsService } from '../src/modules/contribution-proposals/contribution-proposals.service';
import { ProposalEligibilityService } from '../src/modules/contribution-proposals/services/proposal-eligibility.service';
import { EligibilityService } from '../src/modules/eligibility/services/eligibility.service';

const PROPOSER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const PROPOSAL_ID = 'f1111111-1111-4111-8111-111111111111';
const { beginner, advanced } = SkillProfileProficiencyLevel;

const proposer = {
  id: PROPOSER_ID,
  email: 'proposer@example.com',
  role: 'contributor' as const,
  status: 'active' as const,
};

const content = {
  title: 'Add a caching layer to the discovery feed',
  problemOrOpportunity: 'The feed recomputes technology facets on every request.',
  proposedOutcome: 'Introduce a Redis cache with correct invalidation.',
  projectBenefit: 'Faster discovery for every contributor.',
};

/**
 * The Proposal gate through the real services against a mocked database.
 *
 * The property that matters is negative and only observable end to end: a
 * refused proposal must leave the aggregate exactly as it was. A unit test of
 * the comparison cannot show that no row was written.
 */
describe('Proposal eligibility gate end to end', () => {
  const database = {
    contributionProposal: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    contributionProposalVersion: { create: jest.fn() },
    contributionProposalAudit: { findFirst: jest.fn(), create: jest.fn() },
    eligibilityEvaluation: { create: jest.fn() },
    projectProposalIntake: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const projects = {
    getProposalProjectContext: jest.fn(),
    lockProposalProjectContext: jest.fn(),
  };
  const contributionTasks = {
    createDraftFromAcceptedProposal: jest.fn(),
    getApplicationSubmissionContext: jest.fn(),
  };
  const notifications = {
    createProposalNotification: jest.fn(),
    emitProposalNotifications: jest.fn(),
  };
  const skillProfiles = {
    listAuthorizedSkillsForApplicationSnapshot: jest.fn(),
  };
  const ai = { inferRequirementSkills: jest.fn() };

  const eligibility = new EligibilityService(
    database as never,
    contributionTasks as never,
    skillProfiles as never,
  );
  const proposalEligibility = new ProposalEligibilityService(
    // Forced on: the gate needs a live provider, so it defaults off in tests.
    new ConfigService({ PROPOSAL_ELIGIBILITY_GATE_ENABLED: true }),
    ai as never,
    eligibility,
  );
  const service = new ContributionProposalsService(
    database as never,
    projects as never,
    contributionTasks as never,
    notifications as never,
    proposalEligibility,
  );

  /** What the agent infers from the proposal's own words. */
  const inferenceReturns = (
    skills: Array<[string, SkillProfileProficiencyLevel]>,
  ): void => {
    ai.inferRequirementSkills.mockResolvedValue({
      skills: skills.map(([skillName, requiredLevel]) => ({
        skillName,
        requiredLevel,
        kind: 'required',
        confidence: 'high',
      })),
      provider: 'local-stub',
      model: 'stub-v1',
      promptVersion: 'requirement-inference-v1',
      schemaVersion: 'requirement-inference-v1',
      serviceVersion: 'stub',
    });
  };

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
    service.submit({
      actor: proposer,
      projectId: PROJECT_ID,
      ...content,
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
    });

  const submitVersion = () =>
    service.submitVersion({
      actor: proposer,
      proposalId: PROPOSAL_ID,
      ...content,
      idempotencyKey: '66666666-6666-4666-8666-666666666666',
    });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) => callback(database),
    );
    // Proposal intake, read with FOR SHARE inside the transaction. It must be
    // enabled or `submit` refuses before the gate is ever reached — which would
    // make the "leaves the aggregate untouched" assertions pass for the wrong
    // reason.
    database.$queryRaw.mockResolvedValue([{ enabled: true }]);
    database.$executeRaw.mockResolvedValue(1);
    database.contributionProposalAudit.findFirst.mockResolvedValue(null);
    database.contributionProposal.count.mockResolvedValue(0);
    database.eligibilityEvaluation.create.mockResolvedValue({ id: 'eval-1' });
    database.projectProposalIntake.findUnique.mockResolvedValue(null);
    projects.lockProposalProjectContext.mockResolvedValue({
      id: PROJECT_ID,
      ownerId: '11111111-1111-4111-8111-111111111111',
      status: 'published',
    });
    database.contributionProposal.findUniqueOrThrow.mockResolvedValue({
      id: PROPOSAL_ID,
      project_id: PROJECT_ID,
      proposer_id: PROPOSER_ID,
      status: ContributionProposalStatus.pending,
      current_version: 1,
      revision_requested_at: null,
      created_at: new Date('2026-08-14T12:00:00.000Z'),
      updated_at: new Date('2026-08-14T12:00:00.000Z'),
      proposer: {
        id: PROPOSER_ID,
        username: 'proposer',
        first_name: 'Example',
        last_name: 'Proposer',
      },
      versions: [
        {
          version: 1,
          title: content.title,
          problem_or_opportunity: content.problemOrOpportunity,
          proposed_outcome: content.proposedOutcome,
          project_benefit: content.projectBenefit,
          authored_by: PROPOSER_ID,
          created_at: new Date('2026-08-14T12:00:00.000Z'),
        },
      ],
      auditEvents: [],
    });
  });

  describe('a blocked create', () => {
    beforeEach(() => {
      inferenceReturns([['React', advanced]]);
      approvedSkills([['React', beginner]]);
    });

    it('refuses with the same payload shape as the Application block', async () => {
      await expect(submit()).rejects.toMatchObject({
        code: 'PROPOSAL_BLOCKED_SKILL_GAP',
        statusCode: 403,
        metadata: {
          blockingSkills: [
            {
              skillName: 'React',
              requiredLevel: advanced,
              contributorLevel: beginner,
            },
          ],
        },
      });
    });

    it('leaves the aggregate untouched — no proposal, no version, no audit', async () => {
      await submit().catch(() => undefined);

      expect(database.contributionProposal.create).not.toHaveBeenCalled();
      expect(database.contributionProposalVersion.create).not.toHaveBeenCalled();
      expect(database.contributionProposalAudit.create).not.toHaveBeenCalled();
    });

    it('records no evaluation, because there is no Proposal to attach it to', async () => {
      // The CHECK permits exactly one target and the Proposal was never
      // created. The 403 still names every blocking skill, so the refusal is
      // explained; what a blocked create cannot leave is a durable record.
      await submit().catch(() => undefined);

      expect(database.eligibilityEvaluation.create).not.toHaveBeenCalled();
    });

    it('notifies nobody', async () => {
      await submit().catch(() => undefined);
      expect(notifications.createProposalNotification).not.toHaveBeenCalled();
    });
  });

  describe('an eligible create', () => {
    beforeEach(() => {
      inferenceReturns([['React', advanced]]);
      approvedSkills([['React', advanced]]);
    });

    it('creates the proposal and its first version', async () => {
      await submit();

      expect(database.contributionProposal.create).toHaveBeenCalled();
      expect(database.contributionProposalVersion.create).toHaveBeenCalled();
    });

    it('records the evaluation against the proposal it just created', async () => {
      await submit();

      expect(database.eligibilityEvaluation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contributor_id: PROPOSER_ID,
            contribution_request_id: null,
            outcome: 'eligible',
          }),
        }),
      );
      const { data } = database.eligibilityEvaluation.create.mock.calls[0][0];
      // Exactly one target, as the CHECK requires.
      expect(data.contribution_proposal_id).toEqual(expect.any(String));
    });

    it('infers the bar from the proposal content, not from any Request', async () => {
      await submit();

      const [sent] = ai.inferRequirementSkills.mock.calls[0];
      expect(sent.title).toBe(content.title);
      expect(sent.description).toBe(content.proposedOutcome);
    });
  });

  describe('a blocked new version', () => {
    beforeEach(() => {
      inferenceReturns([['Rust', advanced]]);
      approvedSkills([['React', advanced]]);
      database.contributionProposal.findFirst.mockResolvedValue({
        id: PROPOSAL_ID,
        proposer_id: PROPOSER_ID,
        status: ContributionProposalStatus.pending,
        current_version: 2,
        revision_request_sequence: 1,
        revision_requested_at: new Date('2026-08-14T10:00:00.000Z'),
      });
    });

    it('refuses a version that escalates scope beyond the evidence', async () => {
      await expect(submitVersion()).rejects.toMatchObject({
        code: 'PROPOSAL_BLOCKED_SKILL_GAP',
        statusCode: 403,
      });
    });

    it('leaves the prior version as the latest', async () => {
      // The block runs before `current_version` moves and before the version
      // row is written, so the proposal is exactly where it was.
      await submitVersion().catch(() => undefined);

      expect(database.contributionProposal.updateMany).not.toHaveBeenCalled();
      expect(database.contributionProposalVersion.create).not.toHaveBeenCalled();
    });

    it('records the refusal, because here the Proposal does exist', async () => {
      await submitVersion().catch(() => undefined);

      expect(database.eligibilityEvaluation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contribution_proposal_id: PROPOSAL_ID,
            contribution_request_id: null,
            outcome: 'blocked',
          }),
        }),
      );
    });
  });

  describe('the provider failing', () => {
    beforeEach(() => {
      ai.inferRequirementSkills.mockRejectedValue(new Error('unavailable'));
      approvedSkills([]);
    });

    it('returns a retriable error rather than a block', async () => {
      // A proposer with no approved skills at all would certainly have been
      // blocked had the bar been known — which is exactly why an outage must
      // not be allowed to look like that verdict.
      await expect(submit()).rejects.toMatchObject({
        code: 'PROPOSAL_ELIGIBILITY_UNAVAILABLE',
        statusCode: 503,
      });
    });

    it('touches nothing, so a retry is a clean retry', async () => {
      await submit().catch(() => undefined);

      expect(database.$transaction).not.toHaveBeenCalled();
      expect(database.contributionProposal.create).not.toHaveBeenCalled();
      expect(database.eligibilityEvaluation.create).not.toHaveBeenCalled();
    });
  });

  describe('the recovery path', () => {
    it('accepts the same proposal once the higher level is approved', async () => {
      inferenceReturns([['React', advanced]]);
      approvedSkills([['React', beginner]]);
      await expect(submit()).rejects.toMatchObject({
        code: 'PROPOSAL_BLOCKED_SKILL_GAP',
      });

      // An admin approves the higher level. Nothing else changes.
      approvedSkills([['React', advanced]]);

      await expect(submit()).resolves.toBeDefined();
      expect(database.contributionProposal.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('with the gate switched off', () => {
    it('submits without calling the provider at all', async () => {
      const ungated = new ContributionProposalsService(
        database as never,
        projects as never,
        contributionTasks as never,
        notifications as never,
        new ProposalEligibilityService(
          new ConfigService({ PROPOSAL_ELIGIBILITY_GATE_ENABLED: false }),
          ai as never,
          eligibility,
        ),
      );
      approvedSkills([]);

      await expect(
        ungated.submit({
          actor: proposer,
          projectId: PROJECT_ID,
          ...content,
          idempotencyKey: '77777777-7777-4777-8777-777777777777',
        }),
      ).resolves.toBeDefined();

      expect(ai.inferRequirementSkills).not.toHaveBeenCalled();
      // No bar was computed, so no verdict is recorded — distinct from
      // recording an "eligible" row nobody evaluated.
      expect(database.eligibilityEvaluation.create).not.toHaveBeenCalled();
    });
  });
});
