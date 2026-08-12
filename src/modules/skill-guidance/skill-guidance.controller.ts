import {
  Body,
  Controller,
  Post,
  ParseUUIDPipe,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { from, map, Observable } from 'rxjs';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { SkillGapGuidanceRequest } from './dto/skill-gap-guidance.request';
import { SkillGapGuidanceService } from './skill-guidance.service';

@UseGuards(AccessTokenGuard)
@Controller('contributors/me/skill-gap-guidance')
export class SkillGapGuidanceController {
  constructor(private readonly skillGapGuidance: SkillGapGuidanceService) {}

  @Post()
  generate(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: SkillGapGuidanceRequest,
  ) {
    return this.skillGapGuidance.generate(actor, body.contributionRequestId);
  }

  @Sse('stream')
  stream(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('contributionRequestId', new ParseUUIDPipe({ version: '4' }))
    contributionRequestId: string,
  ): Observable<MessageEvent> {
    return from(
      this.skillGapGuidance.generate(actor, contributionRequestId),
    ).pipe(
      map((data) => ({
        type: 'guidance.completed',
        data,
      })),
    );
  }
}
