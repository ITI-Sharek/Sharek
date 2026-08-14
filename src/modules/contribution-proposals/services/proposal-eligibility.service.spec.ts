import { ConfigService } from '@nestjs/config';
import { SkillProfileProficiencyLevel } from '@prisma/client';

import { ApplicationError } from '../../../shared/errors/application.error';
import { EligibilityService } from '../../eligibility/services/eligibility.service';
import { ProposalEligibilityService } from './proposal-eligibility.service';

const PROPOSAL_ID = 'f1111111-1111-4111-8111-111111111111';
const { beginner, intermediate, advanced } = SkillProfileProficiencyLevel;

const content = {
  title: 'Add a caching layer to the discovery feed',
  problemOrOpportunity: 'The feed recomputes technology facets on every request.',
  proposedOutcome: 'Introduce a Redis cache with correct invalidation.',
  projectBenefit: 'Faster discovery for every contributor.',
};

describe('ProposalEligibilityService', () => {
  const ai = { inferRequirementSkills: jest.fn() };
  const database = { eligibilityEvaluation: { create: jest.fn() } };
  const contributionTasks = { getApplicationSubmissionContext: jest.fn() };
  const skillProfiles = {
    listAuthorizedSkillsForApplicationSnapshot: jest.fn(),
  };
  const eligibility = new EligibilityService(
    database as never,
    contributionTasks as never,
    skillProfiles as never,
  );

  const build = (values: Record<string, unknown> = {}) =>
    new ProposalEligibilityService(
      {
        get: (key: string, fallback: unknown) =>
          key in values ? values[key] : fallback,
      } as unknown as ConfigService,
      ai as never,
      eligibility,
    );

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    skillProfiles.listAuthorizedSkillsForApplicationSnapshot.mockResolvedValue([]);
    database.eligibilityEvaluation.create.mockResolvedValue({ id: 'eval-1' });
  });

  const inferred = (
    skillName: string,
    requiredLevel: SkillProfileProficiencyLevel,
    kind: 'required' | 'preferred' = 'required',
  ) => ({ skillName, requiredLevel, kind, confidence: 'high' });

  describe('the switch', () => {
    it.each([
      ['development', undefined, true],
      ['production', undefined, true],
      ['test', undefined, false],
      ['production', false, false],
      ['test', true, true],
    ])('in %s with the flag %p is %p', (nodeEnv, flag, expected) => {
      const service = build({
        NODE_ENV: nodeEnv,
        ...(flag === undefined
          ? {}
          : { PROPOSAL_ELIGIBILITY_GATE_ENABLED: flag }),
      });
      expect(service.isEnabled()).toBe(expected);
    });
  });

  describe('inferring the bar from the proposal', () => {
    it('sends the proposer own words and no contributor data', async () => {
      ai.inferRequirementSkills.mockResolvedValue({
        skills: [inferred('React', advanced)],
        provider: 'stub',
        model: 'stub',
        promptVersion: 'requirement-inference-v1',
        schemaVersion: 'requirement-inference-v1',
        serviceVersion: '0.1.0',
      });

      await build().inferRequiredSkills(PROPOSAL_ID, content);

      const [sent] = ai.inferRequirementSkills.mock.calls[0];
      expect(sent.title).toBe(content.title);
      expect(sent.description).toBe(content.proposedOutcome);
      expect(sent.requirementTexts).toEqual([
        content.problemOrOpportunity,
        content.projectBenefit,
      ]);
      // The correlation id the wire contract names `contributionRequestId`
      // carries the Proposal id here; the agent never resolves it.
      expect(sent.contributionRequestId).toBe(PROPOSAL_ID);
      // Asserted on the field set, not on the prose: a proposer may well write
      // the word "contributor" in their own text, and that is content, not
      // contributor data. What matters is that no field can carry an identity.
      expect(Object.keys(sent).sort()).toEqual([
        'contractVersion',
        'contributionRequestId',
        'description',
        'difficulty',
        'requirementTexts',
        'technologyTags',
        'title',
      ]);
    });

    it('normalizes each skill with the shared identity function', async () => {
      ai.inferRequirementSkills.mockResolvedValue({
        skills: [inferred('Node.js', intermediate)],
        provider: 'stub',
        model: 'stub',
        promptVersion: 'requirement-inference-v1',
        schemaVersion: 'requirement-inference-v1',
        serviceVersion: '0.1.0',
      });

      const bar = await build().inferRequiredSkills(PROPOSAL_ID, content);

      expect(bar[0].skillNameNormalized).toBe('nodejs');
    });

    it('drops a skill whose name normalizes to nothing', async () => {
      ai.inferRequirementSkills.mockResolvedValue({
        skills: [inferred('---', advanced), inferred('React', advanced)],
        provider: 'stub',
        model: 'stub',
        promptVersion: 'requirement-inference-v1',
        schemaVersion: 'requirement-inference-v1',
        serviceVersion: '0.1.0',
      });

      const bar = await build().inferRequiredSkills(PROPOSAL_ID, content);

      expect(bar.map((skill) => skill.skillName)).toEqual(['React']);
    });
  });

  describe('failing open', () => {
    it('raises a retriable 503, not a block, when the provider fails', async () => {
      // THE ASYMMETRY WITH THE APPLICATION PATH. There the bar is already frozen
      // on the Request and no provider is involved at submit time; here the
      // provider is on the critical path. An outage rendered as "your skills
      // are insufficient" is a false statement about a person that they can
      // neither act on nor appeal.
      ai.inferRequirementSkills.mockRejectedValue(new Error('unavailable'));

      const error = await build()
        .inferRequiredSkills(PROPOSAL_ID, content)
        .then(
          () => null,
          (thrown: unknown) => thrown as ApplicationError,
        );

      expect(error).toBeInstanceOf(ApplicationError);
      expect(error!.code).toBe('PROPOSAL_ELIGIBILITY_UNAVAILABLE');
      expect(error!.statusCode).toBe(503);
      expect(error!.metadata).toEqual({ retriable: true });
    });

    it('is distinguishable from a skill block by both code and status', async () => {
      ai.inferRequirementSkills.mockRejectedValue(new Error('unavailable'));
      const service = build();

      const outage = await service
        .inferRequiredSkills(PROPOSAL_ID, content)
        .then(
          () => null,
          (thrown: unknown) => thrown as ApplicationError,
        );
      const block = service.blockedError([]);

      expect(outage!.code).not.toBe(block.code);
      expect(outage!.statusCode).not.toBe(block.statusCode);
      // A client that only reads the status still cannot confuse them.
      expect(outage!.statusCode).toBe(503);
      expect(block.statusCode).toBe(403);
    });

    it('says nothing about the provider in the message it returns', async () => {
      ai.inferRequirementSkills.mockRejectedValue(
        new Error('groq: PRIVATE upstream detail'),
      );

      const error = await build()
        .inferRequiredSkills(PROPOSAL_ID, content)
        .then(
          () => null,
          (thrown: unknown) => thrown as ApplicationError,
        );

      expect(error!.message).not.toContain('PRIVATE');
      expect(error!.message).not.toContain('groq');
    });
  });

  describe('the verdict', () => {
    const bar = [
      {
        skillName: 'React',
        skillNameNormalized: 'react',
        requiredLevel: advanced,
        kind: 'required' as const,
      },
    ];

    it('blocks a proposer whose approved level is short', async () => {
      skillProfiles.listAuthorizedSkillsForApplicationSnapshot.mockResolvedValue([
        { name: 'React', proficiencyLevel: beginner },
      ]);

      const verdict = await build().evaluate({
        contributorId: 'contributor-1',
        requiredSkills: bar,
        transaction: {} as never,
      });

      expect(verdict.outcome).toBe('blocked');
      expect(verdict.blockingSkills).toEqual([
        {
          skillName: 'React',
          requiredLevel: advanced,
          contributorLevel: beginner,
        },
      ]);
    });

    it('writes nothing while computing, so a refusal leaves no partial row', async () => {
      skillProfiles.listAuthorizedSkillsForApplicationSnapshot.mockResolvedValue([]);

      await build().evaluate({
        contributorId: 'contributor-1',
        requiredSkills: bar,
        transaction: {} as never,
      });

      expect(database.eligibilityEvaluation.create).not.toHaveBeenCalled();
    });

    it('lets a proposer through when the inferred bar is empty', async () => {
      // A proposal too vague to imply a skill blocks nobody. Inventing a bar to
      // have something to enforce would refuse people for the agent's silence.
      const verdict = await build().evaluate({
        contributorId: 'contributor-1',
        requiredSkills: [],
        transaction: {} as never,
      });

      expect(verdict.outcome).toBe('eligible');
    });
  });

  describe('the refusal', () => {
    it('uses the same code and shape as the Application block', async () => {
      const error = build().blockedError([
        {
          skillName: 'React',
          requiredLevel: advanced,
          contributorLevel: null,
        },
      ]);

      expect(error.code).toBe('PROPOSAL_BLOCKED_SKILL_GAP');
      expect(error.statusCode).toBe(403);
      expect(error.metadata).toEqual({
        blockingSkills: [
          {
            skillName: 'React',
            requiredLevel: advanced,
            contributorLevel: null,
          },
        ],
      });
    });
  });
});
