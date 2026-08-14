import { Module } from '@nestjs/common';

import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { AiModule } from '../ai/ai.module';
import { ProjectsModule } from '../projects/projects.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { MaterialScanQueue } from './jobs/material-scan.queue';
import { MaterialScanWorker } from './jobs/material-scan.worker';
import { MaterialsController } from './materials.controller';
import { MaterialAnalysisController } from './material-analysis.controller';
import { MaterialsService } from './materials.service';
import { MalwareScanner } from './scanning/malware-scanner';
import { StubMalwareScanner } from './scanning/stub-malware-scanner';
import { MaterialAccessService } from './services/material-access.service';
import { MaterialDownloadTokenService } from './services/material-download-token.service';
import { MaterialGrantsService } from './services/material-grants.service';
import { MaterialListingService } from './services/material-listing.service';
import { MaterialPurgeService } from './services/material-purge.service';
import { MaterialScanProcessorService } from './services/material-scan-processor.service';
import { MaterialScanReaperService } from './services/material-scan-reaper.service';
import { MaterialAnalysisReaperService } from './services/material-analysis-reaper.service';
import { MaterialStorage } from './storage/material-storage';
import { LocalMaterialStorage } from './storage/local-material-storage';
import { MaterialAnalysisService } from './services/material-analysis.service';
import { MaterialAnalysisWorker } from './jobs/material-analysis.worker';
import { MaterialAnalysisQueue } from './jobs/material-analysis.queue';

/**
 * Safe Materials.
 *
 * Upload is storage consent, not AI-processing consent: nothing in this module
 * extracts, embeds, retrieves, or calls a provider.
 *
 * Project and Contribution Request facts are read through the exported services
 * of their owning modules; this module never queries their tables directly.
 */
@Module({
  imports: [
    ProjectsModule,
    ContributionTasksModule,
    AiModule,
    SubscriptionsModule,
  ],
  controllers: [MaterialsController, MaterialAnalysisController],
  providers: [
    MaterialsService,
    MaterialAnalysisService,
    MaterialAccessService,
    MaterialGrantsService,
    MaterialListingService,
    MaterialDownloadTokenService,
    MaterialPurgeService,
    MaterialScanQueue,
    MaterialScanProcessorService,
    MaterialScanReaperService,
    MaterialScanWorker,
    MaterialAnalysisQueue,
    MaterialAnalysisReaperService,
    MaterialAnalysisWorker,
    { provide: MaterialStorage, useClass: LocalMaterialStorage },
    // Both ports are bound here and nowhere else, so replacing local disk with
    // S3 or the stub scanner with ClamAV is a one-line change in this file.
    { provide: MalwareScanner, useClass: StubMalwareScanner },
  ],
  exports: [MaterialStorage, MaterialAnalysisService],
})
export class MaterialsModule {}
