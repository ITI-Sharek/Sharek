import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../shared/auth/guards/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { EligibilityService } from './services/eligibility.service';

@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('contributor')
@Controller()
export class EligibilityController {
  constructor(private readonly eligibility: EligibilityService) {}

  /**
   * Render the gate before the contributor commits to a form.
   *
   * Always the caller's own eligibility — there is no path to ask about someone
   * else, so the endpoint cannot become a way to probe another contributor's
   * approved skills.
   */
  @Get('tasks/:requestId/eligibility')
  previewForRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
  ) {
    return this.eligibility.previewForRequest(actor.id, requestId);
  }
}
