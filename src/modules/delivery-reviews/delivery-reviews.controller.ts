import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import {
  ReviewDeliveryDto,
  SubmitDeliveryDto,
} from './dto/delivery-input.dto';
import { DeliveryReviewsService } from './delivery-reviews.service';

@UseGuards(AccessTokenGuard)
@Controller()
export class DeliveryReviewsController {
  constructor(private readonly deliveryReviews: DeliveryReviewsService) {}

  @Post('applications/:applicationId/deliveries')
  submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Body() body: SubmitDeliveryDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.deliveryReviews.submit({
      actor,
      applicationId,
      pullRequestUrl: body.pullRequestUrl,
      contributorNotes: body.contributorNotes,
      idempotencyKey,
    });
  }

  @Get('deliveries/:deliveryId')
  getForActor(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('deliveryId', new ParseUUIDPipe({ version: '4' }))
    deliveryId: string,
  ) {
    return this.deliveryReviews.getForActor(actor, deliveryId);
  }

  @Get('owner/deliveries')
  listReviewQueue(@CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryReviews.listReviewQueue(actor);
  }

  @Get('me/deliveries')
  listContributorLifecycle(@CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryReviews.listContributorLifecycle(actor);
  }

  @Get('owner/delivery-lifecycle')
  listOwnerLifecycle(@CurrentUser() actor: AuthenticatedUser) {
    return this.deliveryReviews.listOwnerLifecycle(actor);
  }

  @Patch('deliveries/:deliveryId')
  @HttpCode(200)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('deliveryId', new ParseUUIDPipe({ version: '4' }))
    deliveryId: string,
    @Body() body: SubmitDeliveryDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.deliveryReviews.update({
      actor,
      deliveryId,
      pullRequestUrl: body.pullRequestUrl,
      contributorNotes: body.contributorNotes,
      idempotencyKey,
    });
  }

  @Post('deliveries/:deliveryId/reviews')
  review(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('deliveryId', new ParseUUIDPipe({ version: '4' }))
    deliveryId: string,
    @Body() body: ReviewDeliveryDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.deliveryReviews.review({
      actor,
      deliveryId,
      outcome: body.outcome,
      rating: body.rating,
      feedback: body.feedback,
      idempotencyKey,
    });
  }
}
