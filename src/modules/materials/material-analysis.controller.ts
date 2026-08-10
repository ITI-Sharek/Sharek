import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AccessTokenGuard } from '../../shared/auth/guards/access-token.guard';
import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import {
  AdoptContributionRequestSuggestionDto,
  AdoptProjectSuggestionDto,
  CreateMaterialAnalysisSetDto,
} from './dto/material-analysis-input.dto';
import { MaterialAnalysisService } from './services/material-analysis.service';

@UseGuards(AccessTokenGuard)
@Controller()
export class MaterialAnalysisController {
  constructor(private readonly analysis: MaterialAnalysisService) {}

  @Post('projects/:projectId/material-analysis/sets')
  createSet(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
    @Body() body: CreateMaterialAnalysisSetDto,
  ) {
    return this.analysis.createSet(actor, projectId, body);
  }

  @Post('material-analysis/suggestions/:suggestionId/reject')
  rejectSuggestion(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('suggestionId', new ParseUUIDPipe({ version: '4' })) suggestionId: string,
  ) {
    return this.analysis.rejectSuggestion(actor, suggestionId);
  }

  @Post('material-analysis/suggestions/:suggestionId/adopt-project')
  adoptProjectSuggestion(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('suggestionId', new ParseUUIDPipe({ version: '4' })) suggestionId: string,
    @Body() body: AdoptProjectSuggestionDto,
  ) {
    return this.analysis.adoptProjectSuggestion(actor, suggestionId, body);
  }

  @Post('material-analysis/suggestions/:suggestionId/adopt-contribution-request')
  adoptContributionRequestSuggestion(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('suggestionId', new ParseUUIDPipe({ version: '4' })) suggestionId: string,
    @Body() body: AdoptContributionRequestSuggestionDto,
  ) {
    return this.analysis.adoptContributionRequestSuggestion(actor, suggestionId, body);
  }

  @Get('projects/:projectId/material-analysis/constraints')
  getConstraints(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
  ) {
    return this.analysis.getConstraints(actor, projectId);
  }

  @Get('projects/:projectId/material-analysis/sets')
  listSets(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe({ version: '4' })) projectId: string,
  ) {
    return this.analysis.listSets(actor, projectId);
  }

  @Post('material-analysis/sets/:analysisSetId/runs')
  startSet(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('analysisSetId', new ParseUUIDPipe({ version: '4' })) analysisSetId: string,
  ) {
    return this.analysis.startSet(actor, analysisSetId);
  }

  @Get('material-analysis/runs/:runId')
  getRun(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
  ) {
    return this.analysis.getRun(actor, runId);
  }
}
