import { Controller, Get, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../shared/auth/guards/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { ContributorDashboardService } from './contributor-dashboard.service';

@Controller('contributors/me')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('contributor')
export class ContributorDashboardController {
  constructor(private readonly dashboard: ContributorDashboardService) {}

  @Get('dashboard')
  get(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboard.getForContributor(actor);
  }
}
