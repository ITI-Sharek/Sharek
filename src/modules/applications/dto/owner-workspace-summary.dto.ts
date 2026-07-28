export interface ApplicationRequestScopeDto {
  projectId: string;
  contributionRequestIds: string[];
}

export interface PendingApplicationProjectSummaryDto {
  projectId: string;
  pendingApplicationCount: number;
}

export interface PendingApplicationsOwnerWorkspaceSummaryDto {
  projects: PendingApplicationProjectSummaryDto[];
}
