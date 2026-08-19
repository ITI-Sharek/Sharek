import { BadgeType } from '@prisma/client';

export interface UserBadgeDto {
  id: string;
  badgeType: BadgeType;
  awardedAt: Date;
  sourceDeliveryId: string | null;
}
