import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { ProjectImportService } from '../../../application/use-cases/project-import.service';
import { ImportGitHubProjectRequest } from '../requests/import-github-project.request';
import { AccessTokenGuard } from '../../../../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../../../../shared/auth/guards/roles.guard';
import { Roles } from '../../../../../shared/auth/roles.decorator';
import { CurrentUser } from '../../../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-request';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectImportService: ProjectImportService) {}

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post('import/github')
  importFromGitHub(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ImportGitHubProjectRequest,
  ) {
    return this.projectImportService.importFromGitHub(
      user.id,
      body.repoUrl ?? body.fullName ?? '',
    );
  }
}
