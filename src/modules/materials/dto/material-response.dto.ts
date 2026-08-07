export type MaterialVisibilityDto = 'PUBLIC' | 'RESTRICTED_PROJECT' | 'ASSIGNMENT';
export type MaterialScanStatusDto =
  | 'QUARANTINED'
  | 'SCANNING'
  | 'READY'
  | 'REJECTED';

export interface MaterialVersionDto {
  version: number;
  /**
   * Never `READY` on upload. The frontend keys its download affordance on this,
   * so it is server-authoritative rather than inferred from age or presence.
   */
  scanStatus: MaterialScanStatusDto;
  /**
   * Why the version is not `READY`, when there is a reason worth showing.
   *
   * `QUARANTINED` alone cannot distinguish "waiting to be scanned" from "we
   * retried to the limit and never got a verdict", and those need different
   * things said to the owner: one resolves itself, the other never will.
   */
  scanErrorCode: string | null;
  byteSize: number;
  mimeType: string;
  originalFilename: string;
  contentHash: string;
  uploadedAt: Date;
  scannedAt: Date | null;
  purgedAt: Date | null;
}

export interface MaterialGrantDto {
  granteeId: string;
  granteeName: string;
  /** Null until the contributor has chosen a username. */
  granteeUsername: string | null;
  grantedBy: string;
  grantedAt: Date;
  /** Retained, not deleted: who once had access is the point of the record. */
  revokedAt: Date | null;
  revokedBy: string | null;
}

export interface MaterialUploadConstraintsDto {
  maxBytes: number;
  allowedMimeTypes: string[];
}

export interface MaterialDownloadTokenDto {
  token: string;
  version: number;
  expiresAt: Date;
}

export interface MaterialDeletionDto {
  materialId: string;
  /**
   * How many versions had their content destroyed before the response. The
   * rest are left to the purge sweep, so this can legitimately be lower than
   * the version count without the deletion having failed.
   */
  purgedVersions: number;
}

export interface MaterialDto {
  id: string;
  projectId: string | null;
  contributionRequestId: string | null;
  ownerId: string;
  title: string;
  visibility: MaterialVisibilityDto;
  currentVersion: number;
  versions: MaterialVersionDto[];
  /**
   * Set only where a deleted Material is deliberately still shown -- the
   * owner's own listing, so "deleted, removing content" can be said out loud.
   * Every other read path refuses a deleted Material outright.
   */
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
