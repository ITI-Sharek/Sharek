import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../../shared/auth/guards/roles.guard';
import { Roles } from '../../../shared/auth/roles.decorator';
import { SkillProfilesReviewService } from '../../skill-profiles/services/skill-profiles-review.service';
import {
  AdjustSkillReviewProficiencyRequest,
  ApproveSkillReviewRequest,
  ListAdminSkillReviewsQuery,
  RejectSkillReviewRequest,
} from '../dto/admin-skill-review.request';

@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('admin')
@Controller('admin/skill-reviews')
export class AdminSkillReviewsController {
  constructor(
    private readonly skillReviews: SkillProfilesReviewService,
  ) {}

  @Get('pending')
  listPending(
    @CurrentUser() admin: AuthenticatedUser,
    @Query() query: ListAdminSkillReviewsQuery,
  ) {
    return this.skillReviews.listPendingReviews({
      admin,
      page: query.page,
      limit: query.limit,
    });
  }

  @Post(':skillProfileId/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('skillProfileId', new ParseUUIDPipe({ version: '4' }))
    skillProfileId: string,
    @Body() body: ApproveSkillReviewRequest,
  ) {
    return this.skillReviews.approve({
      admin,
      skillProfileId,
      proficiency: body.proficiency,
      notes: body.notes,
    });
  }

  @Post(':skillProfileId/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('skillProfileId', new ParseUUIDPipe({ version: '4' }))
    skillProfileId: string,
    @Body() body: RejectSkillReviewRequest,
  ) {
    return this.skillReviews.reject({
      admin,
      skillProfileId,
      notes: body.notes,
    });
  }

  @Patch(':skillProfileId/proficiency')
  adjustProficiency(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('skillProfileId', new ParseUUIDPipe({ version: '4' }))
    skillProfileId: string,
    @Body() body: AdjustSkillReviewProficiencyRequest,
  ) {
    return this.skillReviews.adjustProficiency({
      admin,
      skillProfileId,
      proficiency: body.proficiency,
      notes: body.notes,
    });
  }
}
