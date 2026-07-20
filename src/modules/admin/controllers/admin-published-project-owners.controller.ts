import { Controller, Get, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../../shared/auth/guards/roles.guard';
import { Roles } from '../../../shared/auth/roles.decorator';
import { ProjectsService } from '../../projects/projects.service';

@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('admin')
@Controller('admin/published-project-owners')
export class AdminPublishedProjectOwnersController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() admin: AuthenticatedUser) {
    return this.projects.listPublishedProjectOwners(admin);
  }
}
