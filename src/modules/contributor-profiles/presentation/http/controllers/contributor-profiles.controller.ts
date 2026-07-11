import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../../../../shared/auth/current-user.decorator';
import {
  AuthenticatedUser,
} from '../../../../../shared/auth/authenticated-request';
import { AccessTokenGuard } from '../../../../../shared/auth/guards/access-token.guard';
import { BadRequestApplicationError } from '../../../../../shared/errors/application.error';
import { USERNAME_PATTERN } from '../../../../identity/domain/username/username.policy';
import { EnsureContributorProfileUseCase } from '../../../application/use-cases/ensure-contributor-profile.use-case';
import { GetContributorProfileUseCase } from '../../../application/use-cases/get-contributor-profile.use-case';

@UseGuards(AccessTokenGuard)
@Controller('contributors/profiles')
export class ContributorProfilesController {
  constructor(
    private readonly ensureContributorProfile: EnsureContributorProfileUseCase,
    private readonly getContributorProfile: GetContributorProfileUseCase,
  ) {}

  @Post('me/ensure')
  ensure(@CurrentUser() user: AuthenticatedUser) {
    return this.ensureContributorProfile.execute({
      viewerUserId: user.id,
    });
  }

  @Get(':username')
  getByUsername(
    @Param('username') username: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!USERNAME_PATTERN.test(username)) {
      throw new BadRequestApplicationError(
        'Username route parameter is malformed',
        'MALFORMED_USERNAME',
      );
    }

    return this.getContributorProfile.execute({
      viewerUserId: user.id,
      username,
    });
  }
}
