import { Controller, Get, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../shared/auth/guards/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { RecommendedTasksResponseDto } from './dto/recommended-tasks.dto';
import { RecommendedTasksService } from './recommended-tasks.service';

@Controller('contributors/me')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('contributor')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendedTasksService) {}

  /**
   * The caller's own matched projects. A free contributor is not refused here:
   * the plan gate lives in the service, and they receive an empty list with a
   * reason rather than a 403.
   */
  @Get('recommended-tasks')
  list(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<RecommendedTasksResponseDto> {
    return this.recommendations.listForContributor(actor);
  }
}
