import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import { ApplicationError } from '../../../shared/errors/application.error';

@Injectable()
export class SkillProfileLegacyCleanupService {
  constructor(private readonly database: DatabaseService) {}

  async cleanup(now = new Date()) {
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
    if (cutover.legacy_evidence_cleaned_at) {
      return { cleanedGenerations: 0, cleanedSkills: 0, alreadyCompleted: true };
    }

    const generations = await this.database.skillProfileGeneration.findMany({
      where: { consented_at: null },
      select: { id: true },
    });
    const skills = await this.database.skillProfile.findMany({
      where: { generation_id: { in: generations.map((item) => item.id) } },
      select: { id: true, status: true },
    });
    await this.database.$transaction([
      ...generations.map((generation) =>
        this.database.skillProfileGeneration.update({
          where: { id: generation.id },
          data: {
            selected_repositories: [{ attribution: 'legacy-github-evidence-redacted' }],
            evidence_snapshot: {
              version: 'legacy-private-evidence-redacted-v1',
              redactedAt: now.toISOString(),
            },
          },
        }),
      ),
      ...skills.map((skill) =>
        this.database.skillProfile.update({
          where: { id: skill.id },
          data: {
            evidence_summary: null,
            evidence_sources:
              skill.status === 'approved'
                ? ({ attribution: 'reviewed-github-evidence' } as Prisma.InputJsonObject)
                : Prisma.DbNull,
          },
        }),
      ),
      this.database.gitHubEvidenceCutover.update({
        where: { id: 'github-evidence' },
        data: { legacy_evidence_cleaned_at: now },
      }),
    ]);
    return {
      cleanedGenerations: generations.length,
      cleanedSkills: skills.length,
      alreadyCompleted: false,
    };
  }
}
