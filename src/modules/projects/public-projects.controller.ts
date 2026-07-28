import { Controller, Get, Param, Query } from '@nestjs/common';

import { ProjectPageQueryDto } from './dto/project-publication.dto';
import { PublicProjectsService } from './services/public-projects.service';

@Controller('public/projects')
export class PublicProjectsController {
  constructor(private readonly publicProjects: PublicProjectsService) {}

  @Get()
  list(@Query() query: ProjectPageQueryDto) {
    return this.publicProjects.list(query);
  }

  @Get(':projectSlug')
  getBySlug(@Param('projectSlug') projectSlug: string) {
    return this.publicProjects.getBySlug(projectSlug);
  }
}
