import { MaterialVisibility, Prisma } from '@prisma/client';

import {
  MaterialDto,
  MaterialScanStatusDto,
  MaterialVersionDto,
  MaterialVisibilityDto,
} from '../dto/material-response.dto';

/** Exported so the service and the mapper cannot drift on the shape. */
export const MATERIAL_INCLUDE = {
  versions: { orderBy: { version: 'desc' } },
} satisfies Prisma.MaterialInclude;

export type MaterialWithVersions = Prisma.MaterialGetPayload<{
  include: typeof MATERIAL_INCLUDE;
}>;

export function toMaterialDto(material: MaterialWithVersions): MaterialDto {
  return {
    id: material.id,
    projectId: material.project_id,
    contributionRequestId: material.contribution_request_id,
    ownerId: material.owner_id,
    title: material.title,
    visibility: material.visibility.toUpperCase() as MaterialVisibilityDto,
    currentVersion: material.current_version,
    versions: material.versions.map(toMaterialVersionDto),
    // Present so the owner's listing can say "deleted -- removing content"
    // rather than having the row silently vanish, which leaves them unsure
    // whether the deletion worked. Every read path still refuses a deleted
    // Material; this only describes one the caller was already shown.
    deletedAt: material.deleted_at,
    createdAt: material.created_at,
    updatedAt: material.updated_at,
  };
}

/**
 * Identity fields, matching the select used for proposers and for published
 * Contribution Request attribution, so a contributor is described the same way
 * wherever they are surfaced. A bare UUID in a grant list tells an owner
 * nothing about who they just gave a document to.
 */
export const MATERIAL_PARTY_IDENTITY_SELECT = {
  select: { id: true, username: true, first_name: true, last_name: true },
} as const;

export type MaterialPartyIdentity = {
  id: string;
  username: string | null;
  first_name: string;
  last_name: string;
};

export function toPartyName(party: MaterialPartyIdentity): string {
  return `${party.first_name} ${party.last_name}`.trim();
}

function toMaterialVersionDto(
  version: MaterialWithVersions['versions'][number],
): MaterialVersionDto {
  return {
    version: version.version,
    scanStatus: version.scan_status.toUpperCase() as MaterialScanStatusDto,
    scanErrorCode: version.scan_error_code,
    byteSize: version.byte_size,
    mimeType: version.mime_type,
    originalFilename: version.original_filename,
    contentHash: version.content_hash,
    uploadedAt: version.created_at,
    scannedAt: version.scanned_at,
    purgedAt: version.purged_at,
  };
}

export function toMaterialVisibility(
  input: MaterialVisibilityDto,
): MaterialVisibility {
  return input.toLowerCase() as MaterialVisibility;
}
