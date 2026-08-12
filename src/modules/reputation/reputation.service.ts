import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { DatabaseService } from '../../shared/database/database.service';

export interface VerifiedReputationSkillDto {
  name: string;
  verifiedContributionCount: number;
}

export interface ReputationSummaryDto {
  rating: number | null;
  reviewsCount: number;
  completedContributions: number;
  totalAssignedTasks: number;
  successRate: number;
  topVerifiedSkills: VerifiedReputationSkillDto[];
}

export interface ApprovedDeliveryReputationFact {
  rating: number;
  technologyTags: string[];
}

export interface ReplaceReputationProjectionInput {
  contributorId: string;
  totalAssignedTasks: number;
  approvedDeliveries: ApprovedDeliveryReputationFact[];
  lastUpdatedAt: Date;
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
        total_contributions: true,
        successful_contributions: true,
        success_rate: true,
        top_verified_skills: true,
        total_ratings_received: true,
      },
    });

    if (!record) return this.emptySummary();
    return this.presentRecord(record);
  }

  async listSummariesForUsers(
    userIds: string[],
  ): Promise<Map<string, ReputationSummaryDto>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const records = await this.database.reputationRecord.findMany({
      where: { user_id: { in: ids } },
      select: {
        user_id: true,
        overall_rating: true,
        total_contributions: true,
        successful_contributions: true,
        success_rate: true,
        top_verified_skills: true,
        total_ratings_received: true,
      },
    });
    const byUser = new Map(
      records.map((record) => [record.user_id, this.presentRecord(record)]),
    );
    for (const id of ids) {
      if (!byUser.has(id)) byUser.set(id, this.emptySummary());
    }
    return byUser;
  }

  async replaceProjection(
    input: ReplaceReputationProjectionInput,
  ): Promise<ReputationSummaryDto> {
    const completedContributions = input.approvedDeliveries.length;
    const ratings = input.approvedDeliveries.map((delivery) => delivery.rating);
    const overallRating = ratings.length
      ? this.round(
          ratings.reduce((total, rating) => total + rating, 0) / ratings.length,
        )
      : null;
    const successRate = input.totalAssignedTasks
      ? this.round(
          (completedContributions / input.totalAssignedTasks) * 100,
        )
      : 0;
    const topVerifiedSkills = this.rankVerifiedSkills(
      input.approvedDeliveries,
    );
    const projection = {
      overall_rating: overallRating,
      total_contributions: input.totalAssignedTasks,
      successful_contributions: completedContributions,
      success_rate: successRate,
      top_verified_skills:
        topVerifiedSkills as unknown as Prisma.InputJsonValue,
      total_ratings_received: ratings.length,
      last_updated_at: input.lastUpdatedAt,
    };
    const record = await this.database.reputationRecord.upsert({
      where: { user_id: input.contributorId },
      create: { user_id: input.contributorId, ...projection },
      update: projection,
      select: {
        overall_rating: true,
        total_contributions: true,
        successful_contributions: true,
        success_rate: true,
        top_verified_skills: true,
        total_ratings_received: true,
      },
    });
    return this.presentRecord(record);
  }

  private rankVerifiedSkills(
    deliveries: ApprovedDeliveryReputationFact[],
  ): VerifiedReputationSkillDto[] {
    const skills = new Map<
      string,
      { name: string; verifiedContributionCount: number }
    >();
    for (const delivery of deliveries) {
      const countedForDelivery = new Set<string>();
      for (const rawTag of delivery.technologyTags) {
        const name = rawTag.trim();
        if (!name) continue;
        const key = name.toLocaleLowerCase('en-US');
        if (countedForDelivery.has(key)) continue;
        countedForDelivery.add(key);
        const current = skills.get(key);
        skills.set(key, {
          name: current?.name ?? name,
          verifiedContributionCount:
            (current?.verifiedContributionCount ?? 0) + 1,
        });
      }
    }
    return [...skills.values()]
      .sort(
        (left, right) =>
          right.verifiedContributionCount - left.verifiedContributionCount ||
          left.name.localeCompare(right.name, 'en'),
      )
      .slice(0, 5);
  }

  private presentRecord(record: {
    overall_rating: number | null;
    total_contributions: number;
    successful_contributions: number;
    success_rate: number;
    top_verified_skills: Prisma.JsonValue;
    total_ratings_received: number;
  }): ReputationSummaryDto {
    return {
      rating: record.overall_rating,
      reviewsCount: record.total_ratings_received,
      completedContributions: record.successful_contributions,
      totalAssignedTasks: record.total_contributions,
      successRate: record.success_rate,
      topVerifiedSkills: this.readVerifiedSkills(record.top_verified_skills),
    };
  }

  private readVerifiedSkills(value: Prisma.JsonValue): VerifiedReputationSkillDto[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        typeof item.name !== 'string' ||
        typeof item.verifiedContributionCount !== 'number'
      ) {
        return [];
      }
      return [
        {
          name: item.name,
          verifiedContributionCount: item.verifiedContributionCount,
        },
      ];
    });
  }

  private emptySummary(): ReputationSummaryDto {
    return {
      rating: null,
      reviewsCount: 0,
      completedContributions: 0,
      totalAssignedTasks: 0,
      successRate: 0,
      topVerifiedSkills: [],
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
