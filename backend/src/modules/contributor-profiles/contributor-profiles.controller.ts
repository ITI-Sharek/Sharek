import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { AllowInactiveAuthenticatedUsers } from '../../shared/auth/allow-inactive-authenticated-users.decorator';
import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { BadRequestApplicationError } from '../../shared/errors/application.error';
import { ContributorProfilesService } from './contributor-profiles.service';
import { CONTRIBUTOR_USERNAME_PATTERN } from './validators/contributor-profile.validator';

@UseGuards(AccessTokenGuard)
@Controller('contributors/profiles')
export class ContributorProfilesController {
  constructor(private readonly contributorProfilesService: ContributorProfilesService) {}

  @Post('me/ensure')
  @AllowInactiveAuthenticatedUsers()
  ensure(@CurrentUser() user: AuthenticatedUser) {
    return this.contributorProfilesService.ensure(user.id);
  }

  @Get(':username')
  getByUsername(
    @Param('username') username: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!CONTRIBUTOR_USERNAME_PATTERN.test(username)) {
      throw new BadRequestApplicationError(
        'Username route parameter is malformed',
        'MALFORMED_USERNAME',
      );
    }

    return this.contributorProfilesService.getByUsername(user.id, username);
  }
}
