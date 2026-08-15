import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../shared/auth/guards/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { CreateSubscriptionCheckoutDto } from './dto/payment-input.dto';
import { PaymentsService } from './payments.service';

@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('owner', 'contributor')
@Controller('me')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('subscription/checkout')
  createCheckout(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: CreateSubscriptionCheckoutDto,
    @Headers('idempotency-key') headerIdempotencyKey?: string,
  ) {
    return this.payments.createCheckout({
      actor,
      planType: body.planType,
      roleContext: body.roleContext,
      idempotencyKey: body.idempotencyKey ?? headerIdempotencyKey ?? '',
    });
  }

  @Get('payments/:paymentId')
  getPaymentStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('paymentId', new ParseUUIDPipe({ version: '4' })) paymentId: string,
  ) {
    return this.payments.getPaymentStatus(actor, paymentId);
  }
}
