import { Module } from '@nestjs/common';

import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { ProjectsModule } from '../projects/projects.module';
import { MaterialScanQueue } from './jobs/material-scan.queue';
import { MaterialScanWorker } from './jobs/material-scan.worker';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { MalwareScanner } from './scanning/malware-scanner';
import { StubMalwareScanner } from './scanning/stub-malware-scanner';
import { MaterialAccessService } from './services/material-access.service';
import { MaterialDownloadTokenService } from './services/material-download-token.service';
import { MaterialGrantsService } from './services/material-grants.service';
import { MaterialPurgeService } from './services/material-purge.service';
import { MaterialScanProcessorService } from './services/material-scan-processor.service';
import { MaterialScanReaperService } from './services/material-scan-reaper.service';
import { MaterialStorage } from './storage/material-storage';
import { LocalMaterialStorage } from './storage/local-material-storage';

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
  imports: [ProjectsModule, ContributionTasksModule],
  controllers: [MaterialsController],
  providers: [
    MaterialsService,
    MaterialAccessService,
    MaterialGrantsService,
    MaterialDownloadTokenService,
    MaterialPurgeService,
    MaterialScanQueue,
    MaterialScanProcessorService,
    MaterialScanReaperService,
    MaterialScanWorker,
    { provide: MaterialStorage, useClass: LocalMaterialStorage },
    // Both ports are bound here and nowhere else, so replacing local disk with
    // S3 or the stub scanner with ClamAV is a one-line change in this file.
    { provide: MalwareScanner, useClass: StubMalwareScanner },
  ],
  exports: [MaterialStorage],
})
export class MaterialsModule {}
