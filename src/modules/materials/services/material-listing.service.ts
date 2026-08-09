import { Injectable } from '@nestjs/common';
import { MaterialVisibility, Prisma, ProjectStatus } from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import { ForbiddenApplicationError } from '../../../shared/errors/application.error';
import { ContributionTasksService } from '../../contribution-tasks/services/contribution-tasks.service';
import { ProjectsService } from '../../projects/projects.service';
import { MaterialDto } from '../dto/material-response.dto';
import { MATERIAL_INCLUDE, toMaterialDto } from '../mappers/material.mapper';

/**
 * Lists the Materials attached to a Project or a Contribution Request, showing
 * each caller only what they may actually read.
 *
 * Filtering happens in the query rather than by fetching everything and
 * discarding rows afterwards. A list that briefly holds Materials the caller
 * cannot see is one refactor away from returning them, and the count alone
 * already leaks how many private documents a Project holds.
 */
@Injectable()
export class MaterialListingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly contributionTasks: ContributionTasksService,
  ) {}

  async listForProject(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<MaterialDto[]> {
    this.assertActive(actor);
    const project = await this.projects.getMaterialProjectContext(projectId);
    return this.list(actor, {
      isOwner: project.ownerId === actor.id,
      projectPublished: project.status === ProjectStatus.published,
      scope: { project_id: projectId },
      projectId,
      contributionRequestId: null,
    });
  }

  async listForContributionRequest(
    actor: AuthenticatedUser,
    requestId: string,
  ): Promise<MaterialDto[]> {
    this.assertActive(actor);
    const access = await this.contributionTasks.getMaterialAssignmentAccess({
      projectId: null,
      contributionRequestId: requestId,
    });
    const project = access.projectId
      ? await this.projects.getMaterialProjectContext(access.projectId)
      : null;
    return this.list(actor, {
      isOwner: project?.ownerId === actor.id,
      projectPublished: project?.status === ProjectStatus.published,
      // A Request view is a composed view: it includes documents attached to
      // the Request itself and documents inherited from its Project. The
      // Material row still has exactly one scope; this query only composes
      // the two scopes for readers of the Request.
      scope: {
        OR: [
          { project_id: access.projectId },
          { contribution_request_id: requestId },
        ],
      },
      projectId: access.projectId,
      contributionRequestId: requestId,
    });
  }

  private async list(
    actor: AuthenticatedUser,
    context: {
      isOwner: boolean;
      projectPublished: boolean | undefined;
      scope: Prisma.MaterialWhereInput;
      projectId: string | null;
      contributionRequestId: string | null;
    },
  ): Promise<MaterialDto[]> {
    if (context.isOwner) {
      const materials = await this.database.material.findMany({
        // Deleted Materials stay in the owner's own listing. The content is
        // already gone; hiding the record too would make a deletion look like
        // a failed request, with nothing to confirm it happened.
        where: context.scope,
        include: MATERIAL_INCLUDE,
        orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
      });
      return materials.map(toMaterialDto);
    }

    const access = await this.contributionTasks.getMaterialAssignmentAccess({
      projectId: context.projectId,
      contributionRequestId: context.contributionRequestId,
    });
    const isProjectAssignee = access.activeProjectAssigneeIds.includes(actor.id);
    const isRequestAssignee = access.activeRequestAssigneeId === actor.id;

    // Each disjunct mirrors one class in MaterialAccessService. They are the
    // same rules expressed as a query, and the access service remains the
    // authority for any single Material.
    const readable = [
      ...(context.projectPublished
        ? [{ visibility: MaterialVisibility.public }]
        : []),
      ...(isProjectAssignee
        ? [
            {
              visibility: MaterialVisibility.restricted_project,
              grants: { some: { grantee_id: actor.id, revoked_at: null } },
            },
          ]
        : []),
      ...(isRequestAssignee
        ? [{ visibility: MaterialVisibility.assignment }]
        : []),
    ];
    if (readable.length === 0) return [];

    const materials = await this.database.material.findMany({
      // Keep the scope predicate separate from the visibility predicate. A
      // Request listing has an OR scope of its own, so spreading both would
      // silently overwrite one OR with the other and leak the wrong rows.
      where: {
        AND: [context.scope, { deleted_at: null }, { OR: readable }],
      },
      include: MATERIAL_INCLUDE,
      orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
    });
    return materials.map(toMaterialDto);
  }

  private assertActive(actor: AuthenticatedUser): void {
    if (actor.status !== 'active') {
      throw new ForbiddenApplicationError(
        'Only an active account can read Materials',
        'MATERIAL_NOT_AUTHORIZED',
      );
    }
  }
}
