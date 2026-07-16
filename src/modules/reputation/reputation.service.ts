import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../../shared/database/database.service';

export interface ReputationSummaryDto {
  rating: number | null;
  reviewsCount: number;
}

@Injectable()
export class ReputationService {
  constructor(private readonly database: DatabaseService) {}

  async getSummaryForUser(
    userId: string,
  ): Promise<ReputationSummaryDto> {
    const record = await this.database.reputationRecord.findUnique({
      where: {
        user_id: userId,
      },
      select: {
        overall_rating: true,
        total_ratings_received: true,
      },
    });

    return {
      rating: record?.overall_rating ?? null,
      reviewsCount: record?.total_ratings_received ?? 0,
    };
  }
}
