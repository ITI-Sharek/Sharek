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

export interface MaterialDto {
  id: string;
  projectId: string | null;
  contributionRequestId: string | null;
  ownerId: string;
  title: string;
  visibility: MaterialVisibilityDto;
  currentVersion: number;
  versions: MaterialVersionDto[];
  createdAt: Date;
  updatedAt: Date;
}
