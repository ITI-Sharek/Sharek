import { Injectable } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';

import { DatabaseService } from '../../shared/database/database.service';
import { NotFoundApplicationError } from '../../shared/errors/application.error';
import { GitHubAccountService } from '../github/services/github-account.service';
import { IdentityUsernameService } from '../identity/services/identity-username.service';
import { ReputationService } from '../reputation/reputation.service';
import { SkillProfileSummaryService } from '../skill-profiles/services/skill-profile-summary.service';
import {
  ContributorProfileDto,
  ContributorProfileWithUser,
} from './dto/contributor-profile.dto';
import { presentContributorProfile } from './utils/contributor-profile.presenter';
import {
  assertCanEnsureContributorProfile,
  getViewerRelationship,
  isContributorProfileVisible,
} from './validators/contributor-profile.validator';

@Injectable()
export class ContributorProfilesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly identityUsernameService: IdentityUsernameService,
    private readonly githubAccountService: GitHubAccountService,
    private readonly skillProfileSummaryService: SkillProfileSummaryService,
    private readonly reputationService: ReputationService,
  ) {}

  async ensure(viewerUserId: string): Promise<ContributorProfileDto> {
    const user = await this.identityUsernameService.getUserById(viewerUserId);

    assertCanEnsureContributorProfile({
      role: user.role as UserRole,
      status: user.status as UserStatus,
    });

    const userWithUsername =
      await this.identityUsernameService.ensureContributorUsernameForUser(user);
    const profile =
      (await this.findByUserId(userWithUsername.id)) ??
      (await this.createForUser(userWithUsername.id));

    return this.buildProfile(profile, 'owner');
  }

  async getByUsername(
    viewerUserId: string,
    username: string,
  ): Promise<ContributorProfileDto> {
    const profile = await this.findByUsername(username);

    if (!profile || !isContributorProfileVisible(profile.user)) {
      throw new NotFoundApplicationError(
        'Contributor profile was not found',
        'PROFILE_NOT_FOUND',
      );
    }

    return this.buildProfile(
      profile,
      getViewerRelationship(viewerUserId, profile.user_id),
    );
  }

  private async buildProfile(
    profile: ContributorProfileWithUser,
    viewerRelationship: 'owner' | 'authenticated-viewer',
  ): Promise<ContributorProfileDto> {
    const [githubStatus, skills, reputationSummary] = await Promise.all([
      this.githubAccountService.getStatusForUser(profile.user_id),
      this.skillProfileSummaryService.listSkillsForProfile(profile.user_id, {
        includeGenerated: viewerRelationship === 'owner',
      }),
      this.reputationService.getSummaryForUser(profile.user_id),
    ]);

    return presentContributorProfile({
      profile,
      viewerRelationship,
      githubStatus,
      skills,
      reputationSummary,
    });
  }

  private findByUserId(
    userId: string,
  ): Promise<ContributorProfileWithUser | null> {
    return this.database.contributorProfile.findUnique({
      where: { user_id: userId },
      include: { user: true },
    });
  }

  private findByUsername(
    username: string,
  ): Promise<ContributorProfileWithUser | null> {
    return this.database.contributorProfile.findFirst({
      where: { user: { username } },
      include: { user: true },
    });
  }

  private async createForUser(
    userId: string,
  ): Promise<ContributorProfileWithUser> {
    try {
      return await this.database.contributorProfile.create({
        data: { user_id: userId },
        include: { user: true },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const existing = await this.findByUserId(userId);
        if (existing) {
          return existing;
        }
      }

      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002') ||
      (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002')
    );
  }
}
