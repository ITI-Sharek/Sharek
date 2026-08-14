import {
  ContributionRequestRequirementKind,
  ContributionRequestSkillRequirementSource,
  ContributionRequestStatus,
  SkillProfileProficiencyLevel,
} from '@prisma/client';

import { ApplicationError } from '../../../shared/errors/application.error';
import { ContributionRequestSkillRequirementsService } from './contribution-request-skill-requirements.service';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';

const owner = {
  id: OWNER_ID,
  email: 'owner@example.com',
  role: 'owner' as const,
  status: 'active' as const,
};

describe('ContributionRequestSkillRequirementsService', () => {
  const transaction = {
    $queryRaw: jest.fn(),
    contributionRequestSkillRequirement: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const database = {
    contributionRequest: { findFirst: jest.fn() },
    contributionRequestSkillRequirement: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const projectsService = {
    lockContributionRequestProjectAccess: jest.fn(),
  };
  const service = new ContributionRequestSkillRequirementsService(
    database as never,
    projectsService as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    database.$transaction.mockImplementation(
      (handler: (tx: typeof transaction) => unknown) => handler(transaction),
    );
    transaction.contributionRequestSkillRequirement.findMany.mockResolvedValue(
      [],
    );
  });

  /** The row the `FOR UPDATE` lookup returns for a request in `status`. */
  const lockReturns = (status: ContributionRequestStatus): void => {
    transaction.$queryRaw.mockResolvedValue([
      { id: REQUEST_ID, project_id: PROJECT_ID, status },
    ]);
  };

  const replace = (
    skillRequirements: Array<{
      skillName: string;
      requiredLevel: SkillProfileProficiencyLevel;
      kind: ContributionRequestRequirementKind;
    }>,
  ) =>
    service.replaceOwnerSkillRequirements({
      user: owner,
      requestId: REQUEST_ID,
      skillRequirements,
    });

  const expectError = async (
    promise: Promise<unknown>,
    code: string,
    statusCode: number,
  ): Promise<ApplicationError> => {
    const error = await promise.then(
      () => null,
      (thrown: unknown) => thrown as ApplicationError,
    );
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error!.code).toBe(code);
    expect(error!.statusCode).toBe(statusCode);
    return error!;
  };

  describe('the freeze at publication', () => {
    it.each([
      ContributionRequestStatus.published,
      ContributionRequestStatus.assigned,
      ContributionRequestStatus.completed,
      ContributionRequestStatus.cancelled,
    ])('refuses a write against a %s request', async (status) => {
      lockReturns(status);

      const error = await expectError(
        replace([
          {
            skillName: 'React',
            requiredLevel: SkillProfileProficiencyLevel.advanced,
            kind: ContributionRequestRequirementKind.required,
          },
        ]),
        'REQUEST_SKILL_REQUIREMENTS_FROZEN',
        409,
      );
      expect(error.metadata).toEqual({ status });
      expect(
        transaction.contributionRequestSkillRequirement.deleteMany,
      ).not.toHaveBeenCalled();
    });

    it('allows a write against a draft', async () => {
      lockReturns(ContributionRequestStatus.draft);

      await replace([
        {
          skillName: 'React',
          requiredLevel: SkillProfileProficiencyLevel.intermediate,
          kind: ContributionRequestRequirementKind.required,
        },
      ]);

      expect(
        transaction.contributionRequestSkillRequirement.createMany,
      ).toHaveBeenCalled();
    });

    it('checks the status inside the transaction, after taking the row lock', async () => {
      // The whole point of the freeze is that a concurrent publish cannot slip
      // between the check and the write. A status read before the transaction
      // would be stale, so the lock must come first and the check must follow
      // it — asserting the order is what stops a later refactor from
      // reintroducing the race.
      const calls: string[] = [];
      transaction.$queryRaw.mockImplementation(() => {
        calls.push('lock');
        return Promise.resolve([
          {
            id: REQUEST_ID,
            project_id: PROJECT_ID,
            status: ContributionRequestStatus.published,
          },
        ]);
      });

      await expectError(
        replace([]),
        'REQUEST_SKILL_REQUIREMENTS_FROZEN',
        409,
      );
      expect(calls).toEqual(['lock']);
      expect(database.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('the replacement', () => {
    it('deletes the whole set before writing, so a removed skill really goes', async () => {
      lockReturns(ContributionRequestStatus.draft);

      await replace([
        {
          skillName: 'TypeScript',
          requiredLevel: SkillProfileProficiencyLevel.advanced,
          kind: ContributionRequestRequirementKind.required,
        },
      ]);

      expect(
        transaction.contributionRequestSkillRequirement.deleteMany,
      ).toHaveBeenCalledWith({
        where: { contribution_request_id: REQUEST_ID },
      });
    });

    it('empties the set without a createMany when given no skills', async () => {
      lockReturns(ContributionRequestStatus.draft);

      await replace([]);

      expect(
        transaction.contributionRequestSkillRequirement.deleteMany,
      ).toHaveBeenCalled();
      expect(
        transaction.contributionRequestSkillRequirement.createMany,
      ).not.toHaveBeenCalled();
    });

    it('marks every owner-written row as an override with no confidence', async () => {
      lockReturns(ContributionRequestStatus.draft);

      await replace([
        {
          skillName: 'React',
          requiredLevel: SkillProfileProficiencyLevel.advanced,
          kind: ContributionRequestRequirementKind.required,
        },
        {
          skillName: 'GraphQL',
          requiredLevel: SkillProfileProficiencyLevel.beginner,
          kind: ContributionRequestRequirementKind.preferred,
        },
      ]);

      const { data } =
        transaction.contributionRequestSkillRequirement.createMany.mock
          .calls[0][0];
      expect(data).toHaveLength(2);
      for (const row of data) {
        // An override that did not record itself as one would be silently
        // overwritten by the next inference run (ADR 0015).
        expect(row.source).toBe(
          ContributionRequestSkillRequirementSource.owner_override,
        );
        expect(row.confidence).toBeNull();
      }
    });

    it('positions rows in the order the owner sent them', async () => {
      lockReturns(ContributionRequestStatus.draft);

      await replace([
        {
          skillName: 'React',
          requiredLevel: SkillProfileProficiencyLevel.advanced,
          kind: ContributionRequestRequirementKind.required,
        },
        {
          skillName: 'Node.js',
          requiredLevel: SkillProfileProficiencyLevel.intermediate,
          kind: ContributionRequestRequirementKind.required,
        },
      ]);

      const { data } =
        transaction.contributionRequestSkillRequirement.createMany.mock
          .calls[0][0];
      expect(data.map((row: { position: number }) => row.position)).toEqual([
        0, 1,
      ]);
    });
  });

  describe('skill-name identity', () => {
    it('stores the normalized name the unique index is built on', async () => {
      lockReturns(ContributionRequestStatus.draft);

      await replace([
        {
          skillName: '  Node.js  ',
          requiredLevel: SkillProfileProficiencyLevel.intermediate,
          kind: ContributionRequestRequirementKind.required,
        },
      ]);

      const { data } =
        transaction.contributionRequestSkillRequirement.createMany.mock
          .calls[0][0];
      // The owner's spelling is preserved for display; the identity form is
      // what the index and the eligibility lookup compare on.
      expect(data[0].skill_name).toBe('Node.js');
      expect(data[0].skill_name_normalized).toBe('nodejs');
    });

    it('refuses two spellings of one skill before the index has to', async () => {
      lockReturns(ContributionRequestStatus.draft);

      const error = await expectError(
        replace([
          {
            skillName: 'Node.js',
            requiredLevel: SkillProfileProficiencyLevel.advanced,
            kind: ContributionRequestRequirementKind.required,
          },
          {
            skillName: 'nodejs',
            requiredLevel: SkillProfileProficiencyLevel.beginner,
            kind: ContributionRequestRequirementKind.preferred,
          },
        ]),
        'REQUEST_SKILL_REQUIREMENT_DUPLICATE',
        422,
      );
      // Naming both spellings is the difference between a fixable error and a
      // shrug: the owner cannot see why "nodejs" collided with anything.
      expect(error.metadata).toEqual({
        skillName: 'nodejs',
        conflictsWith: 'Node.js',
      });
      expect(
        transaction.contributionRequestSkillRequirement.deleteMany,
      ).not.toHaveBeenCalled();
    });

    it('refuses a name that normalizes to nothing', async () => {
      lockReturns(ContributionRequestStatus.draft);

      // Two such rows would both normalize to '' and violate the unique index,
      // and neither could ever match a contributor's skill.
      await expectError(
        replace([
          {
            skillName: '---',
            requiredLevel: SkillProfileProficiencyLevel.beginner,
            kind: ContributionRequestRequirementKind.required,
          },
        ]),
        'REQUEST_SKILL_REQUIREMENT_NAME_INVALID',
        422,
      );
    });

    it('refuses more skills than the inference cap allows', async () => {
      lockReturns(ContributionRequestStatus.draft);

      const error = await expectError(
        replace(
          Array.from({ length: 16 }, (_unused, index) => ({
            skillName: `skill-${index}`,
            requiredLevel: SkillProfileProficiencyLevel.beginner,
            kind: ContributionRequestRequirementKind.required,
          })),
        ),
        'REQUEST_SKILL_REQUIREMENTS_TOO_MANY',
        422,
      );
      expect(error.metadata).toEqual({ limit: 15, received: 16 });
    });

    it('validates the input before opening a transaction', async () => {
      await expectError(
        replace([
          {
            skillName: '!!!',
            requiredLevel: SkillProfileProficiencyLevel.beginner,
            kind: ContributionRequestRequirementKind.required,
          },
        ]),
        'REQUEST_SKILL_REQUIREMENT_NAME_INVALID',
        422,
      );
      expect(database.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('authorization', () => {
    it('refuses a contributor', async () => {
      await expectError(
        service.replaceOwnerSkillRequirements({
          user: { ...owner, role: 'contributor' },
          requestId: REQUEST_ID,
          skillRequirements: [],
        }),
        'CONTRIBUTION_REQUEST_OWNER_ACCESS_REQUIRED',
        403,
      );
      expect(database.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a suspended owner', async () => {
      await expectError(
        service.replaceOwnerSkillRequirements({
          user: { ...owner, status: 'suspended' },
          requestId: REQUEST_ID,
          skillRequirements: [],
        }),
        'CONTRIBUTION_REQUEST_OWNER_ACCESS_REQUIRED',
        403,
      );
    });

    it("gives another owner's request the same not-found as an unknown id", async () => {
      // The lock query is scoped by owner_id, so a request belonging to someone
      // else returns no row — and must not be distinguishable from one that
      // does not exist, or the endpoint becomes a request-id oracle.
      transaction.$queryRaw.mockResolvedValue([]);

      await expectError(
        replace([]),
        'CONTRIBUTION_REQUEST_NOT_FOUND',
        404,
      );
    });
  });

  describe('reading the set', () => {
    it('returns the owner view with source and confidence intact', async () => {
      database.contributionRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
      });
      database.contributionRequestSkillRequirement.findMany.mockResolvedValue([
        {
          id: 'skill-1',
          skill_name: 'React',
          skill_name_normalized: 'react',
          required_level: SkillProfileProficiencyLevel.advanced,
          kind: ContributionRequestRequirementKind.required,
          source: ContributionRequestSkillRequirementSource.ai_inferred,
          confidence: 'high',
          position: 0,
        },
      ]);

      await expect(service.listForOwner(owner, REQUEST_ID)).resolves.toEqual([
        {
          id: 'skill-1',
          skillName: 'React',
          requiredLevel: SkillProfileProficiencyLevel.advanced,
          kind: ContributionRequestRequirementKind.required,
          source: ContributionRequestSkillRequirementSource.ai_inferred,
          confidence: 'high',
          position: 0,
        },
      ]);
    });

    it('keeps preferred rows in the snapshot rather than filtering them out', async () => {
      // The snapshot is the historical record of what the Request asked for.
      // Dropping `preferred` here would leave a later dispute unable to
      // reconstruct the bar; it is the *evaluation* that ignores them.
      transaction.contributionRequestSkillRequirement.findMany.mockResolvedValue(
        [
          {
            id: 'skill-1',
            skill_name: 'React',
            skill_name_normalized: 'react',
            required_level: SkillProfileProficiencyLevel.advanced,
            kind: ContributionRequestRequirementKind.required,
            source: ContributionRequestSkillRequirementSource.ai_inferred,
            confidence: 'high',
            position: 0,
          },
          {
            id: 'skill-2',
            skill_name: 'GraphQL',
            skill_name_normalized: 'graphql',
            required_level: SkillProfileProficiencyLevel.beginner,
            kind: ContributionRequestRequirementKind.preferred,
            source: ContributionRequestSkillRequirementSource.ai_inferred,
            confidence: 'low',
            position: 0,
          },
        ],
      );

      const rows = await service.readSnapshotRows(
        REQUEST_ID,
        transaction as never,
      );

      expect(rows.map((row) => row.kind)).toEqual(['required', 'preferred']);
    });
  });
});
