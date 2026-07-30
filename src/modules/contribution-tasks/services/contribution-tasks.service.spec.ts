import {
  ContributionRequestAuditAction,
  ContributionRequestDifficulty,
  ContributionRequestRequirementKind,
  ContributionRequestStatus,
  Prisma,
} from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import {
  ApplicationError,
  ConflictApplicationError,
} from '../../../shared/errors/application.error';
import { ContributionRequestPublicationService } from './contribution-request-publication.service';
import { ContributionTasksService } from './contribution-tasks.service';
import { PublicContributionRequestsService } from './public-contribution-requests.service';

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
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn(),
    },
    contributionRequestRequirement: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    contributionRequestAudit: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const projectsService = {
    getContributionRequestProjectAccess: jest.fn(),
    getContributionRequestProjectOwnerAccess: jest.fn(),
    lockContributionRequestProjectAccess: jest.fn(),
    lockContributionRequestProjectOwnerAccess: jest.fn(),
    lockContributionRequestProjectOwnerContext: jest.fn(),
    listContributionRequestProjectReferences: jest.fn(),
    getContributionRequestPublicationEntitlement: jest.fn(),
    isContributionRequestProjectPublished: jest.fn(),
    lockContributionRequestProjectPublication: jest.fn(),
  };
  const applicationsService = {
    cancelPendingForRequest: jest.fn(),
  };
  const service = new ContributionTasksService(
    database as never,
    projectsService as never,
  );
  const publicationService = new ContributionRequestPublicationService(
    database as never,
    projectsService as never,
    applicationsService as never,
  );
  const publicService = new PublicContributionRequestsService(
    database as never,
    projectsService as never,
  );
  const capturedFingerprint = (): string =>
    database.contributionRequestAudit.create.mock.calls[0][0].data
      .command_fingerprint as string;

  beforeEach(() => {
    jest.resetAllMocks();
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) =>
        callback(database),
    );
    database.contributionRequestAudit.findFirst.mockResolvedValue(null);
    database.contributionRequestAudit.create.mockResolvedValue({});
    database.contributionRequest.count.mockResolvedValue(0);
    database.contributionRequest.findMany.mockResolvedValue([]);
    database.subscription.findFirst.mockResolvedValue(null);
    database.$queryRaw.mockResolvedValue([]);
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
    projectsService.lockContributionRequestProjectAccess.mockResolvedValue({
      id: projectId,
      ownerId: owner.id,
      status: 'published',
    });
    projectsService.getContributionRequestProjectOwnerAccess.mockResolvedValue({
      id: projectId,
      ownerId: owner.id,
      status: 'published',
    });
    projectsService.lockContributionRequestProjectOwnerAccess.mockResolvedValue(
      {
        id: projectId,
        ownerId: owner.id,
        status: 'published',
      },
    );
    projectsService.lockContributionRequestProjectOwnerContext.mockResolvedValue(
      {
        id: projectId,
        ownerId: owner.id,
        status: 'published',
      },
    );
    projectsService.getContributionRequestPublicationEntitlement.mockResolvedValue(
      {
        planType: 'bronze',
        monthlyLimit: 10,
      },
    );
    projectsService.isContributionRequestProjectPublished.mockResolvedValue(
      true,
    );
    projectsService.lockContributionRequestProjectPublication.mockResolvedValue(
      true,
    );
    applicationsService.cancelPendingForRequest.mockResolvedValue({
      cancelledApplicationIds: [],
    });
    projectsService.listContributionRequestProjectReferences.mockResolvedValue([
      { id: projectId, title: 'Share-k Backend', slug: 'share-k-backend' },
    ]);
  });

  it('hides an otherwise-published Request when its Project is archived', async () => {
    database.contributionRequest.findUnique.mockResolvedValue(
      makeRequest({ status: ContributionRequestStatus.published }),
    );
    projectsService.isContributionRequestProjectPublished.mockResolvedValue(
      false,
    );

    await expect(
      service.getApplicationSubmissionContext(requestId),
    ).resolves.toBeNull();
  });

  it('creates an attributed draft Request from an accepted Proposal in the caller transaction', async () => {
    const proposalId = '55555555-5555-4555-8555-555555555555';
    const contributorId = '66666666-6666-4666-8666-666666666666';
    database.contributionRequest.create.mockResolvedValue(
      makeRequest({
        status: ContributionRequestStatus.draft,
        origin_proposal_id: proposalId,
        attributed_contributor_id: contributorId,
        requirements: [],
      }),
    );

    const result = await service.createDraftFromAcceptedProposal({
      transaction: database as never,
      ownerId: owner.id,
      projectId,
      proposalId,
      attributedContributorId: contributorId,
      title: 'Add a caching layer',
      description: 'Problem or opportunity:\nSlow discovery feed.',
    });

    expect(database.contributionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ContributionRequestStatus.draft,
          origin_proposal_id: proposalId,
          attributed_contributor_id: contributorId,
          owner_id: owner.id,
        }),
      }),
    );
    expect(database.contributionRequestAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: ContributionRequestAuditAction.created,
        to_status: ContributionRequestStatus.draft,
        metadata: expect.objectContaining({
          source: 'contribution_proposal',
          originProposalId: proposalId,
          attributedContributorId: contributorId,
        }),
      }),
    });
    expect(result.attribution).toEqual({
      proposalId,
      contributorId,
    });
  });

  it('revalidates the parent Project publication inside the submission transaction', async () => {
    database.$queryRaw.mockResolvedValue([
      {
        id: requestId,
        owner_id: owner.id,
        project_id: projectId,
        status: ContributionRequestStatus.published,
        applications_close_at: new Date('2030-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-07-28T00:00:00.000Z'),
      },
    ]);
    projectsService.lockContributionRequestProjectPublication.mockResolvedValue(
      false,
    );

    await expect(
      service.lockApplicationSubmissionContext(requestId, database as never),
    ).resolves.toBeNull();
    expect(
      database.contributionRequestRequirement.findMany,
    ).not.toHaveBeenCalled();
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
    expect(
      projectsService.lockContributionRequestProjectAccess,
    ).toHaveBeenCalledWith(projectId, owner.id, database);
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

  it('publishes a complete owned draft within the active owner plan limit', async () => {
    const current = makeRequest();
    const publishedAt = new Date('2026-07-28T12:00:00.000Z');
    const published = makeRequest({
      status: ContributionRequestStatus.published,
      published_at: publishedAt,
    });
    database.contributionRequest.findFirst.mockResolvedValue(current);
    database.contributionRequest.count.mockResolvedValue(9);
    database.subscription.findFirst.mockResolvedValue({ plan_type: 'bronze' });
    database.contributionRequest.updateMany.mockResolvedValue({ count: 1 });
    database.contributionRequest.findUniqueOrThrow.mockResolvedValue(published);

    await expect(
      publicationService.publishRequest({
        user: owner,
        requestId,
        idempotencyKey: 'publish-request-001',
      }),
    ).resolves.toMatchObject({
      status: ContributionRequestStatus.published,
      publishedAt,
    });

    expect(database.contributionRequest.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        owner_id: owner.id,
        published_at: expect.objectContaining({
          gte: expect.any(Date),
          lt: expect.any(Date),
        }),
      }),
    });
    expect(database.contributionRequest.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: requestId,
        owner_id: owner.id,
        status: ContributionRequestStatus.draft,
      }),
      data: {
        status: ContributionRequestStatus.published,
        published_at: expect.any(Date),
      },
    });
    expect(database.contributionRequestAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'published',
        from_status: ContributionRequestStatus.draft,
        to_status: ContributionRequestStatus.published,
      }),
    });
  });

  it('uses the default Bronze entitlement and blocks the eleventh monthly publication', async () => {
    database.contributionRequest.findFirst.mockResolvedValue(makeRequest());
    database.subscription.findFirst.mockResolvedValue(null);
    database.contributionRequest.count.mockResolvedValue(10);

    await expect(
      publicationService.publishRequest({ user: owner, requestId }),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_LIMIT_REACHED',
      statusCode: 409,
      metadata: {
        planType: 'bronze',
        monthlyLimit: 10,
        monthlyUsage: 10,
      },
    } satisfies Partial<ApplicationError>);
    expect(database.contributionRequest.updateMany).not.toHaveBeenCalled();
  });

  it('rejects publication when the draft is no longer complete', async () => {
    database.contributionRequest.findFirst.mockResolvedValue(
      makeRequest({ requirements: [] }),
    );

    await expect(
      publicationService.publishRequest({ user: owner, requestId }),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_REQUIRED_REQUIREMENT_MISSING',
      statusCode: 422,
    } satisfies Partial<ApplicationError>);
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('discovers only published requests whose Applications Close Time is still open', async () => {
    const actionable = {
      ...makeRequest({
        status: ContributionRequestStatus.published,
        published_at: new Date('2026-07-28T12:00:00.000Z'),
      }),
      project: {
        id: projectId,
        title: 'Share-k Backend',
        slug: 'share-k-backend',
      },
    };
    database.contributionRequest.count.mockResolvedValue(1);
    database.contributionRequest.findMany
      .mockResolvedValueOnce([actionable])
      .mockResolvedValueOnce([
        { technology_tags: ['NestJS', 'PostgreSQL'] },
      ]);

    const result = await publicService.list({
      q: 'webhook',
      technologies: ['NestJS'],
      difficulty: ContributionRequestDifficulty.intermediate,
      hasReward: true,
    });

    expect(database.contributionRequest.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            status: ContributionRequestStatus.published,
            published_at: { not: null },
            applications_close_at: { gt: expect.any(Date) },
          }),
        ]),
      }),
    });
    expect(result).toMatchObject({
      totalCount: 1,
      technologyFacets: ['NestJS', 'PostgreSQL'],
      items: [
        {
          id: requestId,
          projectName: 'Share-k Backend',
          projectSlug: 'share-k-backend',
          reward: { amount: 150, currency: 'USD' },
        },
      ],
    });
  });

  it('returns actionable public detail with Requirement classifications', async () => {
    database.contributionRequest.findFirst.mockResolvedValue({
      ...makeRequest({
        status: ContributionRequestStatus.published,
        published_at: new Date('2026-07-28T12:00:00.000Z'),
      }),
      project: {
        id: projectId,
        title: 'Share-k Backend',
        slug: 'share-k-backend',
      },
    });

    const result = await publicService.getById(requestId);

    expect(database.contributionRequest.findFirst).toHaveBeenCalledWith({
      where: {
        id: requestId,
        status: ContributionRequestStatus.published,
        published_at: { not: null },
        applications_close_at: { gt: expect.any(Date) },
      },
      include: {
        requirements: true,
        attributedContributor: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });
    expect(result.requirements).toEqual([
      expect.objectContaining({ classification: 'required' }),
      expect.objectContaining({ classification: 'preferred' }),
    ]);
    expect(result.attribution).toBeNull();
  });

  it('does not reveal non-actionable Requests through public detail', async () => {
    database.contributionRequest.findFirst.mockResolvedValue(null);

    await expect(publicService.getById(requestId)).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_NOT_FOUND',
      statusCode: 404,
    } satisfies Partial<ApplicationError>);
  });

  it('cancels a published Request and preserves terminal Application history', async () => {
    const published = makeRequest({
      status: ContributionRequestStatus.published,
      published_at: new Date('2026-07-28T12:00:00.000Z'),
    });
    const cancelled = makeRequest({
      status: ContributionRequestStatus.cancelled,
      published_at: published.published_at,
    });
    database.contributionRequest.findFirst.mockResolvedValue(published);
    database.contributionRequest.updateMany.mockResolvedValue({ count: 1 });
    database.contributionRequest.findUniqueOrThrow.mockResolvedValue(cancelled);
    applicationsService.cancelPendingForRequest.mockResolvedValue({
      cancelledApplicationIds: ['application-1'],
    });

    await expect(
      publicationService.cancelRequest({
        user: owner,
        requestId,
        reason: 'Project priorities changed',
        idempotencyKey: 'cancel-request-001',
      }),
    ).resolves.toMatchObject({ status: ContributionRequestStatus.cancelled });

    expect(database.contributionRequest.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: requestId,
        owner_id: owner.id,
        status: ContributionRequestStatus.published,
      }),
      data: { status: ContributionRequestStatus.cancelled },
    });
    expect(database.contributionRequestAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'cancelled',
        from_status: ContributionRequestStatus.published,
        to_status: ContributionRequestStatus.cancelled,
        reason: 'Project priorities changed',
      }),
    });
    expect(applicationsService.cancelPendingForRequest).toHaveBeenCalledWith({
      contributionRequestId: requestId,
      actorId: owner.id,
      reason: 'Project priorities changed',
      correlationId: expect.any(String),
      causationAuditId: expect.any(String),
      transaction: database,
    });
  });

  it('rejects cancellation before publication without mutating Applications', async () => {
    database.contributionRequest.findFirst.mockResolvedValue(makeRequest());

    await expect(
      publicationService.cancelRequest({ user: owner, requestId }),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_NOT_CANCELLABLE',
      statusCode: 409,
    } satisfies Partial<ApplicationError>);
    expect(applicationsService.cancelPendingForRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['title', { title: 'x' }],
    ['description', { description: 'too short' }],
  ])(
    'revalidates persisted %s completeness before publication',
    async (field, overrides) => {
      database.contributionRequest.findFirst.mockResolvedValue(
        makeRequest(overrides),
      );

      await expect(
        publicationService.publishRequest({ user: owner, requestId }),
      ).rejects.toMatchObject({
        code: 'CONTRIBUTION_REQUEST_DRAFT_NOT_PUBLISHABLE',
        statusCode: 409,
        metadata: { incompleteFields: [field] },
      } satisfies Partial<ApplicationError>);
      expect(database.$transaction).not.toHaveBeenCalled();
    },
  );

  it('replays a completed publish command without opening another transaction', async () => {
    const published = makeRequest({
      status: ContributionRequestStatus.published,
      published_at: new Date('2026-07-28T12:00:00.000Z'),
    });
    database.contributionRequest.findFirst.mockResolvedValue(makeRequest());
    database.contributionRequest.updateMany.mockResolvedValue({ count: 1 });
    database.contributionRequest.findUniqueOrThrow.mockResolvedValue(published);

    await publicationService.publishRequest({
      user: owner,
      requestId,
      idempotencyKey: 'publish-replay-001',
    });
    const fingerprint = capturedFingerprint();

    jest.clearAllMocks();
    database.contributionRequest.findFirst.mockResolvedValue(published);
    database.contributionRequestAudit.findFirst.mockResolvedValue({
      command_fingerprint: fingerprint,
      contributionRequest: published,
    });
    projectsService.getContributionRequestProjectAccess.mockResolvedValue({
      id: projectId,
      ownerId: owner.id,
      status: 'published',
    });

    await expect(
      publicationService.publishRequest({
        user: owner,
        requestId,
        idempotencyKey: 'publish-replay-001',
      }),
    ).resolves.toMatchObject({ status: ContributionRequestStatus.published });
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a cancel key replayed with a different reason', async () => {
    const published = makeRequest({
      status: ContributionRequestStatus.published,
      published_at: new Date('2026-07-28T12:00:00.000Z'),
    });
    const cancelled = makeRequest({
      status: ContributionRequestStatus.cancelled,
      published_at: published.published_at,
    });
    database.contributionRequest.findFirst.mockResolvedValue(published);
    database.contributionRequest.updateMany.mockResolvedValue({ count: 1 });
    database.contributionRequest.findUniqueOrThrow.mockResolvedValue(cancelled);

    await publicationService.cancelRequest({
      user: owner,
      requestId,
      reason: 'Original reason',
      idempotencyKey: 'cancel-replay-001',
    });
    const fingerprint = capturedFingerprint();

    jest.clearAllMocks();
    database.contributionRequest.findFirst.mockResolvedValue(cancelled);
    database.contributionRequestAudit.findFirst.mockResolvedValue({
      command_fingerprint: fingerprint,
      contributionRequest: cancelled,
    });
    projectsService.getContributionRequestProjectAccess.mockResolvedValue({
      id: projectId,
      ownerId: owner.id,
      status: 'published',
    });

    await expect(
      publicationService.cancelRequest({
        user: owner,
        requestId,
        reason: 'Different reason',
        idempotencyKey: 'cancel-replay-001',
      }),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_IDEMPOTENCY_CONFLICT',
      statusCode: 409,
    } satisfies Partial<ApplicationError>);
    expect(database.$transaction).not.toHaveBeenCalled();
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
    const fingerprint = capturedFingerprint();
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
    expect(projectsService.getContributionRequestProjectAccess).toHaveBeenCalledWith(
      projectId,
      owner.id,
    );
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

  it('returns the stable missing-Requirement code for an empty Required list', async () => {
    await expect(
      service.createDraft({
        user: owner,
        projectId,
        body: { ...createBody(), requiredRequirements: [] },
      }),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_REQUIRED_REQUIREMENT_MISSING',
      statusCode: 422,
    } satisfies Partial<ApplicationError>);
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('returns the stable duplicate code within one Requirement classification', async () => {
    await expect(
      service.createDraft({
        user: owner,
        projectId,
        body: {
          ...createBody(),
          requiredRequirements: [
            { text: 'Build a tested NestJS endpoint' },
            { text: 'build a tested nestjs endpoint' },
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

  it('rechecks published Project access inside the create transaction', async () => {
    projectsService.lockContributionRequestProjectAccess.mockRejectedValueOnce(
      new ConflictApplicationError(
        'Contribution Requests require a published Project',
        'CONTRIBUTION_REQUEST_PROJECT_NOT_PUBLISHED',
      ),
    );

    await expect(
      service.createDraft({
        user: owner,
        projectId,
        body: createBody(),
      }),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_PROJECT_NOT_PUBLISHED',
      statusCode: 409,
    } satisfies Partial<ApplicationError>);
    expect(database.contributionRequest.create).not.toHaveBeenCalled();
    expect(database.contributionRequestAudit.create).not.toHaveBeenCalled();
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
    expect(
      projectsService.lockContributionRequestProjectAccess,
    ).toHaveBeenCalledWith(projectId, owner.id, database);
  });

  it('authorizes an owner decision queue through ownership without requiring a published Project', async () => {
    database.contributionRequest.findUnique.mockResolvedValue({
      project_id: projectId,
    });
    projectsService.getContributionRequestProjectOwnerAccess.mockResolvedValue({
      id: projectId,
      ownerId: owner.id,
      status: 'archived',
    });

    await expect(
      service.confirmOwnerDecisionActor({ requestId, ownerId: owner.id }),
    ).resolves.toBeUndefined();

    expect(
      projectsService.getContributionRequestProjectOwnerAccess,
    ).toHaveBeenCalledWith(projectId, owner.id);
    expect(
      projectsService.isContributionRequestProjectPublished,
    ).not.toHaveBeenCalled();
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
    expect(
      projectsService.lockContributionRequestProjectAccess,
    ).toHaveBeenCalledWith(projectId, owner.id, database);
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

  it('rejects a discarded-command key reused with a different reason', async () => {
    const current = makeRequest();
    const discarded = makeRequest({
      status: ContributionRequestStatus.discarded,
    });
    database.contributionRequest.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current);
    database.contributionRequest.updateMany.mockResolvedValue({ count: 1 });
    database.contributionRequest.findUniqueOrThrow.mockResolvedValue(discarded);

    await service.discardDraft({
      user: owner,
      requestId,
      reason: 'No longer needed',
      idempotencyKey: 'discard-request-002',
    });
    const fingerprint = capturedFingerprint();

    jest.clearAllMocks();
    database.contributionRequest.findFirst.mockResolvedValue(discarded);
    database.contributionRequestAudit.findFirst.mockResolvedValue({
      command_fingerprint: fingerprint,
      contributionRequest: discarded,
    });

    await expect(
      service.discardDraft({
        user: owner,
        requestId,
        reason: 'A different reason',
        idempotencyKey: 'discard-request-002',
      }),
    ).rejects.toMatchObject({
      code: 'CONTRIBUTION_REQUEST_IDEMPOTENCY_CONFLICT',
      statusCode: 409,
    } satisfies Partial<ApplicationError>);
  });

  it('replays a completed idempotent update after a concurrent write wins', async () => {
    const current = makeRequest();
    const updated = makeRequest({ title: 'Updated request title' });
    database.contributionRequest.findFirst.mockResolvedValue(current);
    database.contributionRequest.updateMany.mockResolvedValue({ count: 1 });
    database.contributionRequest.findUniqueOrThrow.mockResolvedValue(updated);

    await service.updateDraft({
      user: owner,
      requestId,
      idempotencyKey: 'update-request-002',
      body: { title: 'Updated request title' },
    });
    const fingerprint = capturedFingerprint();

    jest.clearAllMocks();
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) =>
        callback(database),
    );
    database.contributionRequest.findFirst.mockResolvedValue(current);
    database.contributionRequestAudit.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        command_fingerprint: fingerprint,
        contributionRequest: updated,
      });
    database.contributionRequest.updateMany.mockResolvedValue({ count: 0 });
    projectsService.getContributionRequestProjectAccess.mockResolvedValue({
      id: projectId,
      ownerId: owner.id,
      status: 'published',
    });

    await expect(
      service.updateDraft({
        user: owner,
        requestId,
        idempotencyKey: 'update-request-002',
        body: { title: 'Updated request title' },
      }),
    ).resolves.toMatchObject({ title: 'Updated request title' });
  });

  it('replays a completed idempotent discard after a concurrent write wins', async () => {
    const current = makeRequest();
    const discarded = makeRequest({
      status: ContributionRequestStatus.discarded,
    });
    database.contributionRequest.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current);
    database.contributionRequest.updateMany.mockResolvedValue({ count: 1 });
    database.contributionRequest.findUniqueOrThrow.mockResolvedValue(discarded);

    await service.discardDraft({
      user: owner,
      requestId,
      reason: 'No longer needed',
      idempotencyKey: 'discard-request-003',
    });
    const fingerprint = capturedFingerprint();

    jest.clearAllMocks();
    database.$transaction.mockImplementation(
      (callback: (transaction: typeof database) => unknown) =>
        callback(database),
    );
    database.contributionRequest.findFirst.mockResolvedValue(current);
    database.contributionRequestAudit.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        command_fingerprint: fingerprint,
        contributionRequest: discarded,
      });
    database.contributionRequest.updateMany.mockResolvedValue({ count: 0 });
    projectsService.getContributionRequestProjectAccess.mockResolvedValue({
      id: projectId,
      ownerId: owner.id,
      status: 'published',
    });

    await expect(
      service.discardDraft({
        user: owner,
        requestId,
        reason: 'No longer needed',
        idempotencyKey: 'discard-request-003',
      }),
    ).resolves.toMatchObject({ status: ContributionRequestStatus.discarded });
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

  it('lists an owned Project Requests grouped across every lifecycle state', async () => {
    projectsService.getContributionRequestProjectOwnerAccess.mockResolvedValue({
      id: projectId,
      ownerId: owner.id,
      status: 'archived',
    });
    database.contributionRequest.findMany.mockResolvedValue([
      makeRequest({
        id: '44444444-4444-4444-8444-444444444444',
        status: ContributionRequestStatus.cancelled,
      }),
      makeRequest({ status: ContributionRequestStatus.draft }),
    ]);

    const result = await service.listForOwnedProject(owner, projectId);

    expect(
      projectsService.getContributionRequestProjectOwnerAccess,
    ).toHaveBeenCalledWith(projectId, owner.id);
    expect(database.contributionRequest.findMany).toHaveBeenCalledWith({
      where: { project_id: projectId, owner_id: owner.id },
      include: { requirements: true },
      orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
    });
    expect(result).toMatchObject({
      projectId,
      totalCount: 2,
      byStatus: {
        draft: [{ id: requestId, status: 'draft' }],
        published: [],
        assigned: [],
        completed: [],
        cancelled: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            status: 'cancelled',
          },
        ],
        discarded: [],
      },
    });
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

  it('assigns a published Request through the caller transaction after rechecking owner and state', async () => {
    database.$queryRaw.mockResolvedValue([
      {
        id: requestId,
        project_id: projectId,
        status: ContributionRequestStatus.published,
      },
    ]);
    database.contributionRequest.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.assignFromOwnerDecision({
        requestId,
        ownerId: owner.id,
        ownerDecisionId: '44444444-4444-4444-8444-444444444444',
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
        commandFingerprint: 'a'.repeat(64),
        transaction: database as never,
      }),
    ).resolves.toBeUndefined();

    expect(database.contributionRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: requestId,
        status: ContributionRequestStatus.published,
      },
      data: { status: ContributionRequestStatus.assigned },
    });
    expect(database.contributionRequestAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contribution_request_id: requestId,
        actor_id: owner.id,
        action: ContributionRequestAuditAction.assigned,
        from_status: ContributionRequestStatus.published,
        to_status: ContributionRequestStatus.assigned,
        metadata: {
          payloadVersion: 1,
          ownerDecisionId: '44444444-4444-4444-8444-444444444444',
        },
      }),
    });
    expect(
      projectsService.lockContributionRequestProjectOwnerAccess,
    ).toHaveBeenCalledWith(projectId, owner.id, database);
  });

  it('reconfirms current Project ownership for a decline on the caller transaction', async () => {
    database.$queryRaw.mockResolvedValue([
      { id: requestId, project_id: projectId },
    ]);

    await expect(
      service.reconfirmOwnerDecisionActor({
        requestId,
        ownerId: owner.id,
        transaction: database as never,
      }),
    ).resolves.toBeUndefined();

    expect(
      projectsService.lockContributionRequestProjectOwnerAccess,
    ).toHaveBeenCalledWith(projectId, owner.id, database);
  });

  it('locks the Request and resolves the current Project owner for a scheduled reminder', async () => {
    database.$queryRaw.mockResolvedValue([
      { id: requestId, project_id: projectId },
    ]);

    await expect(
      service.lockApplicationReviewOwner({
        requestId,
        transaction: database as never,
      }),
    ).resolves.toEqual({ ownerId: owner.id });

    const query = database.$queryRaw.mock.calls[0][0] as { strings: string[] };
    expect(query.strings.join('')).toContain('FOR SHARE');
    expect(
      projectsService.lockContributionRequestProjectOwnerContext,
    ).toHaveBeenCalledWith(projectId, database);
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
    origin_proposal_id: null as string | null,
    attributed_contributor_id: null as string | null,
    published_at: null as Date | null,
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
