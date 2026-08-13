import { Module } from '@nestjs/common';

import { PaymobClient } from './integrations/paymob.client';
import { PAYMENT_PROVIDER } from './payments.types';

@Module({
  providers: [
    PaymobClient,
    {
      provide: PAYMENT_PROVIDER,
      useExisting: PaymobClient,
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
