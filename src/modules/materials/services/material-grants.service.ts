import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  MaterialAuditAction,
  MaterialVisibility,
  Prisma,
} from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import {
  BadRequestApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';
import { ContributionTasksService } from '../../contribution-tasks/services/contribution-tasks.service';
import { MaterialDto, MaterialGrantDto } from '../dto/material-response.dto';
import {
  MATERIAL_INCLUDE,
  MATERIAL_PARTY_IDENTITY_SELECT,
  toMaterialDto,
  toPartyName,
} from '../mappers/material.mapper';

const UUID4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Grants and visibility changes: the owner-side controls over who may read a
 * Material.
 *
 * Grants are revoked, never deleted. A deleted grant would erase the fact that
 * someone once had access, which is the single thing an audit of a leak needs
 * to establish.
 */
@Injectable()
export class MaterialGrantsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly contributionTasks: ContributionTasksService,
  ) {}

  /**
   * Grants a contributor read access to a `restricted_project` Material.
   *
   * The grantee must already hold a live Assignment in the Project. Granting to
   * someone with no stake would create access that no later event revokes,
   * since the access checks end when an Assignment does -- a grant to a
   * non-assignee would simply never work, and failing now says so.
   */
  async grant(input: {
    actor: AuthenticatedUser;
    materialId: string;
    granteeId: string;
    idempotencyKey: string;
  }): Promise<MaterialDto> {
    const material = await this.requireOwnedMaterial(
      input.actor,
      input.materialId,
    );
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);

    if (material.visibility !== MaterialVisibility.restricted_project) {
      throw new ConflictApplicationError(
        'Only a restricted Project Material uses explicit grants',
        'MATERIAL_GRANT_NOT_APPLICABLE',
      );
    }
    if (input.granteeId === input.actor.id) {
      throw new BadRequestApplicationError(
        'The owner already has access and cannot be granted it',
        'MATERIAL_GRANT_SELF',
      );
    }

    const access = await this.contributionTasks.getMaterialAssignmentAccess({
      projectId: material.project_id,
      contributionRequestId: material.contribution_request_id,
    });
    if (!access.activeProjectAssigneeIds.includes(input.granteeId)) {
      throw new ConflictApplicationError(
        'A grant requires a contributor with a live Assignment in this Project',
        'MATERIAL_GRANT_NOT_ASSIGNEE',
      );
    }

    try {
      await this.database.$transaction(async (transaction) => {
        // Claim-first: an existing live grant is the conflict, and re-granting
        // must not quietly mint a second row that a single revoke would miss.
        const existing = await transaction.materialGrant.findFirst({
          where: {
            material_id: material.id,
            grantee_id: input.granteeId,
            revoked_at: null,
          },
          select: { id: true },
        });
        if (existing) {
          throw new ConflictApplicationError(
            'This contributor already has a live grant on the Material',
            'MATERIAL_GRANT_ALREADY_LIVE',
          );
        }
        await transaction.materialGrant.create({
          data: {
            id: randomUUID(),
            material_id: material.id,
            grantee_id: input.granteeId,
            granted_by: input.actor.id,
          },
        });
        await transaction.materialAudit.create({
          data: {
            material_id: material.id,
            actor_id: input.actor.id,
            action: MaterialAuditAction.grant_added,
            idempotency_key: idempotencyKey,
            command_fingerprint: this.fingerprint({
              action: MaterialAuditAction.grant_added,
              materialId: material.id,
              granteeId: input.granteeId,
            }),
            metadata: { payloadVersion: 1, granteeId: input.granteeId },
          },
        });
      });
    } catch (error) {
      throw this.mapIdempotencyConflict(error);
    }

    return this.present(material.id);
  }

  /**
   * Revokes a live grant. Takes effect immediately, including for download
   * tokens already issued -- redemption re-checks access rather than trusting
   * the token, so there is no window where a revoked reader can still pull
   * bytes with a link they obtained a moment earlier.
   */
  async revoke(input: {
    actor: AuthenticatedUser;
    materialId: string;
    granteeId: string;
    idempotencyKey: string;
  }): Promise<MaterialDto> {
    const material = await this.requireOwnedMaterial(
      input.actor,
      input.materialId,
    );
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);

    try {
      await this.database.$transaction(async (transaction) => {
        const revoked = await transaction.materialGrant.updateMany({
          where: {
            material_id: material.id,
            grantee_id: input.granteeId,
            revoked_at: null,
          },
          data: { revoked_at: new Date(), revoked_by: input.actor.id },
        });
        // Conditional on being live, so a repeated revoke cannot overwrite the
        // original revocation timestamp and lose when access actually ended.
        if (revoked.count === 0) {
          throw new NotFoundApplicationError(
            'No live grant to revoke for this contributor',
            'MATERIAL_GRANT_NOT_FOUND',
          );
        }
        await transaction.materialAudit.create({
          data: {
            material_id: material.id,
            actor_id: input.actor.id,
            action: MaterialAuditAction.grant_revoked,
            idempotency_key: idempotencyKey,
            command_fingerprint: this.fingerprint({
              action: MaterialAuditAction.grant_revoked,
              materialId: material.id,
              granteeId: input.granteeId,
            }),
            metadata: { payloadVersion: 1, granteeId: input.granteeId },
          },
        });
      });
    } catch (error) {
      throw this.mapIdempotencyConflict(error);
    }

    return this.present(material.id);
  }

  /**
   * Changes the visibility class.
   *
   * Existing grants are left alone rather than revoked. Moving to `public` and
   * back is a plausible mistake, and silently destroying the grant list on the
   * way through would make it unrecoverable; grants are simply not consulted
   * while another class is in force.
   */
  async changeVisibility(input: {
    actor: AuthenticatedUser;
    materialId: string;
    visibility: MaterialVisibility;
    idempotencyKey: string;
  }): Promise<MaterialDto> {
    const material = await this.requireOwnedMaterial(
      input.actor,
      input.materialId,
    );
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    assertVisibilityFitsScope(input.visibility, material.contribution_request_id);

    if (material.visibility === input.visibility) {
      throw new ConflictApplicationError(
        'The Material already has this visibility',
        'MATERIAL_VISIBILITY_UNCHANGED',
      );
    }

    try {
      await this.database.$transaction(async (transaction) => {
        const changed = await transaction.material.updateMany({
          where: { id: material.id, visibility: material.visibility },
          data: { visibility: input.visibility },
        });
        if (changed.count !== 1) {
          throw new ConflictApplicationError(
            'The Material visibility changed while this command was running',
            'MATERIAL_VISIBILITY_CONFLICT',
          );
        }
        await transaction.materialAudit.create({
          data: {
            material_id: material.id,
            actor_id: input.actor.id,
            action: MaterialAuditAction.visibility_changed,
            idempotency_key: idempotencyKey,
            command_fingerprint: this.fingerprint({
              action: MaterialAuditAction.visibility_changed,
              materialId: material.id,
              visibility: input.visibility,
            }),
            metadata: {
              payloadVersion: 1,
              from: material.visibility,
              to: input.visibility,
            },
          },
        });
      });
    } catch (error) {
      throw this.mapIdempotencyConflict(error);
    }

    return this.present(material.id);
  }

  async listGrants(
    actor: AuthenticatedUser,
    materialId: string,
  ): Promise<MaterialGrantDto[]> {
    const material = await this.requireOwnedMaterial(actor, materialId);
    const grants = await this.database.materialGrant.findMany({
      where: { material_id: material.id },
      orderBy: [{ granted_at: 'desc' }, { id: 'asc' }],
      select: {
        grantee_id: true,
        granted_by: true,
        granted_at: true,
        revoked_at: true,
        revoked_by: true,
        grantee: MATERIAL_PARTY_IDENTITY_SELECT,
      },
    });
    return grants.map((grant) => ({
      granteeId: grant.grantee_id,
      // A bare UUID tells the owner nothing about who they just handed a
      // document to, which is the one thing this list exists to say.
      granteeName: toPartyName(grant.grantee),
      granteeUsername: grant.grantee.username,
      grantedBy: grant.granted_by,
      grantedAt: grant.granted_at,
      revokedAt: grant.revoked_at,
      revokedBy: grant.revoked_by,
    }));
  }

  private async requireOwnedMaterial(
    actor: AuthenticatedUser,
    materialId: string,
  ) {
    if (actor.role !== 'owner' || actor.status !== 'active') {
      throw new ForbiddenApplicationError(
        'Only an active Project owner manages Materials',
        'MATERIAL_NOT_AUTHORIZED',
      );
    }
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
    if (!material || material.deleted_at || material.owner_id !== actor.id) {
      throw new NotFoundApplicationError(
        'Material was not found',
        'MATERIAL_NOT_FOUND',
      );
    }
    return material;
  }

  private async present(materialId: string): Promise<MaterialDto> {
    return toMaterialDto(
      await this.database.material.findUniqueOrThrow({
        where: { id: materialId },
        include: MATERIAL_INCLUDE,
      }),
    );
  }

  private mapIdempotencyConflict(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      String(error.meta?.target ?? '').includes('idempotency_key')
    ) {
      return new ConflictApplicationError(
        'This Material command was already recorded with a different payload',
        'MATERIAL_IDEMPOTENCY_CONFLICT',
      );
    }
    return error;
  }

  private normalizeIdempotencyKey(value: string): string {
    const key = (value ?? '').trim();
    if (!UUID4_PATTERN.test(key)) {
      throw new BadRequestApplicationError(
        'A UUID v4 idempotency key is required',
        'MATERIAL_IDEMPOTENCY_KEY_REQUIRED',
      );
    }
    return key;
  }

  private fingerprint(payload: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}

/**
 * `assignment` visibility on a Project-scoped Material can never open it to
 * anyone but the owner, because a Project has no Assignment -- only a
 * Contribution Request does. Refusing it is kinder than accepting a setting
 * whose name promises access it will never grant.
 */
export function assertVisibilityFitsScope(
  visibility: MaterialVisibility,
  contributionRequestId: string | null,
): void {
  if (
    visibility === MaterialVisibility.assignment &&
    !contributionRequestId
  ) {
    throw new BadRequestApplicationError(
      'Assignment visibility applies only to a Contribution Request Material',
      'MATERIAL_VISIBILITY_SCOPE_MISMATCH',
    );
  }
}
