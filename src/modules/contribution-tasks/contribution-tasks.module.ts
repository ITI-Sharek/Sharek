import { forwardRef, Module } from '@nestjs/common';

import { ProjectsModule } from '../projects/projects.module';
import { ContributionTasksController } from './contribution-tasks.controller';
import { ContributionTasksService } from './contribution-tasks.service';

@Module({
  imports: [forwardRef(() => ProjectsModule)],
  controllers: [ContributionTasksController],
  providers: [ContributionTasksService],
  exports: [ContributionTasksService],
})
export class ContributionTasksModule {}
