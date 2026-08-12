import { Controller, Get, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { RolesGuard } from '../../shared/auth/guards/roles.guard';
import { ContributorMatchingService } from './matching.service';

@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('contributor')
@Controller('contributors/me')
export class ContributorRecommendationsController {
  constructor(private readonly matching: ContributorMatchingService) {}

  @Get('recommended-tasks')
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.matching.listRecommendedTasks({ actor });
  }
}
