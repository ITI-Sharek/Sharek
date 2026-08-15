import { Module } from '@nestjs/common';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PaymobClient } from './integrations/paymob.client';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDER } from './payments.types';

@Module({
  imports: [SubscriptionsModule],
  controllers: [PaymentsController],
  providers: [
    PaymobClient,
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      useExisting: PaymobClient,
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
