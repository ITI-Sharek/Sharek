export interface SkillProfileGenerationRepositorySelectionDto {
  repositoryId: string;
  fullName: string;
}

export interface SkillProfileGenerationProgressDto {
  selectedRepositoryCount: number;
  snapshottedRepositoryCount: number;
}

export interface SkillProfileGenerationSkillDto {
  id: string;
  name: string;
  proficiency: 'beginner' | 'intermediate' | 'advanced';
  confidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'disputed' | 'superseded';
  evidenceSummary: string | null;
}

export interface SkillProfileGenerationDto {
  generationId: string;
  status:
    | 'queued'
    | 'collecting_evidence'
    | 'analyzing'
    | 'pending_review'
    | 'needs_more_evidence'
    | 'failed';
  progress: SkillProfileGenerationProgressDto;
  failureReason: string | null;
  installationLinkId: string | null;
  providerInstallationId: string | null;
  consentVersion: string | null;
  consentedAt: Date | null;
  authorizationVerifiedAt: Date | null;
  retryOfGenerationId: string | null;
  selectedRepositories: SkillProfileGenerationRepositorySelectionDto[];
  skills: SkillProfileGenerationSkillDto[];
  fraudSignals: unknown[];
  evidenceQuality: string | null;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  schemaVersion: string | null;
  serviceVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}
