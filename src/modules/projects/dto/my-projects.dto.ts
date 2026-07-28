export interface OwnerProjectDto {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  revision: number;
  openRequestsCount: number;
  pendingApplicationsCount: number;
  lastActivityLabel: string;
}

export interface OwnerProjectQuotaDto {
  used: number;
  monthlyLimit: number;
}

export interface MyProjectsResponseDto {
  projects: OwnerProjectDto[];
  quota: OwnerProjectQuotaDto;
  pageInfo: {
    nextCursor: string | null;
    hasNextPage: boolean;
  };
}
