import { Controller, Delete, Get, Param, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';

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

  @Get(':projectSlug/hero-image')
  async getHeroImage(
    @Param('projectSlug') projectSlug: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const heroImage = await this.publicProjects.getHeroImage(projectSlug);
    response.set({
      'Content-Type': heroImage.mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Last-Modified': heroImage.updatedAt.toUTCString(),
    });
    return new StreamableFile(heroImage.data);
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
