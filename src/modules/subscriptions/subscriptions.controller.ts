import { Controller, Get, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../shared/auth/guards/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { SubscriptionsService } from './subscriptions.service';

@Controller('me')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('owner', 'contributor')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('subscription')
  getCurrentPlan(@CurrentUser() actor: AuthenticatedUser) {
    return this.subscriptions.getPlanStatus(actor);
  }
}
