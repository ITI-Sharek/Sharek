import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';

import { AllowInactiveAuthenticatedUsers } from '../../shared/auth/allow-inactive-authenticated-users.decorator';
import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { BadRequestApplicationError } from '../../shared/errors/application.error';
import { ContributorProfilesService } from './contributor-profiles.service';
import { UpdateContributorProfileRequest } from './dto/update-contributor-profile.request';
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

  @Patch('me')
  @AllowInactiveAuthenticatedUsers()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateContributorProfileRequest,
  ) {
    return this.contributorProfilesService.update(user.id, body);
  }

  @Put('me/avatar')
  @AllowInactiveAuthenticatedUsers()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2_000_000 } }))
  updateAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile()
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    if (!file) {
      throw new BadRequestApplicationError(
        'Avatar image file is required',
        'PROFILE_AVATAR_REQUIRED',
      );
    }
    return this.contributorProfilesService.updateAvatar(user.id, file);
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

@UseGuards(AccessTokenGuard)
@Controller('contributors/profile-fields')
export class ContributorFieldsController {
  constructor(private readonly contributorProfilesService: ContributorProfilesService) {}

  @Get()
  list() {
    return this.contributorProfilesService.listFields();
  }
}

@Controller('contributors/profiles')
export class ContributorProfileAvatarsController {
  constructor(private readonly contributorProfilesService: ContributorProfilesService) {}

  @Get(':username/avatar')
  async getAvatar(
    @Param('username') username: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!CONTRIBUTOR_USERNAME_PATTERN.test(username)) {
      throw new BadRequestApplicationError(
        'Username route parameter is malformed',
        'MALFORMED_USERNAME',
      );
    }
    const avatar = await this.contributorProfilesService.getAvatar(username);
    response.set({
      'Content-Type': avatar.mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Last-Modified': avatar.updatedAt.toUTCString(),
    });
    return new StreamableFile(avatar.data);
  }
}
