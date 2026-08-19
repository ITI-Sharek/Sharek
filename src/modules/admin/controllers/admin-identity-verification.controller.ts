import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AccessTokenGuard } from '../../../shared/auth/guards/access-token.guard';
import { RolesGuard } from '../../../shared/auth/guards/roles.guard';
import { Roles } from '../../../shared/auth/roles.decorator';
import {
  ListIdentityVerificationsQuery,
  ReviewIdentityVerificationRequest,
} from '../dto/review-identity-verification.request';
import { AdminIdentityVerificationService } from '../services/admin-identity-verification.service';

@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('admin')
@Controller('admin/identity-verifications')
export class AdminIdentityVerificationController {
  constructor(
    private readonly identityVerificationService: AdminIdentityVerificationService,
  ) {}

  @Get()
  list(@Query() query: ListIdentityVerificationsQuery) {
    return this.identityVerificationService.listVerifications(query);
  }

  @Get(':userId/document')
  async getDocument(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Res() res: Response,
  ) {
    const document = await this.identityVerificationService.getDocument(userId);
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${document.filename}"`,
    );
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.send(document.data);
  }

  @Patch(':userId')
  @HttpCode(HttpStatus.OK)
  review(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() body: ReviewIdentityVerificationRequest,
  ) {
    return this.identityVerificationService.reviewVerification(
      admin,
      userId,
      body,
    );
  }
}
