import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../shared/auth/guards/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { DiscoverProjectsQuery } from './dto/discover-projects.query';
import { ImportProjectDto } from './dto/import-project.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('contributor', 'owner', 'admin')
  @Get('discover')
  discoverProjects(@Query() query: DiscoverProjectsQuery) {
    return this.projectsService.discoverPublishedProjects(query);
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Get('me')
  getMyProjects(@CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.getMyProjects(user.id);
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post('import/github')
  importFromGitHub(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ImportProjectDto,
  ) {
    return this.projectsService.importFromGitHub(user.id, body);
  }
}
