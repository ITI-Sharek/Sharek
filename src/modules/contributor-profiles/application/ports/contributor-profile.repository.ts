import { ContributorProfile, User } from '@prisma/client';

export type ContributorProfileWithUser = ContributorProfile & {
  user: User;
};

export abstract class ContributorProfileRepository {
  abstract findByUserId(userId: string): Promise<ContributorProfileWithUser | null>;
  abstract findByUsername(username: string): Promise<ContributorProfileWithUser | null>;
  abstract createForUser(userId: string): Promise<ContributorProfileWithUser>;
}
