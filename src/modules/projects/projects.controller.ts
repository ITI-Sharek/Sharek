import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../shared/auth/guards/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { DiscoverProjectsQuery } from './dto/discover-projects.query';
import {
  ConfirmProjectTransitionDto,
  CreateProjectDraftDto,
  ProjectPageQueryDto,
  PreviewProjectSourceDto,
  RefreshProjectSourceDto,
  UpdateProjectDto,
} from './dto/project-publication.dto';
import { ProjectsService } from './projects.service';
import { ProjectPublicationService } from './services/project-publication.service';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly publicationService: ProjectPublicationService,
  ) {}

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('contributor', 'owner', 'admin')
  @Get('discover')
  discoverProjects(@Query() query: DiscoverProjectsQuery) {
    return this.projectsService.discoverPublishedProjects(query);
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('owner', 'contributor')
  @Get('me')
  getMyProjects(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ProjectPageQueryDto,
  ) {
    return this.projectsService.getMyProjectsForActor(user, query);
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('owner', 'contributor')
  @Post('github/preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PreviewProjectSourceDto,
  ) {
    return this.publicationService.preview(user, body.repositoryReference);
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('owner', 'contributor')
  @Post()
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: CreateProjectDraftDto,
  ) {
    return this.publicationService.createDraft(user, body, idempotencyKey ?? '');
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('owner', 'contributor')
  @Get('me/:projectId')
  getOwnerProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.publicationService.getOwnerProject(user, projectId);
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('owner', 'contributor')
  @Patch('me/:projectId')
  updateOwnerProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: UpdateProjectDto,
  ) {
    return this.publicationService.updateProject(
      user,
      projectId,
      body,
      idempotencyKey ?? '',
    );
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('owner', 'contributor')
  @Post('me/:projectId/source/refresh')
  @HttpCode(HttpStatus.OK)
  refreshSource(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: RefreshProjectSourceDto,
  ) {
    return this.publicationService.refreshSource(
      user,
      projectId,
      body,
      idempotencyKey ?? '',
    );
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('owner', 'contributor')
  @Post('me/:projectId/publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: ConfirmProjectTransitionDto,
  ) {
    return this.publicationService.publish(
      user,
      projectId,
      body,
      idempotencyKey ?? '',
    );
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('owner', 'contributor')
  @Post('me/:projectId/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: ConfirmProjectTransitionDto,
  ) {
    return this.publicationService.archive(
      user,
      projectId,
      body,
      idempotencyKey ?? '',
    );
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('owner', 'contributor')
  @Post('import/github')
  importFromGitHub() {
    return this.projectsService.rejectRetiredImportRoute();
  }
}
