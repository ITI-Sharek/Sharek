import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import { AssignRoleRequest } from '../dto/assign-role.request';
import { PublicAuthTokensDto, toPublicAuthTokens } from '../dto/auth-session.dto';
import { RefreshCookieService } from '../security/refresh-cookie.service';
import { AccessTokenGuard } from '../../../shared/auth/guards/access-token.guard';
import { AuthOriginGuard } from '../../../shared/auth/guards/auth-origin.guard';
import { RolesGuard } from '../../../shared/auth/guards/roles.guard';
import { Roles } from '../../../shared/auth/roles.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../../../shared/auth/authenticated-request';
import { ApplicationError } from '../../../shared/errors/application.error';

@Controller('auth')
export class SessionController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly refreshCookieService: RefreshCookieService,
  ) {}

  @UseGuards(AuthOriginGuard)
  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ tokens: PublicAuthTokensDto }> {
    const refreshToken = this.refreshCookieService.read(request);

    if (!refreshToken) {
      throw new ApplicationError(
        'Refresh credential is missing',
        'REFRESH_TOKEN_MISSING',
        401,
      );
    }

    const tokens = await this.sessionService.refresh(refreshToken);
    this.refreshCookieService.issue(
      response,
      tokens.refreshToken,
      tokens.refreshExpiresAt,
    );

    return {
      tokens: toPublicAuthTokens(tokens),
    };
  }

  @UseGuards(AuthOriginGuard, AccessTokenGuard)
  @Post('logout')
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.sessionService.logout(request.authSessionId);
    this.refreshCookieService.clear(response);

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
