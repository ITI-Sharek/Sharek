import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { isBroadOrUnknownScope } from './github-account.service';

// SEC-003 remediation deadlines: quarantined raw snapshots and obsolete broad
// tokens must be deleted within seven days of quarantine; the minimal cleanup
// audit is retained for ninety days.
export const SNAPSHOT_PURGE_DEADLINE_DAYS = 7;
export const AUDIT_RETENTION_DAYS = 90;

export interface RemediationStepResult {
  action: string;
  result: 'success' | 'failed';
  affectedCount: number;
}

@Injectable()
export class GitHubRemediationService {
  private readonly logger = new Logger(GitHubRemediationService.name);

  constructor(private readonly database: DatabaseService) {}

  /**
   * Immediate, idempotent remediation: flag legacy broad/unknown-scope
   * accounts for reauthorization, quarantine their evidence snapshots away
   * from AI and public projections, and drop expired audit rows. Does not
   * delete data; run `purge` for the destructive follow-up.
   */
  async remediate(now = new Date()): Promise<RemediationStepResult[]> {
    return [
      await this.runStep('flag_legacy_accounts', now, () =>
        this.flagLegacyAccounts(now),
      ),
      await this.runStep('quarantine_evidence_snapshots', now, () =>
        this.quarantineEvidenceSnapshots(now),
      ),
      await this.runStep('purge_expired_audits', now, () =>
        this.purgeExpiredAudits(now),
      ),
    ];
  }

  /**
   * Destructive follow-up, to run no later than seven days after quarantine:
   * deletes quarantined raw snapshots and the obsolete broad tokens. Fresh
   * evidence is collected only after the user reauthorizes with narrow
   * consent, which clears the account flags.
   */
  async purge(now = new Date()): Promise<RemediationStepResult[]> {
    return [
      await this.runStep('purge_quarantined_snapshots', now, () =>
        this.purgeQuarantinedSnapshots(now),
      ),
      await this.runStep('purge_legacy_tokens', now, () =>
        this.purgeLegacyTokens(now),
      ),
      await this.runStep('purge_expired_audits', now, () =>
        this.purgeExpiredAudits(now),
      ),
    ];
  }

  private async flagLegacyAccounts(now: Date): Promise<number> {
    const candidates = await this.database.gitHubAccount.findMany({
      where: {
        requires_reauthorization: false,
      },
      select: {
        id: true,
        token_scope: true,
      },
    });
    const legacyIds = candidates
      .filter((account) => isBroadOrUnknownScope(account.token_scope))
      .map((account) => account.id);

    if (legacyIds.length === 0) {
      return 0;
    }

    const updated = await this.database.gitHubAccount.updateMany({
      where: {
        id: {
          in: legacyIds,
        },
        requires_reauthorization: false,
      },
      data: {
        requires_reauthorization: true,
        reauthorization_required_at: now,
      },
    });

    return updated.count;
  }

  private async quarantineEvidenceSnapshots(now: Date): Promise<number> {
    const flaggedAccounts = await this.database.gitHubAccount.findMany({
      where: {
        requires_reauthorization: true,
      },
      select: {
        user_id: true,
      },
    });
    const userIds = flaggedAccounts.map((account) => account.user_id);

    if (userIds.length === 0) {
      return 0;
    }

    const updated = await this.database.skillProfileGeneration.updateMany({
      where: {
        user_id: {
          in: userIds,
        },
        evidence_quarantined_at: null,
        NOT: {
          evidence_snapshot: {
            equals: Prisma.DbNull,
          },
        },
      },
      data: {
        evidence_quarantined_at: now,
      },
    });

    return updated.count;
  }

  private async purgeQuarantinedSnapshots(now: Date): Promise<number> {
    const updated = await this.database.skillProfileGeneration.updateMany({
      where: {
        evidence_quarantined_at: {
          not: null,
        },
        evidence_purged_at: null,
      },
      data: {
        evidence_snapshot: Prisma.DbNull,
        evidence_purged_at: now,
      },
    });

    return updated.count;
  }

  private async purgeLegacyTokens(now: Date): Promise<number> {
    const updated = await this.database.gitHubAccount.updateMany({
      where: {
        requires_reauthorization: true,
        legacy_token_purged_at: null,
      },
      data: {
        access_token: '',
        refresh_token: null,
        token_expires_at: null,
        legacy_token_purged_at: now,
      },
    });

    return updated.count;
  }

  private async purgeExpiredAudits(now: Date): Promise<number> {
    const cutoff = new Date(
      now.getTime() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const deleted = await this.database.gitHubRemediationAudit.deleteMany({
      where: {
        created_at: {
          lt: cutoff,
        },
      },
    });

    return deleted.count;
  }

  private async runStep(
    action: string,
    startedAt: Date,
    step: () => Promise<number>,
  ): Promise<RemediationStepResult> {
    let result: RemediationStepResult['result'] = 'success';
    let affectedCount = 0;

    try {
      affectedCount = await step();
    } catch {
      // Never log or persist error details here: failures can wrap responses
      // that reference private repositories or credentials.
      result = 'failed';
    }

    await this.database.gitHubRemediationAudit.create({
      data: {
        action,
        result,
        affected_count: affectedCount,
        started_at: startedAt,
        completed_at: new Date(),
      },
    });
    this.logger.log(
      `remediation step=${action} result=${result} affected=${affectedCount}`,
    );

    return { action, result, affectedCount };
  }
}
