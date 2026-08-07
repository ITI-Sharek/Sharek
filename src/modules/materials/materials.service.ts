import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MaterialAuditAction,
  MaterialScanStatus,
  MaterialVisibility,
  Prisma,
} from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { DatabaseService } from '../../shared/database/database.service';
import {
  ApplicationError,
  BadRequestApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';
import { ContributionTasksService } from '../contribution-tasks/services/contribution-tasks.service';
import { ProjectsService } from '../projects/projects.service';
import {
  MaterialDto,
  MaterialUploadConstraintsDto,
} from './dto/material-response.dto';
import { MaterialScanQueue } from './jobs/material-scan.queue';
import { MATERIAL_INCLUDE, toMaterialDto } from './mappers/material.mapper';
import { MaterialAccessService } from './services/material-access.service';
import { MaterialDownloadTokenService } from './services/material-download-token.service';
import { assertVisibilityFitsScope } from './services/material-grants.service';
import { MaterialPurgeService } from './services/material-purge.service';
import { MaterialStorage } from './storage/material-storage';
import { LocalMaterialStorage } from './storage/local-material-storage';
import {
  checkMaterialContent,
  parseAllowedMimeTypes,
} from './utils/material-content';

export type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
};

const UUID4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Material commands.
 *
 * Upload is storage consent only: nothing here extracts, embeds, retrieves, or
 * calls a provider. Versions are immutable, so a replacement is an append.
 */
@Injectable()
export class MaterialsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
    private readonly projects: ProjectsService,
    private readonly contributionTasks: ContributionTasksService,
    private readonly storage: MaterialStorage,
    private readonly scanQueue: MaterialScanQueue,
    private readonly access: MaterialAccessService,
    private readonly downloadTokens: MaterialDownloadTokenService,
    private readonly purge: MaterialPurgeService,
  ) {}

  async createForProject(input: {
    actor: AuthenticatedUser;
    projectId: string;
    title: string;
    visibility: MaterialVisibility;
    idempotencyKey: string;
    file: UploadedFile;
  }): Promise<MaterialDto> {
    this.assertActiveOwner(input.actor);
    const project = await this.projects.getMaterialProjectContext(
      input.projectId,
    );
    if (project.ownerId !== input.actor.id) throw this.materialNotFound();
    return this.create({ ...input, scope: { project_id: input.projectId } });
  }

  async createForContributionRequest(input: {
    actor: AuthenticatedUser;
    requestId: string;
    title: string;
    visibility: MaterialVisibility;
    idempotencyKey: string;
    file: UploadedFile;
  }): Promise<MaterialDto> {
    this.assertActiveOwner(input.actor);
    // getOwnedRequest already scopes to the owner and confirms Project access,
    // so a non-owner cannot learn that the Request exists.
    await this.contributionTasks.getOwnedRequest(input.actor, input.requestId);
    return this.create({
      ...input,
      scope: { contribution_request_id: input.requestId },
    });
  }

  /**
   * Appends an immutable version. The previous version is untouched: replacing
   * a Material never rewrites what collaborators may already have read.
   */
  async addVersion(input: {
    actor: AuthenticatedUser;
    materialId: string;
    idempotencyKey: string;
    file: UploadedFile;
  }): Promise<MaterialDto> {
    this.assertActiveOwner(input.actor);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const material = await this.database.material.findUnique({
      where: { id: input.materialId },
      select: { id: true, owner_id: true, deleted_at: true },
    });
    if (!material || material.deleted_at) throw this.materialNotFound();
    if (material.owner_id !== input.actor.id) throw this.materialNotFound();

    const content = this.validateContent(input.file);
    const storageKey = LocalMaterialStorage.buildStorageKey(material.id);
    const stored = await this.storage.put(storageKey, input.file.buffer);

    let appended: { dto: MaterialDto; version: number };
    try {
      appended = await this.database.$transaction(async (transaction) => {
        // Serialise concurrent appends to this Material so two uploads cannot
        // claim the same version number.
        await transaction.$queryRaw(Prisma.sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`material:${material.id}`}, 0)
          )::text AS "lockResult"
        `);
        const current = await transaction.material.findUniqueOrThrow({
          where: { id: material.id },
          select: { current_version: true },
        });
        const version = current.current_version + 1;
        await transaction.materialVersion.create({
          data: {
            id: randomUUID(),
            material_id: material.id,
            version,
            storage_key: storageKey,
            content_hash: stored.contentHash,
            byte_size: stored.byteSize,
            mime_type: content.mimeType,
            original_filename: this.boundedFilename(input.file.originalname),
            uploaded_by: input.actor.id,
          },
        });
        await transaction.material.update({
          where: { id: material.id },
          data: { current_version: version },
        });
        await transaction.materialAudit.create({
          data: {
            material_id: material.id,
            material_version: version,
            actor_id: input.actor.id,
            action: MaterialAuditAction.uploaded,
            to_status: MaterialScanStatus.quarantined,
            idempotency_key: idempotencyKey,
            command_fingerprint: this.fingerprint({
              action: MaterialAuditAction.uploaded,
              materialId: material.id,
              contentHash: stored.contentHash,
            }),
            metadata: { payloadVersion: 1, contentHash: stored.contentHash },
          },
        });
        return { dto: await this.present(transaction, material.id), version };
      });
    } catch (error) {
      // The bytes are already written, so a failed transaction would otherwise
      // leave an object no row references.
      await this.storage.delete(storageKey);
      throw this.mapIdempotencyConflict(error);
    }

    await this.enqueueScan(material.id, appended.version);
    return appended.dto;
  }

  /**
   * The limits the upload form must state before the user picks a file.
   *
   * Read from the same config the validator reads, deliberately: the only
   * other way for a client to learn them is to be rejected, and any number the
   * frontend hardcodes instead is a number that drifts the first time an
   * operator raises the ceiling.
   */
  getUploadConstraints(): MaterialUploadConstraintsDto {
    return {
      maxBytes: this.config.get<number>('MATERIAL_MAX_BYTES', 26_214_400),
      allowedMimeTypes: parseAllowedMimeTypes(
        this.config.get<string>('MATERIAL_ALLOWED_MIME_TYPES', ''),
      ),
    };
  }

  /**
   * Reads a Material as anyone entitled to it, not only its owner. The access
   * service decides; this method only projects what it allowed through.
   */
  async getForReader(
    actor: AuthenticatedUser,
    materialId: string,
  ): Promise<MaterialDto> {
    await this.access.requireReadAccess(actor, materialId);
    return toMaterialDto(
      await this.database.material.findUniqueOrThrow({
        where: { id: materialId },
        include: MATERIAL_INCLUDE,
      }),
    );
  }

  /**
   * Mints a short-lived download link for one version.
   *
   * Both checks run here -- may this reader see the Material, and is this
   * version servable at all -- so a link is never issued for bytes that could
   * not be served. They run again at redemption, because both answers can
   * change in between.
   */
  async issueDownloadToken(input: {
    actor: AuthenticatedUser;
    materialId: string;
    version: number;
  }): Promise<{ token: string; expiresAt: Date; version: number }> {
    await this.access.requireReadAccess(input.actor, input.materialId);
    await this.access.requireDownloadableVersion(
      input.materialId,
      input.version,
    );
    const issued = this.downloadTokens.issue({
      materialId: input.materialId,
      version: input.version,
      subjectId: input.actor.id,
    });
    return { ...issued, version: input.version };
  }

  /**
   * Redeems a download link.
   *
   * The token establishes *what* was asked for and *by whom*; it never
   * establishes that the request is still allowed. Access is resolved again
   * from live grants and live Assignments, which is what makes a revocation
   * take effect against a link already in someone's hands.
   *
   * The bearer must also be the authenticated caller. A link that worked for
   * whoever held it would turn a shared browser URL into a copy of the
   * document, which is the failure the short expiry alone does not prevent.
   */
  async openDownload(
    actor: AuthenticatedUser,
    token: string,
  ): Promise<{
    stream: Readable;
    mimeType: string;
    originalFilename: string;
    version: number;
  }> {
    const claims = this.downloadTokens.verify(token);
    if (claims.subjectId !== actor.id) {
      throw new ForbiddenApplicationError(
        'Material download link was issued to another user',
        'MATERIAL_DOWNLOAD_TOKEN_SUBJECT_MISMATCH',
      );
    }
    await this.access.requireReadAccess(actor, claims.materialId);
    const version = await this.access.requireDownloadableVersion(
      claims.materialId,
      claims.version,
    );
    return {
      stream: await this.storage.getStream(version.storageKey),
      mimeType: version.mimeType,
      originalFilename: version.originalFilename,
      version: claims.version,
    };
  }

  /**
   * Deletes a Material: access ends now, content goes shortly after.
   *
   * The transaction revokes every live grant and stamps deleted_at, so no
   * reader and no already-issued token survives it. Purging bytes is attempted
   * immediately afterwards but is not allowed to fail the command -- storage
   * being briefly unavailable must not leave the caller believing their
   * Material is still readable. The sweep finishes whatever is left.
   */
  async remove(input: {
    actor: AuthenticatedUser;
    materialId: string;
    idempotencyKey: string;
  }): Promise<{ materialId: string; purgedVersions: number }> {
    this.assertActiveOwner(input.actor);
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const material = await this.database.material.findUnique({
      where: { id: input.materialId },
      select: { id: true, owner_id: true, deleted_at: true },
    });
    if (!material || material.deleted_at) throw this.materialNotFound();
    if (material.owner_id !== input.actor.id) throw this.materialNotFound();

    const now = new Date();
    try {
      await this.database.$transaction(async (transaction) => {
        const deleted = await transaction.material.updateMany({
          where: { id: material.id, deleted_at: null },
          data: { deleted_at: now },
        });
        // Conditional, so two concurrent deletes cannot both claim to have
        // been the one that ended access.
        if (deleted.count !== 1) {
          throw new ConflictApplicationError(
            'The Material was already deleted',
            'MATERIAL_ALREADY_DELETED',
          );
        }
        await transaction.materialGrant.updateMany({
          where: { material_id: material.id, revoked_at: null },
          data: { revoked_at: now, revoked_by: input.actor.id },
        });
        await transaction.materialAudit.create({
          data: {
            material_id: material.id,
            actor_id: input.actor.id,
            action: MaterialAuditAction.deleted,
            idempotency_key: idempotencyKey,
            command_fingerprint: this.fingerprint({
              action: MaterialAuditAction.deleted,
              materialId: material.id,
            }),
            metadata: { payloadVersion: 1 },
          },
        });
      });
    } catch (error) {
      throw this.mapIdempotencyConflict(error);
    }

    return {
      materialId: material.id,
      purgedVersions: await this.purge.purgeMaterial(material.id, now),
    };
  }

  private async create(input: {
    actor: AuthenticatedUser;
    title: string;
    visibility: MaterialVisibility;
    idempotencyKey: string;
    file: UploadedFile;
    scope: { project_id: string } | { contribution_request_id: string };
  }): Promise<MaterialDto> {
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    assertVisibilityFitsScope(
      input.visibility,
      'contribution_request_id' in input.scope
        ? input.scope.contribution_request_id
        : null,
    );
    const content = this.validateContent(input.file);
    const materialId = randomUUID();
    const storageKey = LocalMaterialStorage.buildStorageKey(materialId);
    const stored = await this.storage.put(storageKey, input.file.buffer);

    let created: MaterialDto;
    try {
      created = await this.database.$transaction(async (transaction) => {
        await transaction.material.create({
          data: {
            id: materialId,
            ...input.scope,
            owner_id: input.actor.id,
            title: input.title.trim(),
            visibility: input.visibility,
            current_version: 1,
          },
        });
        await transaction.materialVersion.create({
          data: {
            id: randomUUID(),
            material_id: materialId,
            version: 1,
            storage_key: storageKey,
            content_hash: stored.contentHash,
            byte_size: stored.byteSize,
            mime_type: content.mimeType,
            original_filename: this.boundedFilename(input.file.originalname),
            uploaded_by: input.actor.id,
          },
        });
        await transaction.materialAudit.create({
          data: {
            material_id: materialId,
            material_version: 1,
            actor_id: input.actor.id,
            action: MaterialAuditAction.uploaded,
            to_status: MaterialScanStatus.quarantined,
            idempotency_key: idempotencyKey,
            command_fingerprint: this.fingerprint({
              action: MaterialAuditAction.uploaded,
              scope: input.scope,
              contentHash: stored.contentHash,
            }),
            metadata: { payloadVersion: 1, contentHash: stored.contentHash },
          },
        });
        return this.present(transaction, materialId);
      });
    } catch (error) {
      await this.storage.delete(storageKey);
      throw this.mapIdempotencyConflict(error);
    }

    await this.enqueueScan(materialId, 1);
    return created;
  }

  /**
   * Strictly after the transaction commits. Enqueueing inside it lets a worker
   * pick up a job for a version that is not visible yet, and the worker would
   * read that as "already gone" and drop the scan.
   *
   * If this throws, the version is committed as `quarantined` -- which is
   * undownloadable, so nothing unsafe is reachable -- and the reaper re-queues
   * it once the stale window passes. The command still fails, because telling
   * the owner an upload succeeded while its scan was never scheduled would put
   * a file in their list that quietly never becomes usable.
   */
  private async enqueueScan(materialId: string, version: number): Promise<void> {
    await this.scanQueue.enqueueScan({ materialId, version, attemptNumber: 1 });
  }

  private async present(
    transaction: Prisma.TransactionClient,
    materialId: string,
  ): Promise<MaterialDto> {
    const material = await transaction.material.findUniqueOrThrow({
      where: { id: materialId },
      include: MATERIAL_INCLUDE,
    });
    return toMaterialDto(material);
  }

  private validateContent(file: UploadedFile): { mimeType: string } {
    const maxBytes = this.config.get<number>('MATERIAL_MAX_BYTES', 26_214_400);
    if (!file.buffer?.length) {
      throw new BadRequestApplicationError(
        'Material file is required',
        'MATERIAL_FILE_REQUIRED',
      );
    }
    if (file.buffer.byteLength > maxBytes) {
      throw new ApplicationError(
        `Material exceeds the configured size limit of ${maxBytes} bytes`,
        'MATERIAL_TOO_LARGE',
        400,
        { maxBytes },
      );
    }
    const allowed = parseAllowedMimeTypes(
      this.config.get<string>('MATERIAL_ALLOWED_MIME_TYPES', ''),
    );
    const check = checkMaterialContent(file.mimetype, file.buffer, allowed);
    if (!check.ok) {
      // Distinguished on purpose: "we do not accept this format" and "this is
      // not the format you said it was" are different problems for the owner.
      throw check.reason === 'unsupported_type'
        ? new ApplicationError(
            'Material format is not supported',
            'MATERIAL_TYPE_UNSUPPORTED',
            400,
            { allowedMimeTypes: allowed },
          )
        : new BadRequestApplicationError(
            'Material content does not match its declared type',
            'MATERIAL_CONTENT_MISMATCH',
          );
    }
    return { mimeType: check.mimeType };
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

  private boundedFilename(value: string): string {
    const trimmed = (value ?? '').trim();
    return trimmed.length > 255 ? trimmed.slice(0, 255) : trimmed || 'untitled';
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

  private assertActiveOwner(actor: AuthenticatedUser): void {
    if (actor.role !== 'owner' || actor.status !== 'active') {
      throw new ForbiddenApplicationError(
        'Only an active Project owner manages Materials',
        'MATERIAL_NOT_AUTHORIZED',
      );
    }
  }

  private materialNotFound(): NotFoundApplicationError {
    return new NotFoundApplicationError(
      'Material was not found',
      'MATERIAL_NOT_FOUND',
    );
  }
}
