import {
  ProjectCategory,
  ProjectDifficulty,
  ProjectStatus,
} from '@prisma/client';

import { ApplicationError } from '../../shared/errors/application.error';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  const database = {
    project: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    contributionRequest: { count: jest.fn() },
    subscription: { findFirst: jest.fn() },
  };
  const applications = {
    summarizePendingByContributionRequests: jest.fn(),
  };
  // The real EntitlementsService over the same mocked client, so the quota
  // assertions below still exercise plan resolution rather than a stub of it.
  const service = new ProjectsService(
    database as never,
    new EntitlementsService(database as never),
    applications as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    applications.summarizePendingByContributionRequests.mockResolvedValue({
      projects: [],
    });
    database.subscription.findFirst.mockResolvedValue(null);
  });

  it('returns only published Project references to public Request discovery', async () => {
    database.project.findMany.mockResolvedValue([]);

    await service.listContributionRequestProjectReferences({
      projectIds: ['project-id'],
    });

    expect(database.project.findMany).toHaveBeenCalledWith({
      where: {
        status: ProjectStatus.published,
        id: { in: ['project-id'] },
      },
      select: { id: true, title: true, slug: true },
    });
  });

  describe('Contribution Request Project access capability', () => {
    it('returns only the ownership facts needed by the owning module', async () => {
      database.project.findUnique.mockResolvedValue({
        id: 'project-id',
        owner_id: 'owner-id',
        status: ProjectStatus.published,
      });

      await expect(
        service.getContributionRequestProjectAccess('project-id', 'owner-id'),
      ).resolves.toEqual({
        id: 'project-id',
        ownerId: 'owner-id',
        status: ProjectStatus.published,
      });
      expect(database.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'project-id' },
        select: { id: true, owner_id: true, status: true },
      });
    });

    it('locks Project access through the caller transaction', async () => {
      const transaction = {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: 'project-id',
            owner_id: 'owner-id',
            status: ProjectStatus.published,
          },
        ]),
      };

      await service.lockContributionRequestProjectAccess(
        'project-id',
        'owner-id',
        transaction as never,
      );

      expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
      const query = transaction.$queryRaw.mock.calls[0][0] as {
        strings: string[];
      };
      expect(query.strings.join('')).toContain('FOR SHARE');
      expect(database.project.findUnique).not.toHaveBeenCalled();
    });

    it('returns the current owner from the locked Project for scheduled review work', async () => {
      const transaction = {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: 'project-id',
            owner_id: 'current-owner-id',
            status: ProjectStatus.archived,
          },
        ]),
      };

      await expect(
        service.lockContributionRequestProjectOwnerContext(
          'project-id',
          transaction as never,
        ),
      ).resolves.toEqual({
        id: 'project-id',
        ownerId: 'current-owner-id',
        status: ProjectStatus.archived,
      });
      expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('does not reveal whether a Project belongs to another owner', async () => {
      database.project.findUnique.mockResolvedValue({
        id: 'project-id',
        owner_id: 'other-owner',
        status: ProjectStatus.published,
      });

      await expect(
        service.getContributionRequestProjectAccess('project-id', 'owner-id'),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'CONTRIBUTION_REQUEST_PROJECT_NOT_FOUND',
      } satisfies Partial<ApplicationError>);
    });

    it('requires the owned Project to be published', async () => {
      database.project.findUnique.mockResolvedValue({
        id: 'project-id',
        owner_id: 'owner-id',
        status: ProjectStatus.draft,
      });

      await expect(
        service.getContributionRequestProjectAccess('project-id', 'owner-id'),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'CONTRIBUTION_REQUEST_PROJECT_NOT_PUBLISHED',
      } satisfies Partial<ApplicationError>);
    });
  });

  describe('Contribution Proposal Project context capability', () => {
    it('locks the Project row through the caller transaction', async () => {
      const transaction = {
        $queryRaw: jest.fn().mockResolvedValue([
          {
            id: 'project-id',
            owner_id: 'owner-id',
            status: ProjectStatus.published,
          },
        ]),
      };

      await expect(
        service.lockProposalProjectContext(
          'project-id',
          transaction as never,
        ),
      ).resolves.toEqual({
        id: 'project-id',
        ownerId: 'owner-id',
        status: ProjectStatus.published,
      });
      const query = transaction.$queryRaw.mock.calls[0][0] as {
        strings: string[];
      };
      expect(query.strings.join('')).toContain('FOR SHARE');
    });

    it('returns the proposal-safe not-found error when the row is absent', async () => {
      const transaction = {
        $queryRaw: jest.fn().mockResolvedValue([]),
      };

      await expect(
        service.lockProposalProjectContext(
          'missing-project-id',
          transaction as never,
        ),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'PROPOSAL_PROJECT_NOT_FOUND',
      } satisfies Partial<ApplicationError>);
    });
  });

  it('lists owner projects with revision, pipeline counts, and quota usage', async () => {
    database.project.findMany.mockResolvedValue([
      {
        id: 'project-id',
        title: 'Share-k API',
        slug: 'sharek-api',
        revision: 3,
        status: ProjectStatus.published,
        updated_at: new Date(),
        contributionRequests: [
          {
            id: 'request-id',
            status: 'published',
          },
        ],
      },
    ]);
    database.contributionRequest.count.mockResolvedValue(7);
    database.subscription.findFirst.mockResolvedValue({
      plan_type: 'gold',
      status: 'active',
      source: 'payment_provider',
      starts_at: new Date('2026-08-01T00:00:00.000Z'),
      expires_at: new Date('2026-09-01T00:00:00.000Z'),
      current_period_start: new Date('2026-08-01T00:00:00.000Z'),
      current_period_end: new Date('2026-09-01T00:00:00.000Z'),
    });
    applications.summarizePendingByContributionRequests.mockResolvedValue({
      projects: [{ projectId: 'project-id', pendingApplicationCount: 1 }],
    });

    await expect(service.getMyProjects('owner-id')).resolves.toMatchObject({
      projects: [
        {
          id: 'project-id',
          slug: 'sharek-api',
          revision: 3,
          openRequestsCount: 1,
          pendingApplicationsCount: 1,
        },
      ],
      quota: { used: 7, monthlyLimit: 30 },
    });
    expect(database.contributionRequest.count).toHaveBeenCalledWith({
      where: {
        owner_id: 'owner-id',
        published_at: {
          gte: expect.any(Date),
          lt: expect.any(Date),
        },
      },
    });
    expect(
      applications.summarizePendingByContributionRequests,
    ).toHaveBeenCalledWith({
      requestScopes: [
        { projectId: 'project-id', contributionRequestIds: ['request-id'] },
      ],
    });
  });

  it('allows active contributors to use the persisted-owner workspace', async () => {
    database.project.findMany.mockResolvedValue([]);
    database.contributionRequest.count.mockResolvedValue(0);

    await expect(
      service.getMyProjectsForActor({
        id: 'contributor-id',
        email: 'member@example.com',
        role: 'contributor',
        status: 'active',
      }),
    ).resolves.toMatchObject({ projects: [] });
  });

  it('rejects inactive and admin accounts from ordinary owner workflows', async () => {
    await expect(
      service.getMyProjectsForActor({
        id: 'admin-id',
        email: 'admin@example.com',
        role: 'admin',
        status: 'active',
      }),
    ).rejects.toMatchObject({ code: 'PROJECT_ACCOUNT_NOT_ELIGIBLE' });
  });

  it('discovers only published projects with the requested filters', async () => {
    database.project.count.mockResolvedValue(1);
    database.project.findMany.mockResolvedValue([publishedProject()]);

    const result = await service.discoverPublishedProjects({
      technologies: ['TypeScript'],
      category: ProjectCategory.web,
      difficulty: ProjectDifficulty.intermediate,
      search: 'api',
    });

    expect(database.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ status: ProjectStatus.published }]),
        }),
      }),
    );
    expect(result.projects[0]).toMatchObject({
      slug: 'sharek-api',
      title: 'Share-k API',
    });
  });

  it('lists only published-project owners for an active admin', async () => {
    database.project.groupBy.mockResolvedValue([
      {
        owner_id: 'owner-id',
        _count: { _all: 1 },
        _max: { published_at: new Date('2026-07-20T08:00:00Z') },
      },
    ]);
    database.project.findFirst.mockResolvedValue({
      id: 'project-id',
      title: 'Published project',
      github_repo_url: 'https://github.com/sharek/project',
      owner: {
        id: 'owner-id',
        email: 'owner@example.com',
        first_name: 'Project',
        last_name: 'Owner',
      },
    });

    await expect(
      service.listPublishedProjectOwners({
        id: 'admin-id',
        email: 'admin@example.com',
        role: 'admin',
        status: 'active',
      }),
    ).resolves.toHaveLength(1);
  });

  it('retires the unsafe combined import-and-publish interaction', () => {
    expect(() => service.rejectRetiredImportRoute()).toThrow(
      expect.objectContaining({
        code: 'PROJECT_IMPORT_ROUTE_RETIRED',
        statusCode: 410,
      }),
    );
  });
});

function publishedProject() {
  return {
    id: 'discover-project-id',
    owner_id: 'owner-id',
    title: 'Share-k API',
    slug: 'sharek-api',
    slug_normalized: 'sharek-api',
    description: 'Backend service',
    github_repo_url: 'https://github.com/ITI-Sharek/sharek-api',
    github_repo_id: '123',
    languages: { TypeScript: 1000 },
    tags: ['nestjs'],
    technologies: ['TypeScript', 'PostgreSQL'],
    repo_statistics: { stars: 5 },
    category: ProjectCategory.web,
    difficulty: ProjectDifficulty.intermediate,
    status: ProjectStatus.published,
    readme_content: '# Share-k API',
    revision: 2,
    manual_overrides: [],
    source_visibility: 'public',
    source_owner_id: '42',
    source_owner_type: 'organization',
    source_default_branch: 'main',
    source_updated_at: new Date('2026-07-20T00:00:00Z'),
    source_fetched_at: new Date('2026-07-20T00:00:00Z'),
    published_at: new Date('2026-07-20T00:00:00Z'),
    archived_at: null,
    created_at: new Date('2026-07-19T00:00:00Z'),
    updated_at: new Date('2026-07-20T00:00:00Z'),
  };
}
