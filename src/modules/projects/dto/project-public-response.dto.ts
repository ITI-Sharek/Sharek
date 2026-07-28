import { ProjectCategory, ProjectDifficulty } from '@prisma/client';

export interface PublicProjectDto {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  tags: string[];
  technologies: string[];
  category: ProjectCategory | null;
  difficulty: ProjectDifficulty | null;
  publishedAt: Date;
  source:
    | {
        provider: 'github';
        attributionStatus: 'public';
        fullName: string;
        repositoryUrl: string;
        fetchedAt: Date | null;
      }
    | { provider: 'github'; attributionStatus: 'withheld' };
}

export interface PublicProjectPageDto {
  items: PublicProjectDto[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}
