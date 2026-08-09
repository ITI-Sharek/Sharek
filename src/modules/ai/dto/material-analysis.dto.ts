export interface MaterialAnalysisVersionInput {
  materialId: string;
  version: number;
  filename: string;
  mimeType: string;
  contentBase64: string;
}

export interface MaterialAnalysisInput {
  analysisRunId: string;
  analysisSetId: string;
  projectId: string;
  purpose: 'PROJECT_MATERIAL_DRAFTING';
  materials: MaterialAnalysisVersionInput[];
  maxExtractedCharacters: number;
  contractVersion: 'material-draft-v1';
}

export type MaterialAnalysisSourceVersion = {
  materialId: string;
  version: number;
};

export type MaterialProjectSuggestion = {
  targetField:
    | 'title'
    | 'description'
    | 'technologies'
    | 'category'
    | 'difficulty';
  value: string | string[];
  rationale: string;
  sourceVersions: MaterialAnalysisSourceVersion[];
};

export type MaterialContributionRequestSuggestion = {
  title: string;
  description: string;
  requirements: Array<{ kind: 'required' | 'preferred'; text: string }>;
  technologyTags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  rationale: string;
  sourceVersions: MaterialAnalysisSourceVersion[];
};

export type MaterialAnalysisResult = {
  status: 'COMPLETED';
  projectSuggestions: MaterialProjectSuggestion[];
  contributionRequestSuggestions: MaterialContributionRequestSuggestion[];
  metadata: {
    provider: string;
    model: string;
    promptVersion: string;
    schemaVersion: string;
    serviceVersion: string;
    latencyMs: number;
    documentCount: number;
    extractedCharacters: number;
  };
  chunks: Array<{
    chunkId: string;
    materialId: string;
    version: number;
    text: string;
    characterStart: number | null;
    characterEnd: number | null;
    embedding: number[];
  }>;
};
