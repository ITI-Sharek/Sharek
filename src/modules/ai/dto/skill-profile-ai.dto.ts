export interface SkillProfileInput {
  contributorId: string;
  githubLogin: string;
  generationId: string;
  role: 'contributor' | 'owner';
  selectedRepositories: RepositoryEvidenceCapsule[];
  requestedAt: string;
}

export interface FrameworkDetectionEvidence {
  frameworksDetected: Record<string, string[]>;
  dependencyFilesIdentified: Array<{
    filename: string;
    parserUsed: string | null;
  }>;
  frameworksCount: number;
  status: 'success' | 'no_dependency_files' | 'parse_error' | 'unavailable';
}

export interface GeneratedSkillCandidate {
  name: string;
  proficiency: 'beginner' | 'intermediate' | 'advanced';
  confidence: number;
  evidenceIds: string[];
  evidenceSummary?: string | null;
  limitations?: string[] | null;
}

export interface RepositoryEvidenceCapsule {
  evidenceId: string;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  defaultBranch: string;
  owner: string;
  description: string | null;
  topics: string[];
  primaryLanguage: string | null;
  languages: Record<string, number>;
  technologies: string[];
  statistics: Record<string, unknown>;
  readmeExcerpt: string | null;
  contributionActivity: Record<string, unknown>;
  commitSignals: Record<string, unknown>;
  frameworkDetection?: FrameworkDetectionEvidence;
  authorship: {
    githubLogin: string;
    repositoryOwned: boolean;
    recentCommitCount: number;
    totalCommits: number;
    additions: number;
    deletions: number;
    contributionDetected: boolean;
    matchedRecentCommitShas: string[];
  };
  evidenceFailures: string[];
}

export interface FraudSignal {
  code: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  repositoryFullName?: string;
}

export interface SkillProfileResult {
  skills: GeneratedSkillCandidate[];
  fraudSignals: FraudSignal[];
  evidenceQuality: 'strong' | 'medium' | 'weak';
  recommendation: 'pending_review' | 'needs_more_evidence';
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  serviceVersion: string;
}
