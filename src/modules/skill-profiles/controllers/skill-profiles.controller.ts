import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AllowInactiveAuthenticatedUsers } from '../../../shared/auth/allow-inactive-authenticated-users.decorator';
import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../../shared/auth/guards/access-token.guard';
import { SkillProfilesService } from '../skill-profiles.service';
import {
  RetrySkillProfileGenerationRequest,
  StartSkillProfileGenerationRequest,
} from '../dto/start-skill-profile-generation.dto';

@UseGuards(AccessTokenGuard)
@Controller('skill-profiles')
export class SkillProfilesController {
  constructor(private readonly skillProfilesService: SkillProfilesService) {}

  @Post('me/generations')
  @AllowInactiveAuthenticatedUsers()
  startGeneration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: StartSkillProfileGenerationRequest,
  ) {
    return this.skillProfilesService.startGeneration({
      user,
      installationLinkId: body.installationLinkId,
      repositoryIds: body.repositoryIds,
      consent: body.consent,
    });
  }

  @Get('me/generations/latest')
  @AllowInactiveAuthenticatedUsers()
  getLatestGeneration(@CurrentUser() user: AuthenticatedUser) {
    return this.skillProfilesService.getLatestGeneration(user.id);
  }

  @Get('me/generations/:generationId')
  @AllowInactiveAuthenticatedUsers()
  getGeneration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('generationId', new ParseUUIDPipe({ version: '4' }))
    generationId: string,
  ) {
    return this.skillProfilesService.getGeneration({
      userId: user.id,
      generationId,
    });
  }

  @Post('me/generations/:generationId/retry')
  @AllowInactiveAuthenticatedUsers()
  retryGeneration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('generationId', new ParseUUIDPipe({ version: '4' }))
    generationId: string,
    @Body() body: RetrySkillProfileGenerationRequest,
  ) {
    return this.skillProfilesService.retryGeneration({
      user,
      generationId,
      consent: body.consent,
    });
  }
}
