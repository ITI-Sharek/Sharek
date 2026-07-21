import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../../shared/auth/guards/roles.guard';
import { Roles } from '../../../shared/auth/roles.decorator';
import { ContributorProfilesService } from '../../contributor-profiles/contributor-profiles.service';
import {
  CreateExperienceLevelRequest,
  UpdateExperienceLevelRequest,
} from '../dto/experience-level.request';

@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('admin')
@Controller('admin/experience-levels')
export class AdminExperienceLevelsController {
  constructor(private readonly contributorProfiles: ContributorProfilesService) {}

  @Get()
  list() {
    return this.contributorProfiles.listExperienceLevels(true);
  }

  @Post()
  create(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() body: CreateExperienceLevelRequest,
  ) {
    return this.contributorProfiles.createExperienceLevel(admin, body);
  }

  @Patch(':levelId')
  update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('levelId', new ParseUUIDPipe({ version: '4' })) levelId: string,
    @Body() body: UpdateExperienceLevelRequest,
  ) {
    return this.contributorProfiles.updateExperienceLevel(admin, levelId, body);
  }
}
