import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../../shared/auth/guards/access-token.guard';
import {
  ListEligibilityGuidanceDto,
  RequestEligibilityGuidanceDto,
} from '../dto/eligibility-guidance.dto';
import { EligibilityGuidanceService } from '../services/eligibility-guidance.service';

/**
 * Guidance triggered by a block. Every route is scoped to the caller — there is
 * no path to ask about anyone else's guidance or anyone else's gap.
 */
@UseGuards(AccessTokenGuard)
@Controller('contributors/me/eligibility-guidance')
export class EligibilityGuidanceController {
  constructor(private readonly guidance: EligibilityGuidanceService) {}

  /** Returns immediately; the narrative is polled for. */
  @Post()
  request(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: RequestEligibilityGuidanceDto,
  ) {
    return this.guidance.request(actor, body.eligibilityEvaluationId);
  }

  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListEligibilityGuidanceDto,
  ) {
    return this.guidance.listForActor(actor, query);
  }

  @Get(':guidanceId')
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('guidanceId', new ParseUUIDPipe({ version: '4' }))
    guidanceId: string,
  ) {
    return this.guidance.getForActor(actor, guidanceId);
  }
}
