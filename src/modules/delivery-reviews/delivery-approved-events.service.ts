import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { DatabaseService } from '../../shared/database/database.service';
import { DeliveryApprovedFactDto } from './dto/delivery-output.dto';

@Injectable()
export class DeliveryApprovedEventsService {
  constructor(private readonly database: DatabaseService) {}

  async append(
    input: {
      eventId: string;
      deliveryId: string;
      deliveryReviewId: string;
      contributorId: string;
      contributionRequestId: string;
      rating: number;
      occurredAt: Date;
    },
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.deliveryApprovedEvent.create({
      data: {
        id: input.eventId,
        delivery_id: input.deliveryId,
        delivery_review_id: input.deliveryReviewId,
        contributor_id: input.contributorId,
        contribution_request_id: input.contributionRequestId,
        rating: input.rating,
        occurred_at: input.occurredAt,
      },
    });
  }

  async listPending(limit = 100): Promise<DeliveryApprovedFactDto[]> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const events = await this.database.deliveryApprovedEvent.findMany({
      where: { published_at: null },
      orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
      take: boundedLimit,
    });
    return events.map((event) => ({
      eventId: event.id,
      deliveryId: event.delivery_id,
      deliveryReviewId: event.delivery_review_id,
      contributorId: event.contributor_id,
      contributionRequestId: event.contribution_request_id,
      rating: event.rating,
      occurredAt: event.occurred_at,
    }));
  }

  async markPublished(
    eventId: string,
    publishedAt = new Date(),
  ): Promise<boolean> {
    const updated = await this.database.deliveryApprovedEvent.updateMany({
      where: { id: eventId, published_at: null },
      data: { published_at: publishedAt },
    });
    return updated.count === 1;
  }
}
