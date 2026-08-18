import { Controller, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';

import { PaymentWebhookService } from './payment-webhook.service';

@Controller('payments/paymob')
export class PaymobWebhookController {
  constructor(private readonly webhooks: PaymentWebhookService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  receive(@Req() request: Request, @Query('hmac') hmac: string) {
    return this.webhooks.process({
      payload: request.body,
      hmac,
      processedAt: new Date(),
    });
  }
}
