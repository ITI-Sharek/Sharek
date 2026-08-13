import { Controller, Get } from '@nestjs/common';

import { EntitlementsService } from './entitlements.service';

@Controller('subscriptions')
export class SubscriptionCatalogController {
  constructor(private readonly subscriptions: EntitlementsService) {}

  @Get('plans')
  getPlans() {
    return this.subscriptions.getPlanCatalog();
  }
}
