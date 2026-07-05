import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { IdentityService } from '../../../application/use-cases/identity.service';
import { RegisterRequest } from '../requests/register.request';
import { LoginRequest } from '../requests/login.request';
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
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('register')
  register(@Body() body: RegisterRequest, @Req() request: Request) {
    return this.identityService.register(body, this.getRequestContext(request));
  }

  @Post('login')
  login(@Body() body: LoginRequest, @Req() request: Request) {
    return this.identityService.login(body, this.getRequestContext(request));
  }

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

  private getRequestContext(request: Request) {
    return {
      userAgent: this.getUserAgent(request),
      ipAddress: request.ip,
    };
  }

  private getUserAgent(request: Request): string | undefined {
    const userAgent = request.headers['user-agent'];
    return Array.isArray(userAgent) ? userAgent[0] : userAgent;
  }
}
