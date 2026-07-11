import { Module } from '@nestjs/common';

import { GithubModule } from '../github/github.module';
import { GitHubProfileStatusReaderService } from '../github/application/use-cases/github-profile-status-reader.service';
import { IdentityModule } from '../identity/identity.module';
import { ReputationModule } from '../reputation/reputation.module';
import { ReputationSummaryReaderService } from '../reputation/application/use-cases/reputation-summary-reader.service';
import { SkillProfilesModule } from '../skill-profiles/skill-profiles.module';
import { SkillProfileSummaryReaderService } from '../skill-profiles/application/use-cases/skill-profile-summary-reader.service';
import { EnsureContributorProfileUseCase } from './application/use-cases/ensure-contributor-profile.use-case';
import { GetContributorProfileUseCase } from './application/use-cases/get-contributor-profile.use-case';
import { ContributorProfileRepository } from './application/ports/contributor-profile.repository';
import {
  GitHubProfileStatusReader,
  ReputationSummaryReader,
  SkillProfileSummaryReader,
} from './application/ports/profile-readers.port';
import { PrismaContributorProfileRepository } from './infrastructure/persistence/prisma-contributor-profile.repository';
import { ContributorProfilesController } from './presentation/http/controllers/contributor-profiles.controller';

@Module({
  imports: [IdentityModule, GithubModule, SkillProfilesModule, ReputationModule],
  controllers: [ContributorProfilesController],
  providers: [
    EnsureContributorProfileUseCase,
    GetContributorProfileUseCase,
    {
      provide: ContributorProfileRepository,
      useClass: PrismaContributorProfileRepository,
    },
    {
      provide: GitHubProfileStatusReader,
      useExisting: GitHubProfileStatusReaderService,
    },
    {
      provide: SkillProfileSummaryReader,
      useExisting: SkillProfileSummaryReaderService,
    },
    {
      provide: ReputationSummaryReader,
      useExisting: ReputationSummaryReaderService,
    },
  ],
})
export class ContributorProfilesModule {}
