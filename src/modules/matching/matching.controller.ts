import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { RolesGuard } from '../../shared/auth/guards/roles.guard';
import { ContributorMatchingService } from './matching.service';

@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('owner')
@Controller('contribution-requests')
export class ContributorMatchingController {
  constructor(private readonly matching: ContributorMatchingService) {}

  @Get(':requestId/matches')
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
  ) {
    return this.matching.listForOwner({ actor, requestId });
  }

  @Post(':requestId/matches/generate')
  generate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
  ) {
    return this.matching.generateForPublishedRequest({
      ownerId: actor.id,
      requestId,
    });
  }

  @Post(':requestId/matches/:contributorId/invite')
  @HttpCode(200)
  invite(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Param('contributorId', new ParseUUIDPipe({ version: '4' })) contributorId: string,
  ) {
    return this.matching.inviteMatchedContributor({
      ownerId: actor.id,
      requestId,
      contributorId,
    });
  }
}
