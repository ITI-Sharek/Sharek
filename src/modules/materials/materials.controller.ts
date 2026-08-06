import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { BadRequestApplicationError } from '../../shared/errors/application.error';
import {
  AddMaterialVersionDto,
  CreateMaterialDto,
} from './dto/material-input.dto';
import { toMaterialVisibility } from './mappers/material.mapper';
import { MaterialsService, UploadedFile as MaterialFile } from './materials.service';

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
  constructor(private readonly materials: MaterialsService) {}

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
  getForOwner(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('materialId', new ParseUUIDPipe({ version: '4' })) materialId: string,
  ) {
    return this.materials.getForOwner(actor, materialId);
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
