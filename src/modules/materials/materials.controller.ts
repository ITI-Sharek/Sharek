import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';

import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { BadRequestApplicationError } from '../../shared/errors/application.error';
import {
  AddMaterialVersionDto,
  ChangeMaterialVisibilityDto,
  CreateMaterialDto,
  GrantMaterialAccessDto,
  MaterialCommandDto,
} from './dto/material-input.dto';
import { toMaterialVisibility } from './mappers/material.mapper';
import { MaterialsService, UploadedFile as MaterialFile } from './materials.service';
import { MaterialGrantsService } from './services/material-grants.service';
import { MaterialListingService } from './services/material-listing.service';

/**
 * Material commands. Upload is storage consent only -- no route here starts
 * extraction, embedding, retrieval, or a provider call.
 *
 * The multipart size ceiling is deliberately generous; the configured limit is
 * enforced in the service so the rejection carries a domain error code rather
 * than a framework payload-too-large.
 */
@UseGuards(AccessTokenGuard)
@Controller()
export class MaterialsController {
  constructor(
    private readonly materials: MaterialsService,
    private readonly grants: MaterialGrantsService,
    private readonly listing: MaterialListingService,
  ) {}

  /**
   * Outside `/materials/` for the same reason as the download route:
   * `materials/upload-constraints` is matched by `materials/:materialId`
   * first, whose UUID pipe rejects it before this handler runs. Declaring it
   * above the parameterised route also works, right up until someone reorders
   * these methods and the failure comes back silently.
   */
  @Get('material-upload-constraints')
  getUploadConstraints() {
    return this.materials.getUploadConstraints();
  }

  @Get('projects/:projectId/materials')
  listForProject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
  ) {
    return this.listing.listForProject(actor, projectId);
  }

  @Get('contribution-requests/:requestId/materials')
  listForContributionRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
  ) {
    return this.listing.listForContributionRequest(actor, requestId);
  }

  @Post('projects/:projectId/materials')
  @UseInterceptors(FileInterceptor('file'))
  createForProject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Body() body: CreateMaterialDto,
    @UploadedFile() file?: MaterialFile,
  ) {
    return this.materials.createForProject({
      actor,
      projectId,
      title: body.title,
      visibility: toMaterialVisibility(body.visibility),
      idempotencyKey: body.idempotencyKey,
      file: this.requireFile(file),
    });
  }

  @Post('contribution-requests/:requestId/materials')
  @UseInterceptors(FileInterceptor('file'))
  createForContributionRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
    @Body() body: CreateMaterialDto,
    @UploadedFile() file?: MaterialFile,
  ) {
    return this.materials.createForContributionRequest({
      actor,
      requestId,
      title: body.title,
      visibility: toMaterialVisibility(body.visibility),
      idempotencyKey: body.idempotencyKey,
      file: this.requireFile(file),
    });
  }

  @Post('materials/:materialId/versions')
  @UseInterceptors(FileInterceptor('file'))
  addVersion(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) materialId: string,
    @Body() body: AddMaterialVersionDto,
    @UploadedFile() file?: MaterialFile,
  ) {
    return this.materials.addVersion({
      actor,
      materialId,
      idempotencyKey: body.idempotencyKey,
      file: this.requireFile(file),
    });
  }

  @Get('materials/:materialId')
  getForReader(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) materialId: string,
  ) {
    return this.materials.getForReader(actor, materialId);
  }

  @Post('materials/:materialId/grants')
  grant(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) materialId: string,
    @Body() body: GrantMaterialAccessDto,
  ) {
    return this.grants.grant({
      actor,
      materialId,
      granteeId: body.granteeId,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Get('materials/:materialId/grants')
  listGrants(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) materialId: string,
  ) {
    return this.grants.listGrants(actor, materialId);
  }

  /**
   * POST rather than DELETE: revocation carries an idempotency key in the
   * body, and DELETE bodies are not reliably transmitted.
   */
  @Post('materials/:materialId/grants/:granteeId/revocations')
  revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) materialId: string,
    @Param('granteeId', new ParseUUIDPipe({ version: '4' })) granteeId: string,
    @Body() body: MaterialCommandDto,
  ) {
    return this.grants.revoke({
      actor,
      materialId,
      granteeId,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Patch('materials/:materialId/visibility')
  changeVisibility(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) materialId: string,
    @Body() body: ChangeMaterialVisibilityDto,
  ) {
    return this.grants.changeVisibility({
      actor,
      materialId,
      visibility: toMaterialVisibility(body.visibility),
      idempotencyKey: body.idempotencyKey,
    });
  }

  /**
   * Issues the link rather than streaming here, so the authorization decision
   * and the byte transfer are separate events -- and so the decision can be
   * made again, against live state, when the link is redeemed.
   */
  @Post('materials/:materialId/versions/:version/download-token')
  issueDownloadToken(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) materialId: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.materials.issueDownloadToken({ actor, materialId, version });
  }

  /**
   * Still behind the access guard. The token proves which version was asked
   * for and by whom; the guard proves the caller is that person, so a leaked
   * link is not a copy of the document.
   *
   * Deliberately not `materials/downloads`: that path is matched by
   * `materials/:materialId` first, and its UUID pipe rejects the request with a
   * validation error before this handler is ever reached. Declaration order
   * would fix it today and break silently the next time someone reorders these
   * methods, so the collision is removed rather than avoided.
   */
  @Get('material-downloads')
  async download(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('token') token: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const opened = await this.materials.openDownload(actor, token ?? '');
    response.setHeader('Content-Type', opened.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(opened.originalFilename)}"`,
    );
    // A download URL carries a credential in the query string; caching it
    // anywhere shared would outlive the expiry it depends on.
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(opened.stream);
  }

  @Post('materials/:materialId/deletions')
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) materialId: string,
    @Body() body: MaterialCommandDto,
  ) {
    return this.materials.remove({
      actor,
      materialId,
      idempotencyKey: body.idempotencyKey,
    });
  }

  private requireFile(file?: MaterialFile): MaterialFile {
    if (!file) {
      throw new BadRequestApplicationError(
        'Material file is required',
        'MATERIAL_FILE_REQUIRED',
      );
    }
    return file;
  }
}
