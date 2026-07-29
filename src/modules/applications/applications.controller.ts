import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { ApplicationsService } from './applications.service';
import {
  DeclineApplicationDto,
  SubmitApplicationDto,
} from './dto/application-input.dto';

@UseGuards(AccessTokenGuard)
@Controller()
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post('tasks/:requestId/applications')
  submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe({ version: '4' }))
    contributionRequestId: string,
    @Body() body: SubmitApplicationDto,
  ) {
    return this.applicationsService.submit({
      actor,
      contributionRequestId,
      contributionApproach: body.contributionApproach,
      proposedDeliveryDurationDays: body.proposedDeliveryDurationDays,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Get('tasks/:requestId/applications')
  listForOwner(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
  ) {
    return this.applicationsService.listForOwner(actor, requestId);
  }

  @Get('applications/:applicationId')
  getForActor(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
  ) {
    return this.applicationsService.getForActor(actor, applicationId);
  }

  @Post('applications/:applicationId/withdraw')
  @HttpCode(200)
  withdraw(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.applicationsService.withdraw({
      actor,
      applicationId,
      idempotencyKey,
    });
  }

  @Post('applications/:applicationId/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.applicationsService.accept({
      actor,
      applicationId,
      idempotencyKey,
    });
  }

  @Post('applications/:applicationId/decline')
  @HttpCode(200)
  decline(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Body() body: DeclineApplicationDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.applicationsService.decline({
      actor,
      applicationId,
      feedback: body.feedback,
      idempotencyKey,
    });
  }
}
