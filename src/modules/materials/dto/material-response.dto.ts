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
