import { Injectable } from '@nestjs/common';

import { ContributorProfileReputationSummaryDto } from '../../../contributor-profiles/application/dto/contributor-profile.dto';
import { DatabaseService } from '../../../../shared/database/database.service';

@Injectable()
export class ReputationSummaryReaderService {
  constructor(private readonly database: DatabaseService) {}

  async getSummaryForUser(
    userId: string,
  ): Promise<ContributorProfileReputationSummaryDto> {
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
