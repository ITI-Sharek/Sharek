import { Body, Controller, Get, Param, Patch, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import { RefreshSessionRequest } from '../dto/refresh-session.request';
import { AssignRoleRequest } from '../dto/assign-role.request';
import { UpdateUserPreferencesRequest } from '../dto/update-user-preferences.request';
import { ChangePasswordRequest } from '../dto/change-password.request';
import { UpdateUsernameRequest } from '../dto/update-username.request';
import { UpdatePersonalDetailsRequest } from '../dto/update-personal-details.request';
import { UpdatePhoneRequest } from '../dto/update-phone.request';
import { UpdatePrivacyRequest } from '../dto/update-privacy.request';
import { AccountSettingsService } from '../services/account-settings.service';
import { BadRequestApplicationError } from '../../../shared/errors/application.error';
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
    private readonly accountSettingsService: AccountSettingsService,
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

  @UseGuards(AccessTokenGuard)
  @Patch('me/preferences')
  updateMyPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateUserPreferencesRequest,
  ) {
    return this.sessionService.updateCurrentUserPreferences(user.id, body);
  }

  @UseGuards(AccessTokenGuard)
  @Patch('me/password')
  changeMyPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest,
    @Body() body: ChangePasswordRequest,
  ) {
    return this.accountSettingsService.changePassword(user.id, request.authSessionId, body);
  }


  @UseGuards(AccessTokenGuard)
  @Patch('me/username')
  updateMyUsername(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateUsernameRequest) {
    return this.accountSettingsService.updateUsername(user.id, body);
  }

  @UseGuards(AccessTokenGuard)
  @Patch('me/details')
  updateMyDetails(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdatePersonalDetailsRequest) {
    return this.accountSettingsService.updatePersonalDetails(user.id, body);
  }

  @UseGuards(AccessTokenGuard)
  @Patch('me/phone')
  updateMyPhone(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdatePhoneRequest) {
    return this.accountSettingsService.updatePhone(user.id, body);
  }

  @UseGuards(AccessTokenGuard)
  @Patch('me/privacy')
  updateMyPrivacy(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdatePrivacyRequest) {
    return this.accountSettingsService.updatePrivacy(user.id, body);
  }

  @UseGuards(AccessTokenGuard)
  @Put('me/identity-document')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10_000_000 } }))
  uploadIdentityDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    if (!file) {
      throw new BadRequestApplicationError(
        'Identity document file is required',
        'IDENTITY_DOCUMENT_REQUIRED',
      );
    }
    return this.accountSettingsService.uploadIdentityDocument(user.id, file);
  }

  @UseGuards(AccessTokenGuard)
  @Get('me/export')
  exportMyAccountData(@CurrentUser() user: AuthenticatedUser) {
    return this.accountSettingsService.exportAccountData(user.id);
  }

  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('admin')
  @Patch('users/:id/role')
  assignRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') userId: string,
    @Body() body: AssignRoleRequest,
  ) {
    return this.authService.assignRole(actor.id, userId, body.role);
  }
}
