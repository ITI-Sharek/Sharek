import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PaymobClient } from './integrations/paymob.client';
import { PaymentWebhookService } from './payment-webhook.service';
import { PaymobWebhookController } from './paymob-webhook.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDER } from './payments.types';

@Module({
  imports: [IdentityModule, SubscriptionsModule],
  controllers: [PaymentsController, PaymobWebhookController],
  providers: [
    PaymobClient,
    PaymentsService,
    PaymentWebhookService,
    {
      provide: PAYMENT_PROVIDER,
      useExisting: PaymobClient,
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
