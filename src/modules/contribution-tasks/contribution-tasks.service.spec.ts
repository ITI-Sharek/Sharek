import {
  ContributionRequestAuditAction,
  ContributionRequestDifficulty,
  ContributionRequestRequirementKind,
  ContributionRequestStatus,
  Prisma,
} from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { ApplicationError } from '../../shared/errors/application.error';
import { ContributionTasksService } from './contribution-tasks.service';

const owner: AuthenticatedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@example.com',
  role: 'owner',
  status: 'active',
};
const projectId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';

describe('ContributionTasksService', () => {
  const database = {
    contributionRequest: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    contributionRequestRequirement: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    contributionRequestAudit: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const projectsService = {
    getContributionRequestProjectAccess: jest.fn(),
  };
  const service = new ContributionTasksService(
    database as never,
    projectsService as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) =>
        callback(database),
    );
    database.contributionRequestAudit.findFirst.mockResolvedValue(null);
    database.contributionRequestAudit.create.mockResolvedValue({});
    database.contributionRequestRequirement.deleteMany.mockResolvedValue({
      count: 2,
    });
    database.contributionRequestRequirement.createMany.mockResolvedValue({
      count: 2,
    });
    projectsService.getContributionRequestProjectAccess.mockResolvedValue({
      id: projectId,
      ownerId: owner.id,
      status: 'published',
    });
  });

  it('creates a private draft with ordered structured requirements and an audit', async () => {
    database.contributionRequest.create.mockResolvedValue(makeRequest());

    const result = await service.createDraft({
      user: owner,
      projectId,
      idempotencyKey: 'create-request-001',
      body: createBody(),
    });

    expect(projectsService.getContributionRequestProjectAccess).toHaveBeenCalledWith(
      projectId,
      owner.id,
    );
    expect(database.contributionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          project_id: projectId,
          owner_id: owner.id,
          status: ContributionRequestStatus.draft,
          requirements: {
            create: [
              {
                kind: ContributionRequestRequirementKind.required,
                position: 0,
                text: 'Build a tested NestJS endpoint',
              },
              {
                kind: ContributionRequestRequirementKind.preferred,
                position: 0,
                text: 'Document the API examples',
              },
            ],
          },
        }),
        include: { requirements: true },
      }),
    );
    expect(database.contributionRequestAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contribution_request_id: requestId,
        actor_id: owner.id,
        action: ContributionRequestAuditAction.created,
        to_status: ContributionRequestStatus.draft,
        idempotency_key: 'create-request-001',
      }),
    });
    expect(result).toMatchObject({
      id: requestId,
      status: ContributionRequestStatus.draft,
      technologyTags: ['NestJS', 'PostgreSQL'],
      requiredRequirements: [
        expect.objectContaining({ text: 'Build a tested NestJS endpoint' }),
      ],
      preferredRequirements: [
        expect.objectContaining({ text: 'Document the API examples' }),
      ],
    });
  });

  it('returns the original request for an idempotent create replay', async () => {
    // Capture the deterministic fingerprint from one successful command.
    database.contributionRequestAudit.findFirst.mockResolvedValue(null);
    database.contributionRequest.create.mockResolvedValue(makeRequest());
    await service.createDraft({
      user: owner,
      projectId,
      idempotencyKey: 'create-request-002',
      body: createBody(),
    });
    const fingerprint = database.contributionRequestAudit.create.mock.calls[0][0]
      .data.command_fingerprint as string;
    jest.clearAllMocks();
    database.contributionRequestAudit.findFirst.mockResolvedValue({
      command_fingerprint: fingerprint,
      contributionRequest: makeRequest(),
    });

    const replay = await service.createDraft({
      user: owner,
      projectId,
      idempotencyKey: 'create-request-002',
      body: createBody(),
    });

    expect(replay.id).toBe(requestId);
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(projectsService.getContributionRequestProjectAccess).not.toHaveBeenCalled();
  });

  it('rejects a Requirement classified as both Required and Preferred', async () => {
    await expect(
      service.createDraft({
        user: owner,
        projectId,
        body: {
          ...createBody(),
          preferredRequirements: [
            { text: 'Build a tested NestJS endpoint' },
          ],
        },
      }),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_REQUIREMENT_DUPLICATE',
      statusCode: 422,
    } satisfies Partial<ApplicationError>);
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('rejects invalid close/completion ordering before persistence', async () => {
    await expect(
      service.createDraft({
        user: owner,
        projectId,
        body: {
          ...createBody(),
          applicationsCloseTime: '2030-03-10T12:00:00.000Z',
          targetCompletionDate: '2030-03-10',
        },
      }),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_DATE_ORDER_INVALID',
    } satisfies Partial<ApplicationError>);
  });

  it('rejects an Applications Close Time that is not in the future', async () => {
    await expect(
      service.createDraft({
        user: owner,
        projectId,
        body: {
          ...createBody(),
          applicationsCloseTime: '2020-03-10T12:00:00.000Z',
          targetCompletionDate: null,
        },
      }),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_CLOSE_TIME_INVALID',
      statusCode: 422,
    } satisfies Partial<ApplicationError>);
  });

  it('updates only a draft with optimistic concurrency and replaces requirements atomically', async () => {
    const current = makeRequest();
    const updated = makeRequest({
      title: 'Updated request title',
      requirements: [
        makeRequirement('required', 0, 'Updated required outcome'),
        makeRequirement('preferred', 0, 'Updated preferred outcome'),
      ],
    });
    database.contributionRequest.findFirst.mockResolvedValue(current);
    database.contributionRequest.updateMany.mockResolvedValue({ count: 1 });
    database.contributionRequest.findUniqueOrThrow.mockResolvedValue(updated);

    const result = await service.updateDraft({
      user: owner,
      requestId,
      idempotencyKey: 'update-request-001',
      body: {
        title: 'Updated request title',
        requiredRequirements: [{ text: 'Updated required outcome' }],
        preferredRequirements: [{ text: 'Updated preferred outcome' }],
      },
    });

    expect(database.contributionRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: requestId,
        owner_id: owner.id,
        status: ContributionRequestStatus.draft,
        updated_at: current.updated_at,
      },
      data: expect.objectContaining({ title: 'Updated request title' }),
    });
    expect(database.contributionRequestRequirement.deleteMany).toHaveBeenCalled();
    expect(database.contributionRequestRequirement.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          kind: ContributionRequestRequirementKind.required,
          position: 0,
          text: 'Updated required outcome',
        }),
        expect.objectContaining({
          kind: ContributionRequestRequirementKind.preferred,
          position: 0,
          text: 'Updated preferred outcome',
        }),
      ],
    });
    expect(result.title).toBe('Updated request title');
  });

  it('discards once, appends one terminal audit, and treats later discard as idempotent', async () => {
    const current = makeRequest();
    const discarded = makeRequest({
      status: ContributionRequestStatus.discarded,
    });
    database.contributionRequest.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current);
    database.contributionRequest.updateMany.mockResolvedValue({ count: 1 });
    database.contributionRequest.findUniqueOrThrow.mockResolvedValue(discarded);

    const result = await service.discardDraft({
      user: owner,
      requestId,
      reason: 'No longer needed',
      idempotencyKey: 'discard-request-001',
    });

    expect(result.status).toBe(ContributionRequestStatus.discarded);
    expect(database.contributionRequestAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: ContributionRequestAuditAction.discarded,
        from_status: ContributionRequestStatus.draft,
        to_status: ContributionRequestStatus.discarded,
        reason: 'No longer needed',
      }),
    });

    jest.clearAllMocks();
    database.contributionRequest.findFirst.mockResolvedValue(discarded);
    const replay = await service.discardDraft({
      user: owner,
      requestId,
    });
    expect(replay.status).toBe(ContributionRequestStatus.discarded);
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(database.contributionRequestAudit.create).not.toHaveBeenCalled();
  });

  it('rejects an illegal update transition without writing', async () => {
    database.contributionRequest.findFirst.mockResolvedValue(
      makeRequest({ status: ContributionRequestStatus.discarded }),
    );

    await expect(
      service.updateDraft({
        user: owner,
        requestId,
        body: { title: 'A valid updated title' },
      }),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_DRAFT_NOT_EDITABLE',
      statusCode: 409,
    } satisfies Partial<ApplicationError>);
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('detects a concurrent draft transition before replacing Requirements', async () => {
    database.contributionRequest.findFirst.mockResolvedValue(makeRequest());
    database.contributionRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateDraft({
        user: owner,
        requestId,
        body: { title: 'A concurrently updated title' },
      }),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_CONCURRENT_MODIFICATION',
      statusCode: 409,
    } satisfies Partial<ApplicationError>);
    expect(database.contributionRequestRequirement.deleteMany).not.toHaveBeenCalled();
    expect(database.contributionRequestAudit.create).not.toHaveBeenCalled();
  });

  it('returns the same safe not-found outcome for an unknown or other-owner request', async () => {
    database.contributionRequest.findFirst.mockResolvedValue(null);

    await expect(service.getOwnedRequest(owner, requestId)).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_NOT_FOUND',
      statusCode: 404,
    } satisfies Partial<ApplicationError>);
  });

  it('rechecks published Project access before exposing an owned request', async () => {
    database.contributionRequest.findFirst.mockResolvedValue(makeRequest());

    await service.getOwnedRequest(owner, requestId);

    expect(projectsService.getContributionRequestProjectAccess).toHaveBeenCalledWith(
      projectId,
      owner.id,
    );
  });

  it('blocks pending accounts independently of account role', async () => {
    await expect(
      service.createDraft({
        user: { ...owner, role: 'contributor', status: 'pending' },
        projectId,
        body: createBody(),
      }),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_OWNER_ACCESS_REQUIRED',
      statusCode: 403,
    } satisfies Partial<ApplicationError>);
  });

  it('blocks active non-owner accounts before Project access', async () => {
    await expect(
      service.createDraft({
        user: { ...owner, role: 'contributor' },
        projectId,
        body: createBody(),
      }),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_OWNER_ACCESS_REQUIRED',
      statusCode: 403,
    } satisfies Partial<ApplicationError>);
    expect(projectsService.getContributionRequestProjectAccess).not.toHaveBeenCalled();
  });
});

function createBody() {
  return {
    title: 'Build contribution request drafts',
    description: 'Implement the complete private draft lifecycle safely.',
    requiredRequirements: [{ text: 'Build a tested NestJS endpoint' }],
    preferredRequirements: [{ text: 'Document the API examples' }],
    technologyTags: ['NestJS', 'PostgreSQL'],
    applicationsCloseTime: '2030-03-10T12:00:00.000Z',
    targetCompletionDate: '2030-03-20',
    difficulty: ContributionRequestDifficulty.intermediate,
    reward: 150,
    rewardCurrency: 'USD',
  };
}

function makeRequest(
  overrides: Partial<ReturnType<typeof baseRequest>> = {},
) {
  return { ...baseRequest(), ...overrides };
}

function baseRequest() {
  return {
    id: requestId,
    project_id: projectId,
    owner_id: owner.id,
    title: 'Build contribution request drafts',
    description: 'Implement the complete private draft lifecycle safely.',
    technology_tags: ['NestJS', 'PostgreSQL'],
    difficulty: ContributionRequestDifficulty.intermediate,
    applications_close_at: new Date('2030-03-10T12:00:00.000Z'),
    target_completion_date: new Date('2030-03-20T00:00:00.000Z'),
    reward: new Prisma.Decimal(150),
    reward_currency: 'USD',
    status: ContributionRequestStatus.draft as ContributionRequestStatus,
    max_applicants: 1,
    published_at: null,
    created_at: new Date('2026-07-28T00:00:00.000Z'),
    updated_at: new Date('2026-07-28T00:00:00.000Z'),
    requirements: [
      makeRequirement('required', 0, 'Build a tested NestJS endpoint'),
      makeRequirement('preferred', 0, 'Document the API examples'),
    ],
  };
}

function makeRequirement(
  kind: ContributionRequestRequirementKind,
  position: number,
  text: string,
) {
  return {
    id: `${kind}-${position}`,
    contribution_request_id: requestId,
    kind,
    position,
    text,
    created_at: new Date('2026-07-28T00:00:00.000Z'),
  };
}
