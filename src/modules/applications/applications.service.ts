import { Injectable } from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';

import { DatabaseService } from '../../shared/database/database.service';
import {
  ApplicationRequestScopeDto,
  PendingApplicationsOwnerWorkspaceSummaryDto,
} from './dto/owner-workspace-summary.dto';

@Injectable()
export class ApplicationsService {
  constructor(private readonly database: DatabaseService) {}

  async summarizePendingByContributionRequests(input: {
    requestScopes: ApplicationRequestScopeDto[];
  }): Promise<PendingApplicationsOwnerWorkspaceSummaryDto> {
    const contributionRequestIds = [
      ...new Set(
        input.requestScopes.flatMap(
          (scope) => scope.contributionRequestIds,
        ),
      ),
    ];
    if (contributionRequestIds.length === 0) {
      return this.emptySummary(input.requestScopes);
    }

    const counts = await this.database.application.groupBy({
      by: ['contribution_request_id'],
      where: {
        contribution_request_id: { in: contributionRequestIds },
        status: ApplicationStatus.pending_owner_review,
      },
      _count: { _all: true },
    });
    const countsByRequestId = new Map(
      counts.map((count) => [
        count.contribution_request_id,
        count._count._all,
      ]),
    );

    return {
      projects: input.requestScopes.map((scope) => ({
        projectId: scope.projectId,
        pendingApplicationCount: scope.contributionRequestIds.reduce(
          (total, requestId) => total + (countsByRequestId.get(requestId) ?? 0),
          0,
        ),
      })),
    };
  }

  private emptySummary(
    requestScopes: ApplicationRequestScopeDto[],
  ): PendingApplicationsOwnerWorkspaceSummaryDto {
    return {
      projects: requestScopes.map((scope) => ({
        projectId: scope.projectId,
        pendingApplicationCount: 0,
      })),
    };
  }
}
