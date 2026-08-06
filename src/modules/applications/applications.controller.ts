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
  RequestAssessmentDto,
  SubmitApplicationDto,
} from './dto/application-input.dto';
import { AdvisoryFitAssessmentService } from './services/advisory-fit-assessment.service';

@UseGuards(AccessTokenGuard)
@Controller()
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly advisoryFitAssessments: AdvisoryFitAssessmentService,
  ) {}

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

  @Post('applications/:applicationId/assessment-requests')
  @HttpCode(202)
  requestAssessment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
    @Body() body: RequestAssessmentDto,
  ) {
    return this.advisoryFitAssessments.request({
      actor,
      applicationId,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Get('applications/:applicationId/assessment')
  getAssessment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
  ) {
    return this.advisoryFitAssessments.getAssessment(actor, applicationId);
  }

  // Deliberately a command, not a side effect of the read above: a prefetch or
  // a poll must not claim the owner has seen the result. No idempotency key —
  // the resource identity is the idempotency, enforced by the unique index on
  // AssessmentPresentation.advisory_fit_assessment_id.
  @Post('applications/:applicationId/assessment/presentations')
  @HttpCode(200)
  presentAssessment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe({ version: '4' }))
    applicationId: string,
  ) {
    return this.advisoryFitAssessments.presentAssessment(actor, applicationId);
  }
}
