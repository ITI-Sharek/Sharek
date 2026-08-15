import { Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../shared/auth/guards/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import {
  OwnerContributorMatchingResponseDto,
  OwnerContributorMatchingService,
} from './owner-contributor-matching.service';

@Controller('contribution-requests')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('owner')
export class OwnerContributorMatchingController {
  constructor(private readonly matching: OwnerContributorMatchingService) {}

  @Post(':requestId/matches/generate')
  generate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
  ): Promise<OwnerContributorMatchingResponseDto> {
    return this.matching.generate({ actor, requestId });
  }
}
