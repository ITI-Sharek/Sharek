import { Module } from '@nestjs/common';

import { ContributionTasksModule } from '../contribution-tasks/contribution-tasks.module';
import { ProjectsModule } from '../projects/projects.module';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
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
    { provide: MaterialStorage, useClass: LocalMaterialStorage },
  ],
  exports: [MaterialStorage],
})
export class MaterialsModule {}
