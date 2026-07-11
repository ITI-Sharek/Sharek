import { Injectable } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';

import { IdentityUsernameService } from '../../../identity/application/use-cases/identity-username.service';
import { ContributorProfileDto } from '../dto/contributor-profile.dto';
import { ContributorProfileRepository } from '../ports/contributor-profile.repository';
import {
  GitHubProfileStatusReader,
  ReputationSummaryReader,
  SkillProfileSummaryReader,
} from '../ports/profile-readers.port';
import {
  assertCanEnsureContributorProfile,
} from '../../domain/policies/contributor-profile.policy';
import { presentContributorProfile } from './contributor-profile-presenter';

export interface EnsureContributorProfileInput {
  viewerUserId: string;
}

@Injectable()
export class EnsureContributorProfileUseCase {
  constructor(
    private readonly identityUsernameService: IdentityUsernameService,
    private readonly profiles: ContributorProfileRepository,
    private readonly githubStatusReader: GitHubProfileStatusReader,
    private readonly skillSummaryReader: SkillProfileSummaryReader,
    private readonly reputationSummaryReader: ReputationSummaryReader,
  ) {}

  async execute(input: EnsureContributorProfileInput): Promise<ContributorProfileDto> {
    const user = await this.identityUsernameService.getUserById(input.viewerUserId);

    assertCanEnsureContributorProfile({
      role: user.role as UserRole,
      status: user.status as UserStatus,
    });

    const userWithUsername =
      await this.identityUsernameService.ensureContributorUsernameForUser(user);
    const profile =
      (await this.profiles.findByUserId(userWithUsername.id)) ??
      (await this.profiles.createForUser(userWithUsername.id));

    const [githubStatus, skills, reputationSummary] = await Promise.all([
      this.githubStatusReader.getStatusForUser(userWithUsername.id),
      this.skillSummaryReader.listSkillsForProfile(userWithUsername.id, {
        includeGenerated: true,
      }),
      this.reputationSummaryReader.getSummaryForUser(userWithUsername.id),
    ]);

    return presentContributorProfile({
      profile,
      viewerRelationship: 'owner',
      githubStatus,
      skills,
      reputationSummary,
    });
  }
}
