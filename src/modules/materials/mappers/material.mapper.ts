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
    createdAt: material.created_at,
    updatedAt: material.updated_at,
  };
}

function toMaterialVersionDto(
  version: MaterialWithVersions['versions'][number],
): MaterialVersionDto {
  return {
    version: version.version,
    scanStatus: version.scan_status.toUpperCase() as MaterialScanStatusDto,
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
