import { Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { ProjectPageQueryDto } from './dto/project-publication.dto';
import { PublicProjectsService } from './services/public-projects.service';

@Controller('public/projects')
export class PublicProjectsController {
  constructor(private readonly publicProjects: PublicProjectsService) {}

  @Get()
  list(@Query() query: ProjectPageQueryDto) {
    return this.publicProjects.list(query);
  }

  @Get(':projectSlug/applicants')
  listApplicants(@Param('projectSlug') projectSlug: string) {
    return this.publicProjects.listApplicantsByProjectSlug(projectSlug);
  }

  @UseGuards(AccessTokenGuard)
  @Get(':projectSlug/save')
  getSavedState(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectSlug') projectSlug: string,
  ) {
    return this.publicProjects.getSavedState(actor, projectSlug);
  }

  @UseGuards(AccessTokenGuard)
  @Post(':projectSlug/save')
  save(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectSlug') projectSlug: string,
  ) {
    return this.publicProjects.save(actor, projectSlug);
  }

  @UseGuards(AccessTokenGuard)
  @Delete(':projectSlug/save')
  unsave(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectSlug') projectSlug: string,
  ) {
    return this.publicProjects.unsave(actor, projectSlug);
  }

  @Get(':projectSlug')
  getBySlug(@Param('projectSlug') projectSlug: string) {
    return this.publicProjects.getBySlug(projectSlug);
  }
}
