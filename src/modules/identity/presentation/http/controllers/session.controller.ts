import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { IdentityService } from '../../../application/use-cases/identity.service';
import { RefreshSessionRequest } from '../requests/refresh-session.request';
import { AssignRoleRequest } from '../requests/assign-role.request';
import { AccessTokenGuard } from '../../../../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../../../../shared/auth/guards/roles.guard';
import { Roles } from '../../../../../shared/auth/roles.decorator';
import { CurrentUser } from '../../../../../shared/auth/current-user.decorator';
import {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../../../../../shared/auth/authenticated-request';

@Controller('auth')
export class SessionController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('refresh')
  refresh(@Body() body: RefreshSessionRequest) {
    return this.identityService.refresh(body.refreshToken);
  }

  @UseGuards(AccessTokenGuard)
  @Post('logout')
  async logout(@Req() request: AuthenticatedRequest) {
    await this.identityService.logout(request.authSessionId);
    return {
      success: true,
    };
  }

  @UseGuards(AccessTokenGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.identityService.getCurrentUser(user.id);
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('admin')
  @Patch('users/:id/role')
  assignRole(@Param('id') userId: string, @Body() body: AssignRoleRequest) {
    return this.identityService.assignRole(userId, body.role);
  }
}
