import { Injectable } from '@nestjs/common';
import { DeliveryReviewOutcome, DeliveryStatus } from '@prisma/client';

import { DatabaseService } from '../../shared/database/database.service';
import { ContributionRequestReputationFactsService } from '../contribution-tasks/services/contribution-request-reputation-facts.service';
import type { ApprovedDeliveryReputationFact } from '../reputation/reputation.service';

@Injectable()
export class DeliveryReputationFactsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly contributionRequestFacts: ContributionRequestReputationFactsService,
  ) {}

  async listApprovedForContributor(
    contributorId: string,
  ): Promise<ApprovedDeliveryReputationFact[]> {
    const deliveries = await this.database.delivery.findMany({
      where: {
        contributor_id: contributorId,
        status: DeliveryStatus.approved,
      },
      select: {
        id: true,
        contribution_request_id: true,
        deliveryReviews: {
          where: { outcome: DeliveryReviewOutcome.approved },
          select: { rating: true },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          take: 1,
        },
      },
      orderBy: [{ reviewed_at: 'asc' }, { id: 'asc' }],
    });
    const requestTags = await this.contributionRequestFacts.listTechnologyTags(
      deliveries.map((delivery) => delivery.contribution_request_id),
    );
    const technologyTagsByRequest = new Map(
      requestTags.map((request) => [
        request.contributionRequestId,
        request.technologyTags,
      ]),
    );
    return deliveries.map((delivery) => {
      const rating = delivery.deliveryReviews[0]?.rating;
      if (rating === null || rating === undefined) {
        throw new Error(
          `Approved Delivery ${delivery.id} is missing its approval rating`,
        );
      }
      return {
        rating,
        technologyTags:
          technologyTagsByRequest.get(delivery.contribution_request_id) ?? [],
      };
    });
  }
}
