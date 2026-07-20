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
  CreateContributorFieldRequest,
  UpdateContributorFieldRequest,
} from '../dto/contributor-field.request';

@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('admin')
@Controller('admin/contributor-fields')
export class AdminContributorFieldsController {
  constructor(private readonly contributorProfiles: ContributorProfilesService) {}

  @Get()
  list() {
    return this.contributorProfiles.listFields(true);
  }

  @Post()
  create(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() body: CreateContributorFieldRequest,
  ) {
    return this.contributorProfiles.createField(admin, body);
  }

  @Patch(':fieldId')
  update(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('fieldId', new ParseUUIDPipe({ version: '4' })) fieldId: string,
    @Body() body: UpdateContributorFieldRequest,
  ) {
    return this.contributorProfiles.updateField(admin, fieldId, body);
  }
}
