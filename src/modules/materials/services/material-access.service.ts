import { Injectable } from '@nestjs/common';
import {
  MaterialScanStatus,
  MaterialVisibility,
  ProjectStatus,
} from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import { NotFoundApplicationError } from '../../../shared/errors/application.error';
import { ContributionTasksService } from '../../contribution-tasks/services/contribution-tasks.service';
import { ProjectsService } from '../../projects/projects.service';

export type MaterialReadContext = {
  materialId: string;
  ownerId: string;
  visibility: MaterialVisibility;
  projectId: string | null;
  contributionRequestId: string | null;
  isOwner: boolean;
};

/**
 * Decides who may read a Material, and separately whether a specific version's
 * bytes may leave the server.
 *
 * Two decisions, not one, because they fail differently: a reader can be fully
 * authorized for a Material whose newest version is still quarantined, and
 * conflating the two would either leak unscanned bytes or hide a Material the
 * reader is entitled to see.
 *
 * Every rule here is server-enforced and none is inferred from role. A
 * contributor is not granted access by being a contributor; they are granted it
 * by holding something -- a live grant, or a live Assignment.
 */
@Injectable()
export class MaterialAccessService {
  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
    private readonly contributionTasks: ContributionTasksService,
  ) {}

  /**
   * Resolves read access, or throws the same not-found every unauthorized
   * caller gets. Access denials are never distinguished from absence: telling
   * a stranger "this Material exists but is not for you" confirms that a named
   * Project holds a document by that title.
   */
  async requireReadAccess(
    actor: AuthenticatedUser,
    materialId: string,
  ): Promise<MaterialReadContext> {
    const material = await this.database.material.findUnique({
      where: { id: materialId },
      select: {
        id: true,
        owner_id: true,
        visibility: true,
        project_id: true,
        contribution_request_id: true,
        deleted_at: true,
      },
    });
    // A deleted Material is gone for everyone, including its owner: deletion
    // revokes access immediately, and the content purge follows behind it.
    if (!material || material.deleted_at) throw this.materialNotFound();

    const isOwner = material.owner_id === actor.id;
    const context: MaterialReadContext = {
      materialId: material.id,
      ownerId: material.owner_id,
      visibility: material.visibility,
      projectId: material.project_id,
      contributionRequestId: material.contribution_request_id,
      isOwner,
    };
    if (isOwner) return context;

    if (actor.status !== 'active') throw this.materialNotFound();
    if (await this.canRead(actor, context)) return context;
    throw this.materialNotFound();
  }

  /**
   * Whether this exact version's bytes may be served.
   *
   * `ready` is the only status that permits it. Not "anything but rejected":
   * `quarantined` covers both a scan still pending and one abandoned after
   * repeated failure, and neither has ever produced a clean verdict.
   */
  async requireDownloadableVersion(
    materialId: string,
    version: number,
  ): Promise<{ storageKey: string; mimeType: string; originalFilename: string }> {
    const row = await this.database.materialVersion.findUnique({
      where: { material_id_version: { material_id: materialId, version } },
      select: {
        storage_key: true,
        mime_type: true,
        original_filename: true,
        scan_status: true,
        purged_at: true,
      },
    });
    if (!row || row.purged_at) throw this.versionNotFound();
    if (row.scan_status !== MaterialScanStatus.ready) {
      throw new NotFoundApplicationError(
        'Material version is not available for download',
        'MATERIAL_VERSION_NOT_DOWNLOADABLE',
      );
    }
    return {
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      originalFilename: row.original_filename,
    };
  }

  private async canRead(
    actor: AuthenticatedUser,
    context: MaterialReadContext,
  ): Promise<boolean> {
    switch (context.visibility) {
      case MaterialVisibility.public:
        return this.canSeeProject(context);
      case MaterialVisibility.restricted_project:
        return this.hasLiveGrantAsAssignee(actor, context);
      case MaterialVisibility.assignment:
        return this.isActiveRequestAssignee(actor, context);
      default:
        // Unreachable while the enum has three members, and deliberately closed
        // rather than open: a visibility class added without a rule here must
        // deny, never fall through to allow.
        return false;
    }
  }

  /** `public` still means "within the Project", not "on the internet". */
  private async canSeeProject(context: MaterialReadContext): Promise<boolean> {
    const assignmentAccess = await this.contributionTasks.getMaterialAssignmentAccess({
      projectId: context.projectId,
      contributionRequestId: context.contributionRequestId,
    });
    if (!assignmentAccess.projectId) return false;
    const project = await this.projects.getMaterialProjectContext(
      assignmentAccess.projectId,
    );
    return project.status === ProjectStatus.published;
  }

  /**
   * A grant alone is not enough. The grantee must still hold a live Assignment
   * in the Project, so access ends when the collaboration does -- otherwise a
   * grant issued once would outlive every reason it was issued for, and nobody
   * would remember to revoke it.
   */
  private async hasLiveGrantAsAssignee(
    actor: AuthenticatedUser,
    context: MaterialReadContext,
  ): Promise<boolean> {
    const grant = await this.database.materialGrant.findFirst({
      where: {
        material_id: context.materialId,
        grantee_id: actor.id,
        revoked_at: null,
      },
      select: { id: true },
    });
    if (!grant) return false;

    const assignmentAccess = await this.contributionTasks.getMaterialAssignmentAccess({
      projectId: context.projectId,
      contributionRequestId: context.contributionRequestId,
    });
    return assignmentAccess.activeProjectAssigneeIds.includes(actor.id);
  }

  /**
   * Owner-only until an Assignment exists, then owner plus assignee. A
   * Project-scoped Material carries no Assignment at all, so this class leaves
   * it owner-only -- which is why creating one that way is refused up front
   * rather than silently accepted.
   */
  private async isActiveRequestAssignee(
    actor: AuthenticatedUser,
    context: MaterialReadContext,
  ): Promise<boolean> {
    if (!context.contributionRequestId) return false;
    const assignmentAccess = await this.contributionTasks.getMaterialAssignmentAccess({
      projectId: context.projectId,
      contributionRequestId: context.contributionRequestId,
    });
    return assignmentAccess.activeRequestAssigneeId === actor.id;
  }

  private materialNotFound(): NotFoundApplicationError {
    return new NotFoundApplicationError(
      'Material was not found',
      'MATERIAL_NOT_FOUND',
    );
  }

  private versionNotFound(): NotFoundApplicationError {
    return new NotFoundApplicationError(
      'Material version was not found',
      'MATERIAL_VERSION_NOT_FOUND',
    );
  }
}
