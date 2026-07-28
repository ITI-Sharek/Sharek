import {
  ProjectCategory,
  ProjectDifficulty,
  ProjectStatus,
} from '@prisma/client';

export interface ProjectPreviewResponseDto {
  previewFingerprint: string;
  source: {
    provider: 'github';
    repositoryId: string;
    fullName: string;
    repositoryUrl: string;
    visibility: 'public' | 'private';
    ownerType: 'user' | 'organization' | 'unknown';
    defaultBranch: string;
    sourceVersion: string | null;
    sourceUpdatedAt: Date | null;
    fetchedAt: Date;
  };
  imported: {
    repositoryName: string;
    description: string | null;
    languages: Record<string, number>;
    topics: string[];
    technologies: string[];
    statistics: Record<string, unknown>;
    readmeContent: string | null;
  };
  ownerDefaults: {
    title: string;
    description: string | null;
    tags: string[];
    technologies: string[];
  };
  evidence: {
    completeness: 'complete' | 'partial';
    fieldStatus: Record<string, 'updated' | 'unavailable'>;
    unavailableAreas: string[];
    authorizationStatus: 'public_read' | 'authorized';
    selectionStatus: 'not_required' | 'selected';
  };
}

export interface ProjectOwnerViewDto {
  id: string;
  slug: string;
  status: ProjectStatus;
  revision: number;
  project: {
    title: string;
    description: string | null;
    tags: string[];
    technologies: string[];
    category: ProjectCategory | null;
    difficulty: ProjectDifficulty | null;
    manualOverrides: string[];
  };
  source: {
    attribution: {
      provider: 'github';
      repositoryId: string | null;
      fullName: string;
      repositoryUrl: string;
      visibility: 'public' | 'private';
      ownerType: 'user' | 'organization' | 'unknown';
      defaultBranch: string | null;
      sourceVersion: string | null;
      sourceUpdatedAt: Date | null;
      fetchedAt: Date | null;
    };
    latestSnapshot: {
      description: string | null;
      languages: unknown;
      topics: string[];
      technologies: string[];
      statistics: unknown;
      readmeContent: string | null;
      completeness: 'complete' | 'partial';
      fieldStatus: Record<string, string>;
      uncertainty: string[];
    } | null;
    status: {
      syncStatus: 'fresh' | 'stale';
      authorizationStatus:
        | 'public_read'
        | 'authorized'
        | 'authorization_required';
      selectionStatus: 'not_required' | 'selected' | 'unselected';
      lastAttemptAt: Date | null;
      lastRequiredReadAt: Date | null;
      freshUntil: Date | null;
      isStale: boolean;
      invalidationReason: null;
      lastSuccessfulRefreshAt: Date | null;
      unavailableAreas: string[];
      recoveryAction: string | null;
    };
  };
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectTransitionResponseDto {
  projectId: string;
  status: Extract<ProjectStatus, 'published' | 'archived'>;
  revision: number;
  publishedAt?: Date;
  archivedAt?: Date;
  transitionId: string;
}
