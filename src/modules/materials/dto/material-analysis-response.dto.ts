export type MaterialAnalysisSetStatusDto =
  | 'DRAFT'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED';

export type MaterialAnalysisRunStatusDto =
  | 'REQUESTED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED';

export interface MaterialAnalysisSelectionDto {
  materialId: string;
  version: number;
  originalFilename: string;
  mimeType: string;
  contentHash: string;
}

export interface MaterialAnalysisSetDto {
  id: string;
  projectId: string;
  ownerId: string;
  purpose: 'PROJECT_MATERIAL_DRAFTING';
  status: MaterialAnalysisSetStatusDto;
  materialVersions: MaterialAnalysisSelectionDto[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MaterialDraftSuggestionDto {
  id: string;
  type: 'PROJECT_UPDATE' | 'CONTRIBUTION_REQUEST';
  targetField: string | null;
  payload: unknown;
  rationale: string;
  sourceVersions: Array<{ materialId: string; version: number }>;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  reviewedAt: Date | null;
  sourceRemovedAt: Date | null;
  adoptedEntityType: string | null;
  adoptedEntityId: string | null;
  createdAt: Date;
}

export interface MaterialAnalysisRunDto {
  id: string;
  analysisSetId: string;
  contractVersion: 'material-draft-v1';
  status: MaterialAnalysisRunStatusDto;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  schemaVersion: string | null;
  serviceVersion: string | null;
  documentCount: number | null;
  extractedCharacters: number | null;
  errorCode: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  suggestions: MaterialDraftSuggestionDto[];
}

export interface MaterialAnalysisConstraintsDto {
  maxDocuments: number;
  maxExtractedCharacters: number;
  supportedMimeTypes: string[];
}
