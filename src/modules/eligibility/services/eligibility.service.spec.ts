import { SkillProfileProficiencyLevel } from '@prisma/client';

import { ApplicationError } from '../../../shared/errors/application.error';
import { EligibilityService } from './eligibility.service';

const CONTRIBUTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const { beginner, intermediate, advanced } = SkillProfileProficiencyLevel;

const requiredSkill = (
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

describe('EligibilityService', () => {
  const transaction = { eligibilityEvaluation: { create: jest.fn() } };
  const database = { eligibilityEvaluation: { create: jest.fn() } };
  const contributionTasks = { getApplicationSubmissionContext: jest.fn() };
  const skillProfiles = {
    listAuthorizedSkillsForApplicationSnapshot: jest.fn(),
  };
  const service = new EligibilityService(
    database as never,
    contributionTasks as never,
    skillProfiles as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    transaction.eligibilityEvaluation.create.mockResolvedValue({ id: 'eval-1' });
    database.eligibilityEvaluation.create.mockResolvedValue({ id: 'eval-1' });
    skillProfiles.listAuthorizedSkillsForApplicationSnapshot.mockResolvedValue([]);
  });

  const evaluate = (
    requiredSkills: ReturnType<typeof requiredSkill>[],
    approved: Array<{ name: string; proficiencyLevel: SkillProfileProficiencyLevel }>,
  ) => {
    skillProfiles.listAuthorizedSkillsForApplicationSnapshot.mockResolvedValue(
      approved,
    );
    return service.evaluateForRequest({
      contributorId: CONTRIBUTOR_ID,
      contributionRequestId: REQUEST_ID,
      requiredSkills,
      transaction: transaction as never,
    });
  };

  describe('the verdict', () => {
    it('is eligible when every required level is met', async () => {
      const verdict = await evaluate(
        [requiredSkill('react', intermediate)],
        [{ name: 'React', proficiencyLevel: advanced }],
      );
      expect(verdict).toEqual({ outcome: 'eligible', blockingSkills: [] });
    });

    it('is blocked with a named reason when a level is short', async () => {
      const verdict = await evaluate(
        [requiredSkill('react', advanced)],
        [{ name: 'React', proficiencyLevel: beginner }],
      );
      expect(verdict.outcome).toBe('blocked');
      expect(verdict.blockingSkills).toEqual([
        {
          skillName: 'react',
          requiredLevel: advanced,
          contributorLevel: beginner,
        },
      ]);
    });
  });

  describe('what counts as an approved skill', () => {
    it('reads them through the module that owns the definition', async () => {
      // Not a local status filter. `listAuthorizedSkillsForApplicationSnapshot`
      // already excludes pending, rejected, disputed, and skills from an
      // unauthorized generation — restating the rule here would let the gate's
      // definition of "approved" drift from the Application snapshot's.
      await evaluate([requiredSkill('react', beginner)], []);

      expect(
        skillProfiles.listAuthorizedSkillsForApplicationSnapshot,
      ).toHaveBeenCalledWith(CONTRIBUTOR_ID, transaction);
    });

    it('reads them on the caller transaction, not a fresh connection', async () => {
      // The verdict must be computed against the same locked rows the
      // submission will use, or the gate has a TOCTOU by construction.
      await evaluate([requiredSkill('react', beginner)], []);

      const [, client] =
        skillProfiles.listAuthorizedSkillsForApplicationSnapshot.mock.calls[0];
      expect(client).toBe(transaction);
    });
  });

  describe('the append-only record', () => {
    it('writes an eligible verdict inside the caller transaction', async () => {
      // It belongs with the Application it permitted: if the submission rolls
      // back for a later reason, this rolls back with it.
      await evaluate(
        [requiredSkill('react', beginner)],
        [{ name: 'React', proficiencyLevel: advanced }],
      );

      expect(transaction.eligibilityEvaluation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contributor_id: CONTRIBUTOR_ID,
            contribution_request_id: REQUEST_ID,
            contribution_proposal_id: null,
            outcome: 'eligible',
            blocking_skills: [],
          }),
        }),
      );
      expect(database.eligibilityEvaluation.create).not.toHaveBeenCalled();
    });

    it('does not write a blocked verdict inside the caller transaction', async () => {
      // The caller throws to refuse the submission, which rolls this
      // transaction back — a row written here would vanish and the refusal
      // would leave no trace.
      await evaluate([requiredSkill('react', advanced)], []);

      expect(transaction.eligibilityEvaluation.create).not.toHaveBeenCalled();
    });

    it('records a block on a fresh connection so it survives the rollback', async () => {
      const id = await service.recordBlocked({
        contributorId: CONTRIBUTOR_ID,
        contributionRequestId: REQUEST_ID,
        blockingSkills: [
          { skillName: 'react', requiredLevel: advanced, contributorLevel: null },
        ],
      });

      expect(id).toBe('eval-1');
      expect(database.eligibilityEvaluation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: 'blocked',
            contribution_request_id: REQUEST_ID,
            contribution_proposal_id: null,
            blocking_skills: [
              {
                skillName: 'react',
                requiredLevel: advanced,
                contributorLevel: null,
              },
            ],
          }),
        }),
      );
    });

    it('stamps the comparison contract version', async () => {
      // So a later change to the comparison rules is visible in an append-only
      // log rather than making old rows silently unreproducible.
      await evaluate(
        [requiredSkill('react', beginner)],
        [{ name: 'React', proficiencyLevel: advanced }],
      );

      const { data } = transaction.eligibilityEvaluation.create.mock.calls[0][0];
      expect(data.requirement_snapshot_version).toBe(1);
    });
  });

  describe('the refusal payload', () => {
    it('carries every blocking skill with both levels', async () => {
      const error = service.blockedError('APPLICATION_BLOCKED_SKILL_GAP', [
        {
          skillName: 'react',
          requiredLevel: advanced,
          contributorLevel: beginner,
        },
        { skillName: 'rust', requiredLevel: beginner, contributorLevel: null },
      ]);

      expect(error).toBeInstanceOf(ApplicationError);
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('APPLICATION_BLOCKED_SKILL_GAP');
      // Enough to explain the refusal without a second call.
      expect(error.metadata).toEqual({
        blockingSkills: [
          {
            skillName: 'react',
            requiredLevel: advanced,
            contributorLevel: beginner,
          },
          { skillName: 'rust', requiredLevel: beginner, contributorLevel: null },
        ],
      });
    });

    it('uses one shape for both contribution paths', async () => {
      // The Application block and the Proposal block are the same situation
      // with two triggers; a contributor hitting both should not have to learn
      // two error formats.
      const application = service.blockedError('APPLICATION_BLOCKED_SKILL_GAP', []);
      const proposal = service.blockedError('PROPOSAL_BLOCKED_SKILL_GAP', []);
      expect(Object.keys(application.metadata ?? {})).toEqual(
        Object.keys(proposal.metadata ?? {}),
      );
      expect(application.statusCode).toBe(proposal.statusCode);
    });

    it('says nothing about the model or the owner', async () => {
      const error = service.blockedError('APPLICATION_BLOCKED_SKILL_GAP', []);
      const serialized = JSON.stringify({
        message: error.message,
        metadata: error.metadata,
      });
      for (const leak of ['model', 'confidence', 'ai_inferred', 'owner']) {
        expect(serialized.toLowerCase()).not.toContain(leak);
      }
    });
  });

  describe('the read-only preview', () => {
    const publishedContext = (
      skillRequirements: ReturnType<typeof requiredSkill>[],
    ) => ({
      id: REQUEST_ID,
      ownerId: 'owner',
      status: 'published',
      applicationsCloseAt: new Date('2030-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-14T00:00:00.000Z'),
      requirements: [],
      skillRequirements,
    });

    it('reports the whole bar, not just the failures', async () => {
      // A contributor deciding whether to invest in a form needs to see what is
      // being asked, not only what they are missing.
      contributionTasks.getApplicationSubmissionContext.mockResolvedValue(
        publishedContext([
          requiredSkill('react', intermediate),
          requiredSkill('rust', advanced),
        ]),
      );
      skillProfiles.listAuthorizedSkillsForApplicationSnapshot.mockResolvedValue([
        { name: 'React', proficiencyLevel: advanced },
      ]);

      const preview = await service.previewForRequest(CONTRIBUTOR_ID, REQUEST_ID);

      expect(preview.outcome).toBe('blocked');
      expect(preview.requiredSkills).toEqual([
        {
          skillName: 'react',
          requiredLevel: intermediate,
          contributorLevel: advanced,
          met: true,
        },
        {
          skillName: 'rust',
          requiredLevel: advanced,
          contributorLevel: null,
          met: false,
        },
      ]);
      expect(preview.blockingSkills).toHaveLength(1);
    });

    it('writes no evaluation row', async () => {
      // It is advisory to the client by construction. The tempting
      // optimisation — "we already checked, skip it in the transaction" — is
      // exactly the TOCTOU bug.
      contributionTasks.getApplicationSubmissionContext.mockResolvedValue(
        publishedContext([requiredSkill('react', beginner)]),
      );

      await service.previewForRequest(CONTRIBUTOR_ID, REQUEST_ID);

      expect(database.eligibilityEvaluation.create).not.toHaveBeenCalled();
      expect(transaction.eligibilityEvaluation.create).not.toHaveBeenCalled();
    });

    it('excludes preferred rows from the bar it reports', async () => {
      contributionTasks.getApplicationSubmissionContext.mockResolvedValue(
        publishedContext([
          requiredSkill('react', beginner),
          requiredSkill('graphql', advanced, 'preferred'),
        ]),
      );

      const preview = await service.previewForRequest(CONTRIBUTOR_ID, REQUEST_ID);

      expect(preview.requiredSkills.map((row) => row.skillName)).toEqual([
        'react',
      ]);
    });

    it('gives an unpublished Request the same not-found as an unknown id', async () => {
      // Otherwise the endpoint becomes a way to discover draft Request IDs.
      contributionTasks.getApplicationSubmissionContext.mockResolvedValue(null);

      await expect(
        service.previewForRequest(CONTRIBUTOR_ID, REQUEST_ID),
      ).rejects.toMatchObject({
        code: 'CONTRIBUTION_REQUEST_NOT_FOUND',
        statusCode: 404,
      } satisfies Partial<ApplicationError>);
    });
  });
});
