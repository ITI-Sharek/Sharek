import { Injectable } from '@nestjs/common';

import { ApplicationReputationFactsService } from '../applications/services/application-reputation-facts.service';
import { ReputationService } from '../reputation/reputation.service';
import { DeliveryApprovedEventsService } from './delivery-approved-events.service';
import { DeliveryReputationFactsService } from './delivery-reputation-facts.service';

export interface ReputationProjectionBatchResult {
  eventsRead: number;
  contributorsProjected: number;
  eventsAcknowledged: number;
}

@Injectable()
export class DeliveryReputationProjectionService {
  constructor(
    private readonly approvedEvents: DeliveryApprovedEventsService,
    private readonly applicationFacts: ApplicationReputationFactsService,
    private readonly deliveryFacts: DeliveryReputationFactsService,
    private readonly reputation: ReputationService,
  ) {}

  async processPendingApprovals(
    limit = 100,
    processedAt = new Date(),
  ): Promise<ReputationProjectionBatchResult> {
    const events = await this.approvedEvents.listPending(limit);
    const eventsByContributor = new Map<string, typeof events>();
    for (const event of events) {
      const current = eventsByContributor.get(event.contributorId) ?? [];
      current.push(event);
      eventsByContributor.set(event.contributorId, current);
    }

    let eventsAcknowledged = 0;
    for (const [contributorId, contributorEvents] of eventsByContributor) {
      await this.projectContributor(contributorId, processedAt);
      for (const event of contributorEvents) {
        if (await this.approvedEvents.markPublished(event.eventId, processedAt)) {
          eventsAcknowledged += 1;
        }
      }
    }
    return {
      eventsRead: events.length,
      contributorsProjected: eventsByContributor.size,
      eventsAcknowledged,
    };
  }

  async reconcileAssignedContributors(
    limit = 500,
    processedAt = new Date(),
  ): Promise<number> {
    const contributorIds =
      await this.applicationFacts.listAssignedContributorIds(limit);
    for (const contributorId of contributorIds) {
      await this.projectContributor(contributorId, processedAt);
    }
    return contributorIds.length;
  }

  private async projectContributor(
    contributorId: string,
    lastUpdatedAt: Date,
  ): Promise<void> {
    const [totalAssignedTasks, approvedDeliveries] = await Promise.all([
      this.applicationFacts.countAssignedTasks(contributorId),
      this.deliveryFacts.listApprovedForContributor(contributorId),
    ]);
    await this.reputation.replaceProjection({
      contributorId,
      totalAssignedTasks,
      approvedDeliveries,
      lastUpdatedAt,
    });
  }
}
