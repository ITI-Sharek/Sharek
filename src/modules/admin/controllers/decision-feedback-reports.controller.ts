import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../../shared/auth/guards/access-token.guard';
import { CreateDecisionFeedbackReportRequest } from '../dto/decision-feedback-report.request';
import { DecisionFeedbackReportsService } from '../services/decision-feedback-reports.service';

@UseGuards(AccessTokenGuard)
@Controller('owner-decisions')
export class DecisionFeedbackReportsController {
  constructor(
    private readonly decisionFeedbackReports: DecisionFeedbackReportsService,
  ) {}

  @Post(':ownerDecisionId/reports')
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ownerDecisionId', new ParseUUIDPipe({ version: '4' }))
    ownerDecisionId: string,
    @Body() body: CreateDecisionFeedbackReportRequest,
  ) {
    return this.decisionFeedbackReports.create({
      actor,
      ownerDecisionId,
      reason: body.reason,
      description: body.description,
    });
  }
}
