import { Injectable } from '@nestjs/common';
import { Prisma, UserActionType } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { ConflictApplicationError } from '../../../shared/errors/application.error';
import { EntitlementsService } from '../../subscriptions/entitlements.service';

export interface DailyApplicationQuota {
  readonly used: number;
  readonly limit: number;
  /** The UTC instant the allowance refills, so the UI can state it exactly. */
  readonly resetsAt: Date;
}

/**
 * The contributor daily Application allowance (DEC-079).
 *
 * The counter is `UsageTracker`, keyed by (user, `application_submitted`, UTC
 * calendar day). Both halves — reading the tally and incrementing it — happen
 * inside the caller's transaction, so a submission that fails for any later
 * reason gives the allowance back by rolling back rather than by anyone
 * remembering to decrement it.
 */
@Injectable()
export class ApplicationDailyQuotaService {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly database: DatabaseService,
  ) {}

  /**
   * Serializes one contributor's concurrent submissions for the rest of the
   * transaction. Without it two submissions at limit − 1 both read the same
   * tally and both pass.
   *
   * `pg_advisory_xact_lock` returns `void`, which Prisma cannot deserialize, so
   * this must go through `$executeRaw` and never `$queryRaw`.
   */
  async lockContributor(
    contributorId: string,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended('application_daily_quota:' || ${contributorId}::text, 0))`,
    );
  }

  /**
   * Consumes one Application from today's allowance, or refuses.
   *
   * Call this only once every earlier check has passed — a duplicate
   * Application or a request that stopped accepting them must not cost the
   * contributor a slot. {@link lockContributor} must already have run in the
   * same transaction.
   */
  async reserve(input: {
    contributorId: string;
    transaction: Prisma.TransactionClient;
    now: Date;
  }): Promise<DailyApplicationQuota> {
    const periodDate = startOfUtcDay(input.now);
    const resetsAt = nextUtcDay(periodDate);
    const { dailyApplicationLimit: limit } =
      await this.entitlements.resolveForContributor(
        input.contributorId,
        input.transaction,
        input.now,
      );

    const key = {
      user_id_action_type_period_date: {
        user_id: input.contributorId,
        action_type: UserActionType.application_submitted,
        period_date: periodDate,
      },
    };
    // Upserting with an empty update reads today's tally and creates it at zero
    // in one statement, so a contributor's first Application of the day does not
    // need a separate insert path.
    const tally = await input.transaction.usageTracker.upsert({
      where: key,
      create: {
        user_id: input.contributorId,
        action_type: UserActionType.application_submitted,
        period_date: periodDate,
        count: 0,
      },
      update: {},
      select: { count: true },
    });

    if (tally.count >= limit) {
      throw new ConflictApplicationError(
        'The daily Application limit was reached',
        'APPLICATION_DAILY_LIMIT_REACHED',
        { used: tally.count, limit, resetsAt: resetsAt.toISOString() },
      );
    }

    const reserved = await input.transaction.usageTracker.update({
      where: key,
      data: { count: { increment: 1 } },
      select: { count: true },
    });

    return { used: reserved.count, limit, resetsAt };
  }

  /** Today's tally without consuming anything, for the subscription status endpoint. */
  async read(input: {
    contributorId: string;
    now: Date;
    database?: Pick<Prisma.TransactionClient, 'usageTracker'>;
  }): Promise<{ used: number; periodStart: Date; periodEnd: Date }> {
    const database = input.database ?? this.database;
    const periodDate = startOfUtcDay(input.now);
    const tally = await database.usageTracker.findUnique({
      where: {
        user_id_action_type_period_date: {
          user_id: input.contributorId,
          action_type: UserActionType.application_submitted,
          period_date: periodDate,
        },
      },
      select: { count: true },
    });
    return {
      used: tally?.count ?? 0,
      periodStart: periodDate,
      periodEnd: nextUtcDay(periodDate),
    };
  }
}

/**
 * The allowance resets on the UTC calendar-day boundary, not the contributor's
 * local one. One global boundary is the only version of the rule that stays
 * true when a contributor travels or changes their device clock.
 */
function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function nextUtcDay(periodDate: Date): Date {
  return new Date(periodDate.getTime() + 24 * 60 * 60 * 1000);
}
