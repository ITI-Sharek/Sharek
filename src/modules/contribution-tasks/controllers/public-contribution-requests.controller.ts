import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { ContributionRequestFeedQueryDto } from '../dto/contribution-request-public.dto';
import { PublicContributionRequestsService } from '../services/public-contribution-requests.service';

@Controller('tasks')
export class PublicContributionRequestsController {
  constructor(
    private readonly publicContributionRequests: PublicContributionRequestsService,
  ) {}

  @Get()
  list(@Query() query: ContributionRequestFeedQueryDto) {
    const { ['technologies[]']: bracketedTechnologies, ...filters } = query;
    return this.publicContributionRequests.list({
      ...filters,
      ...(filters.technologies || bracketedTechnologies
        ? { technologies: filters.technologies ?? bracketedTechnologies }
        : {}),
    });
  }

  @Get(':requestId')
  getById(
    @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
  ) {
    return this.publicContributionRequests.getById(requestId);
  }
}
