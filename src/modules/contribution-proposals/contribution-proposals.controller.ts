import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { ContributionProposalsService } from './contribution-proposals.service';
import {
  RequestProposalRevisionDto,
  SetProposalIntakeDto,
  SubmitContributionProposalDto,
  SubmitProposalVersionDto,
} from './dto/contribution-proposal-input.dto';

@UseGuards(AccessTokenGuard)
@Controller('contribution-proposals')
export class ContributionProposalsController {
  constructor(private readonly proposals: ContributionProposalsService) {}

  @Post()
  submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: SubmitContributionProposalDto,
  ) {
    return this.proposals.submit({
      actor,
      projectId: body.projectId,
      title: body.title,
      body: body.body,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Get('mine')
  listMine(@CurrentUser() actor: AuthenticatedUser) {
    return this.proposals.listMine(actor);
  }

  @Get('for-project/:projectId')
  listForProject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
  ) {
    return this.proposals.listForProject(actor, projectId);
  }

  @Put('for-project/:projectId/intake')
  setIntake(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Body() body: SetProposalIntakeDto,
  ) {
    return this.proposals.setIntake(actor, projectId, body.enabled);
  }

  @Get(':proposalId')
  getForActor(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('proposalId', new ParseUUIDPipe({ version: '4' }))
    proposalId: string,
  ) {
    return this.proposals.getForActor(actor, proposalId);
  }

  @Post(':proposalId/versions')
  submitVersion(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('proposalId', new ParseUUIDPipe({ version: '4' }))
    proposalId: string,
    @Body() body: SubmitProposalVersionDto,
  ) {
    return this.proposals.submitVersion({
      actor,
      proposalId,
      title: body.title,
      body: body.body,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Post(':proposalId/revision-requests')
  requestRevision(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('proposalId', new ParseUUIDPipe({ version: '4' }))
    proposalId: string,
    @Body() body: RequestProposalRevisionDto,
  ) {
    return this.proposals.requestRevision({
      actor,
      proposalId,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Post(':proposalId/withdraw')
  @HttpCode(200)
  withdraw(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('proposalId', new ParseUUIDPipe({ version: '4' }))
    proposalId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.proposals.withdraw({ actor, proposalId, idempotencyKey });
  }
}
