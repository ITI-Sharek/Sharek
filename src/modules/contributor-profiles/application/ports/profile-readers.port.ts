import {
  ContributorProfileGitHubStatusDto,
  ContributorProfileReputationSummaryDto,
  ContributorProfileSkillDto,
} from '../dto/contributor-profile.dto';

export abstract class GitHubProfileStatusReader {
  abstract getStatusForUser(userId: string): Promise<ContributorProfileGitHubStatusDto>;
}

export abstract class SkillProfileSummaryReader {
  abstract listSkillsForProfile(
    userId: string,
    options: { includeGenerated: boolean },
  ): Promise<ContributorProfileSkillDto[]>;
}

export abstract class ReputationSummaryReader {
  abstract getSummaryForUser(
    userId: string,
  ): Promise<ContributorProfileReputationSummaryDto>;
}
