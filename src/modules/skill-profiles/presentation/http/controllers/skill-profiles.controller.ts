import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AllowInactiveAuthenticatedUsers } from '../../../../../shared/auth/allow-inactive-authenticated-users.decorator';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-request';
import { CurrentUser } from '../../../../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../../../../shared/auth/guards/access-token.guard';
import { GetSkillProfileGenerationUseCase } from '../../../application/use-cases/get-skill-profile-generation.use-case';
import { StartSkillProfileGenerationUseCase } from '../../../application/use-cases/start-skill-profile-generation.use-case';
import { StartSkillProfileGenerationRequest } from '../requests/start-skill-profile-generation.request';

@UseGuards(AccessTokenGuard)
@Controller('skill-profiles')
export class SkillProfilesController {
  constructor(
    private readonly startSkillProfileGeneration: StartSkillProfileGenerationUseCase,
    private readonly getSkillProfileGeneration: GetSkillProfileGenerationUseCase,
  ) {}

  @Post('me/generations')
  @AllowInactiveAuthenticatedUsers()
  startGeneration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: StartSkillProfileGenerationRequest,
  ) {
    return this.startSkillProfileGeneration.execute({
      user,
      repositories: body.repositories,
    });
  }

  @Get('me/generations/:generationId')
  @AllowInactiveAuthenticatedUsers()
  getGeneration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('generationId', new ParseUUIDPipe({ version: '4' }))
    generationId: string,
  ) {
    return this.getSkillProfileGeneration.execute({
      userId: user.id,
      generationId,
    });
  }
}
