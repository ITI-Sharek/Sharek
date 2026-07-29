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

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../../shared/auth/guards/access-token.guard';
import {
  CancelContributionRequestDto,
  CreateContributionRequestDto,
  DiscardContributionRequestDto,
  UpdateContributionRequestDto,
} from '../dto/contribution-request-input.dto';
import { ContributionRequestPublicationService } from '../services/contribution-request-publication.service';
import { ContributionTasksService } from '../services/contribution-tasks.service';

@UseGuards(AccessTokenGuard)
@Controller()
export class ContributionTasksController {
  constructor(
    private readonly contributionTasksService: ContributionTasksService,
    private readonly publicationService: ContributionRequestPublicationService,
  ) {}

  @Get('projects/:projectId/contribution-requests')
  listForOwnedProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
  ) {
    return this.contributionTasksService.listForOwnedProject(user, projectId);
  }

  @Post('projects/:projectId/contribution-requests')
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Body() body: CreateContributionRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.contributionTasksService.createDraft({
      user,
      projectId,
      body,
      idempotencyKey,
    });
  }

  @Get('contribution-requests/:requestId')
  getOwnedRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
  ) {
    return this.contributionTasksService.getOwnedRequest(user, requestId);
  }

  @Patch('contribution-requests/:requestId')
  updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Body() body: UpdateContributionRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.contributionTasksService.updateDraft({
      user,
      requestId,
      body,
      idempotencyKey,
    });
  }

  @Post('contribution-requests/:requestId/discard')
  @HttpCode(200)
  discardDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Body() body: DiscardContributionRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.contributionTasksService.discardDraft({
      user,
      requestId,
      reason: body.reason,
      idempotencyKey,
    });
  }

  @Post('contribution-requests/:requestId/publish')
  @HttpCode(200)
  publishRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.publicationService.publishRequest({
      user,
      requestId,
      idempotencyKey,
    });
  }

  @Post('contribution-requests/:requestId/cancel')
  @HttpCode(200)
  cancelRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Body() body: CancelContributionRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.publicationService.cancelRequest({
      user,
      requestId,
      reason: body.reason,
      idempotencyKey,
    });
  }
}
