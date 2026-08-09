import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MaterialAnalysisRunStatus, MaterialAnalysisSetStatus } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';

export const MATERIAL_ANALYSIS_STALE_ERROR_CODE = 'MATERIAL_ANALYSIS_STALE';

@Injectable()
export class MaterialAnalysisReaperService {
  private readonly logger = new Logger(MaterialAnalysisReaperService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async reapStale(now: Date): Promise<number> {
    const cutoff = new Date(
      now.getTime() -
        this.config.get<number>('MATERIAL_ANALYSIS_STALE_AFTER_MS', 600_000),
    );
    const candidates = await this.database.materialAnalysisRun.findMany({
      where: {
        status: { in: [MaterialAnalysisRunStatus.requested, MaterialAnalysisRunStatus.running] },
        updated_at: { lte: cutoff },
      },
      select: { id: true, analysis_set_id: true },
      take: 100,
    });
    let reaped = 0;
    for (const candidate of candidates) {
      const result = await this.database.$transaction(async (transaction) => {
        const claimed = await transaction.materialAnalysisRun.updateMany({
          where: {
            id: candidate.id,
            status: { in: [MaterialAnalysisRunStatus.requested, MaterialAnalysisRunStatus.running] },
          },
          data: {
            status: MaterialAnalysisRunStatus.failed,
            error_code: MATERIAL_ANALYSIS_STALE_ERROR_CODE,
            completed_at: now,
          },
        });
        if (claimed.count !== 1) return false;
        await transaction.materialAnalysisSet.updateMany({
          where: {
            id: candidate.analysis_set_id,
            status: MaterialAnalysisSetStatus.running,
          },
          data: { status: MaterialAnalysisSetStatus.failed },
        });
        return true;
      });
      if (result) reaped += 1;
    }
    if (reaped > 0) this.logger.warn(`Material analysis sweep failed ${reaped} stale Run(s)`);
    return reaped;
  }
}
