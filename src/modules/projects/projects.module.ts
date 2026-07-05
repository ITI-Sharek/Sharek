import { Module } from '@nestjs/common';

import { GithubModule } from '../github/github.module';
import { ProjectImportService } from './application/use-cases/project-import.service';
import { ProjectsController } from './presentation/http/controllers/projects.controller';

@Module({
  imports: [GithubModule],
  controllers: [ProjectsController],
  providers: [ProjectImportService],
})
export class ProjectsModule {}
