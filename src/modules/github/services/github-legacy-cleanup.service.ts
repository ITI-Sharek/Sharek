import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { ApplicationError } from '../../../shared/errors/application.error';

@Injectable()
export class GitHubLegacyCleanupService {
  constructor(private readonly database: DatabaseService) {}

  async cleanupRawProfiles(now = new Date()): Promise<{ cleanedAccounts: number }> {
    const cutover = await this.database.gitHubEvidenceCutover.findUnique({
      where: { id: 'github-evidence' },
    });
    if (!cutover?.legacy_evidence_cleanup_due_at) {
      throw new ApplicationError(
        'GitHub evidence cutover has not been established',
        'GITHUB_EVIDENCE_CUTOVER_REQUIRED',
        409,
      );
    }
    if (now < cutover.legacy_evidence_cleanup_due_at) {
      throw new ApplicationError(
        'Legacy GitHub evidence cleanup is not due',
        'GITHUB_EVIDENCE_CLEANUP_NOT_DUE',
        409,
      );
    }
    const result = await this.database.gitHubAccount.updateMany({
      where: { raw_profile_data: { not: Prisma.DbNull } },
      data: { raw_profile_data: Prisma.DbNull },
    });
    return { cleanedAccounts: result.count };
  }
}
