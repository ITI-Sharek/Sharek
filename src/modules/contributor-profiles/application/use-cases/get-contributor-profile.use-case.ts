import { Injectable } from '@nestjs/common';

import { NotFoundApplicationError } from '../../../../shared/errors/application.error';
import { ContributorProfileDto } from '../dto/contributor-profile.dto';
import { ContributorProfileRepository } from '../ports/contributor-profile.repository';
import {
  GitHubProfileStatusReader,
  ReputationSummaryReader,
  SkillProfileSummaryReader,
} from '../ports/profile-readers.port';
import {
  getViewerRelationship,
  isContributorProfileVisible,
} from '../../domain/policies/contributor-profile.policy';
import { presentContributorProfile } from './contributor-profile-presenter';

export interface GetContributorProfileInput {
  viewerUserId: string;
  username: string;
}

@Injectable()
export class GetContributorProfileUseCase {
  constructor(
    private readonly profiles: ContributorProfileRepository,
    private readonly githubStatusReader: GitHubProfileStatusReader,
    private readonly skillSummaryReader: SkillProfileSummaryReader,
    private readonly reputationSummaryReader: ReputationSummaryReader,
  ) {}

  async execute(input: GetContributorProfileInput): Promise<ContributorProfileDto> {
    const profile = await this.profiles.findByUsername(input.username);

    if (!profile || !isContributorProfileVisible(profile.user)) {
      throw new NotFoundApplicationError('Contributor profile was not found', 'PROFILE_NOT_FOUND');
    }

    const viewerRelationship = getViewerRelationship(input.viewerUserId, profile.user_id);
    const isOwner = viewerRelationship === 'owner';

    const [githubStatus, skills, reputationSummary] = await Promise.all([
      this.githubStatusReader.getStatusForUser(profile.user_id),
      this.skillSummaryReader.listSkillsForProfile(profile.user_id, {
        includeGenerated: isOwner,
      }),
      this.reputationSummaryReader.getSummaryForUser(profile.user_id),
    ]);

    return presentContributorProfile({
      profile,
      viewerRelationship,
      githubStatus,
      skills,
      reputationSummary,
    });
  }
}
