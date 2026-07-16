import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';

import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import { RefreshSessionRequest } from '../dto/refresh-session.request';
import { AssignRoleRequest } from '../dto/assign-role.request';
import { AccessTokenGuard } from '../../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../../shared/auth/guards/roles.guard';
import { Roles } from '../../../shared/auth/roles.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../../../shared/auth/authenticated-request';

@Controller('auth')
export class SessionController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Post('refresh')
  refresh(@Body() body: RefreshSessionRequest) {
    return this.sessionService.refresh(body.refreshToken);
  }

  @UseGuards(AccessTokenGuard)
  @Post('logout')
  async logout(@Req() request: AuthenticatedRequest) {
    await this.sessionService.logout(request.authSessionId);
    return {
      success: true,
    };
  }

  @UseGuards(AccessTokenGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getCurrentUser(user.id);
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('admin')
  @Patch('users/:id/role')
  assignRole(@Param('id') userId: string, @Body() body: AssignRoleRequest) {
    return this.authService.assignRole(userId, body.role);
  }
}
