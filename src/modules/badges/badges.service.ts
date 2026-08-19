import { Injectable } from '@nestjs/common';
import { BadgeType, DeliveryStatus, Prisma } from '@prisma/client';

import { DatabaseService } from '../../shared/database/database.service';
import { UserBadgeDto } from './dto/badge.dto';

@Injectable()
export class BadgesService {
  constructor(private readonly database: DatabaseService) {}

  async listForUser(userId: string): Promise<UserBadgeDto[]> {
    const badges = await this.database.userBadge.findMany({
      where: { user_id: userId },
      orderBy: { awarded_at: 'asc' },
    });
    return badges.map((badge) => this.present(badge));
  }

  /**
   * Eligibility is "no other approved Delivery exists for this contributor"
   * — checked and awarded inside the caller's approval transaction so the
   * unique (user_id, badge_type) constraint is the only race guard needed;
   * a retried approval command simply hits the constraint and returns the
   * existing row instead of creating a duplicate.
   */
  async awardFirstContributionIfEligible(
    contributorId: string,
    deliveryId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<UserBadgeDto | null> {
    const priorApprovedDeliveries = await transaction.delivery.count({
      where: {
        contributor_id: contributorId,
        status: DeliveryStatus.approved,
        id: { not: deliveryId },
      },
    });
    if (priorApprovedDeliveries > 0) return null;

    try {
      const badge = await transaction.userBadge.create({
        data: {
          user_id: contributorId,
          badge_type: BadgeType.first_contribution,
          source_delivery_id: deliveryId,
        },
      });
      return this.present(badge);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const existing = await transaction.userBadge.findUnique({
          where: {
            user_id_badge_type: {
              user_id: contributorId,
              badge_type: BadgeType.first_contribution,
            },
          },
        });
        return existing ? this.present(existing) : null;
      }
      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private present(badge: {
    id: string;
    badge_type: BadgeType;
    awarded_at: Date;
    source_delivery_id: string | null;
  }): UserBadgeDto {
    return {
      id: badge.id,
      badgeType: badge.badge_type,
      awardedAt: badge.awarded_at,
      sourceDeliveryId: badge.source_delivery_id,
    };
  }
}
