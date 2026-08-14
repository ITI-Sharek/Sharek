import { Controller, Get, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../shared/auth/guards/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { SubscriptionPlanStatusDto } from './dto/subscription-status.dto';
import { SubscriptionStatusService } from './subscription-status.service';

@Controller('me')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('owner', 'contributor')
export class SubscriptionsController {
  constructor(private readonly status: SubscriptionStatusService) {}

  /**
   * The caller's own plan. The route takes no user parameter, so there is no
   * path through it to another user's subscription.
   */
  @Get('subscription')
  getCurrentPlan(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SubscriptionPlanStatusDto> {
    return this.status.getPlanStatus(actor);
  }
}
