export interface ProjectResponseDto {
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
  category: 'web' | 'mobile' | 'ai_ml' | 'devops' | 'tools_utilities' | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  heroImageUrl: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
