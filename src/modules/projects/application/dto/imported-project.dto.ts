export interface ImportedProjectDto {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  githubRepoUrl: string;
  githubRepoId: string | null;
  languages: unknown;
  tags: unknown;
  technologies: unknown;
  repoStatistics: unknown;
  status: 'draft' | 'published' | 'archived';
  readmeContent: string | null;
  createdAt: Date;
  updatedAt: Date;
}
