import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { sniffImageMimeType } from '../../shared/content/file-signature';
import { DatabaseService } from '../../shared/database/database.service';
import {
  BadRequestApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';
import { BadgesService } from '../badges/badges.service';
import { GitHubAccountService } from '../github/services/github-account.service';
import { GitHubAppService } from '../github/services/github-app.service';
import { IdentityUsernameService } from '../identity/services/identity-username.service';
import { ReputationService } from '../reputation/reputation.service';
import { SkillProfileSummaryService } from '../skill-profiles/services/skill-profile-summary.service';
import {
  ContributorDirectoryPageDto,
  ContributorProfileDto,
  ContributorApplicationProfileContextDto,
  ContributorProfileWithUser,
} from './dto/contributor-profile.dto';
import { ContributorDirectoryQueryDto } from './dto/contributor-directory.dto';
import { UpdateContributorProfileRequest } from './dto/update-contributor-profile.request';
import {
  presentContributorDirectoryEntry,
  presentContributorProfile,
} from './utils/contributor-profile.presenter';
import {
  assertCanEnsureContributorProfile,
  getViewerRelationship,
  isContributorProfileVisible,
} from './validators/contributor-profile.validator';

@Injectable()
export class ContributorProfilesService {
  private readonly logger = new Logger(ContributorProfilesService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly identityUsernameService: IdentityUsernameService,
    private readonly githubAccountService: GitHubAccountService,
    private readonly skillProfileSummaryService: SkillProfileSummaryService,
    private readonly reputationService: ReputationService,
    private readonly badgesService: BadgesService,
    @Optional() private readonly githubAppService?: GitHubAppService,
  ) {}

  async getApplicationProfileContext(
    userId: string,
  ): Promise<ContributorApplicationProfileContextDto> {
    const profile = await this.findByUserId(userId);
    return {
      bio: profile?.bio ?? null,
      availability: profile?.availability ?? null,
      experienceLevel: profile?.experience_level
        ? {
            key: profile.experience_level.key,
            labelEn: profile.experience_level.label_en,
            labelAr: profile.experience_level.label_ar,
          }
        : null,
      fields:
        profile?.fields.map(({ field }) => ({
          key: field.key,
          labelEn: field.label_en,
          labelAr: field.label_ar,
        })) ?? [],
      declaredSkills: Array.isArray(profile?.declared_skills)
        ? profile.declared_skills.filter(
            (skill): skill is string => typeof skill === 'string',
          )
        : [],
    };
  }

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

  async list(
    query: ContributorDirectoryQueryDto = {},
  ): Promise<ContributorDirectoryPageDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;
    const search = query.q?.trim() || null;
    const where: Prisma.ContributorProfileWhereInput = {
      user: {
        role: UserRole.contributor,
        status: { in: [UserStatus.active, UserStatus.pending] },
        username: { not: null },
      },
      ...(search
        ? {
            OR: [
              { bio: { contains: search, mode: 'insensitive' } },
              { user: { username: { contains: search, mode: 'insensitive' } } },
              { user: { first_name: { contains: search, mode: 'insensitive' } } },
              { user: { last_name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, profiles] = await Promise.all([
      this.database.contributorProfile.count({ where }),
      this.database.contributorProfile.findMany({
        where,
        include: {
          user: true,
          experience_level: true,
          fields: { include: { field: { include: { category: true } } } },
        },
        orderBy: [
          { user: { first_name: 'asc' } },
          { user: { last_name: 'asc' } },
          { id: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      contributors: profiles.map(presentContributorDirectoryEntry),
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
      appliedFilters: { search },
    };
  }

  async update(
    viewerUserId: string,
    input: UpdateContributorProfileRequest,
  ): Promise<ContributorProfileDto> {
    const user = await this.identityUsernameService.getUserById(viewerUserId);
    assertCanEnsureContributorProfile({
      role: user.role as UserRole,
      status: user.status as UserStatus,
    });

    const userWithUsername =
      await this.identityUsernameService.ensureContributorUsernameForUser(user);
    const current =
      (await this.findByUserId(userWithUsername.id)) ??
      (await this.createForUser(userWithUsername.id));
    const fieldIds = input.fieldIds ? [...new Set(input.fieldIds)] : undefined;

    if (fieldIds) {
      const availableFields = await this.database.contributorField.count({
        where: {
          id: { in: fieldIds },
          active: true,
          category: { active: true },
        },
      });
      if (availableFields !== fieldIds.length) {
        throw new BadRequestApplicationError(
          'One or more contributor fields are unavailable',
          'CONTRIBUTOR_FIELD_INVALID',
        );
      }
    }

    if (
      input.experienceLevelId !== undefined &&
      input.experienceLevelId !== null
    ) {
      const level = await this.database.contributorExperienceLevel.findFirst({
        where: { id: input.experienceLevelId, active: true },
      });
      if (!level) {
        throw new BadRequestApplicationError(
          'Experience level is unavailable',
          'EXPERIENCE_LEVEL_INVALID',
        );
      }
    }

    await this.database.$transaction(async (transaction) => {
      await transaction.contributorProfile.update({
        where: { id: current.id },
        data: {
          ...(input.bio !== undefined
            ? { bio: this.normalizeOptionalText(input.bio) }
            : {}),
          ...(input.availability !== undefined
            ? { availability: this.normalizeOptionalText(input.availability) }
            : {}),
          ...(input.experienceLevelId !== undefined
            ? { experience_level_id: input.experienceLevelId }
            : {}),
          ...(input.declaredSkills !== undefined
            ? {
                declared_skills: this.normalizeDeclaredSkills(
                  input.declaredSkills,
                ),
              }
            : {}),
        },
      });

      if (fieldIds) {
        await transaction.contributorProfileField.deleteMany({
          where: { profile_id: current.id },
        });
        if (fieldIds.length > 0) {
          await transaction.contributorProfileField.createMany({
            data: fieldIds.map((fieldId) => ({
              profile_id: current.id,
              field_id: fieldId,
            })),
          });
        }
      }
    });

    const updated = await this.findByUserId(userWithUsername.id);
    if (!updated) {
      throw new NotFoundApplicationError(
        'Contributor profile was not found after update',
        'PROFILE_NOT_FOUND',
      );
    }
    return this.buildProfile(updated, 'owner');
  }

  async updateAvatar(
    viewerUserId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<ContributorProfileDto> {
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
    const mimeType = sniffImageMimeType(file.buffer);

    if (!mimeType || mimeType !== file.mimetype || file.size > 2_000_000) {
      throw new BadRequestApplicationError(
        'Avatar must be a PNG, JPEG, or WebP image no larger than 2 MB',
        'PROFILE_AVATAR_INVALID',
      );
    }

    await this.database.contributorProfile.update({
      where: { id: profile.id },
      data: {
        avatar_data: Uint8Array.from(file.buffer),
        avatar_mime_type: mimeType,
      },
    });
    const updated = await this.findByUserId(userWithUsername.id);
    if (!updated) {
      throw new NotFoundApplicationError(
        'Contributor profile was not found after avatar update',
        'PROFILE_NOT_FOUND',
      );
    }
    return this.buildProfile(updated, 'owner');
  }

  async getAvatar(username: string): Promise<{
    data: Buffer;
    mimeType: string;
    updatedAt: Date;
  }> {
    const profile = await this.findByUsername(username);
    if (
      !profile ||
      !isContributorProfileVisible(profile.user) ||
      !profile.avatar_data ||
      !profile.avatar_mime_type
    ) {
      throw new NotFoundApplicationError(
        'Contributor avatar was not found',
        'PROFILE_AVATAR_NOT_FOUND',
      );
    }
    return {
      data: Buffer.from(profile.avatar_data),
      mimeType: profile.avatar_mime_type,
      updatedAt: profile.updated_at,
    };
  }

  async listFields(includeInactive = false) {
    const fields = await this.database.contributorField.findMany({
      where: includeInactive
        ? undefined
        : { active: true, category: { active: true } },
      include: { category: true },
      orderBy: [
        { category: { sort_order: 'asc' } },
        { sort_order: 'asc' },
        { label_en: 'asc' },
      ],
    });
    return fields.map((field) => this.presentField(field));
  }

  async listFieldCategories(includeInactive = false) {
    const categories = await this.database.contributorFieldCategory.findMany({
      where: includeInactive ? undefined : { active: true },
      include: {
        fields: {
          where: includeInactive ? undefined : { active: true },
          include: { category: true },
          orderBy: [{ sort_order: 'asc' }, { label_en: 'asc' }],
        },
      },
      orderBy: [{ sort_order: 'asc' }, { label_en: 'asc' }],
    });
    return categories.map((category) => this.presentFieldCategory(category));
  }

  async createFieldCategory(
    admin: AuthenticatedUser,
    input: {
      key: string;
      labelEn: string;
      labelAr: string;
      sortOrder?: number;
    },
  ) {
    this.assertActiveAdmin(admin);
    try {
      const category = await this.database.contributorFieldCategory.create({
        data: {
          key: input.key,
          label_en: input.labelEn.trim(),
          label_ar: input.labelAr.trim(),
          sort_order: input.sortOrder ?? 0,
        },
        include: { fields: true },
      });
      return this.presentFieldCategory(category);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictApplicationError(
          'Contributor field category key already exists',
          'CONTRIBUTOR_FIELD_CATEGORY_KEY_TAKEN',
        );
      }
      throw error;
    }
  }

  async updateFieldCategory(
    admin: AuthenticatedUser,
    categoryId: string,
    input: {
      labelEn?: string;
      labelAr?: string;
      active?: boolean;
      sortOrder?: number;
    },
  ) {
    this.assertActiveAdmin(admin);
    try {
      const category = await this.database.contributorFieldCategory.update({
        where: { id: categoryId },
        data: {
          ...(input.labelEn !== undefined
            ? { label_en: input.labelEn.trim() }
            : {}),
          ...(input.labelAr !== undefined
            ? { label_ar: input.labelAr.trim() }
            : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.sortOrder !== undefined
            ? { sort_order: input.sortOrder }
            : {}),
        },
        include: { fields: true },
      });
      return this.presentFieldCategory(category);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundApplicationError(
          'Contributor field category was not found',
          'CONTRIBUTOR_FIELD_CATEGORY_NOT_FOUND',
        );
      }
      throw error;
    }
  }

  async createField(
    admin: AuthenticatedUser,
    input: {
      categoryId: string;
      key: string;
      labelEn: string;
      labelAr: string;
      sortOrder?: number;
    },
  ) {
    this.assertActiveAdmin(admin);
    try {
      const category = await this.database.contributorFieldCategory.findUnique({
        where: { id: input.categoryId },
      });
      if (!category) {
        throw new BadRequestApplicationError(
          'Contributor field category is unavailable',
          'CONTRIBUTOR_FIELD_CATEGORY_INVALID',
        );
      }
      const field = await this.database.contributorField.create({
        data: {
          category_id: input.categoryId,
          key: input.key,
          label_en: input.labelEn.trim(),
          label_ar: input.labelAr.trim(),
          sort_order: input.sortOrder ?? 0,
        },
        include: { category: true },
      });
      return this.presentField(field);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictApplicationError(
          'Contributor field key already exists',
          'CONTRIBUTOR_FIELD_KEY_TAKEN',
        );
      }
      throw error;
    }
  }

  async updateField(
    admin: AuthenticatedUser,
    fieldId: string,
    input: {
      categoryId?: string;
      labelEn?: string;
      labelAr?: string;
      active?: boolean;
      sortOrder?: number;
    },
  ) {
    this.assertActiveAdmin(admin);
    try {
      if (input.categoryId !== undefined) {
        const category = await this.database.contributorFieldCategory.findUnique({
          where: { id: input.categoryId },
        });
        if (!category) {
          throw new BadRequestApplicationError(
            'Contributor field category is unavailable',
            'CONTRIBUTOR_FIELD_CATEGORY_INVALID',
          );
        }
      }
      const field = await this.database.contributorField.update({
        where: { id: fieldId },
        data: {
          ...(input.categoryId !== undefined
            ? { category_id: input.categoryId }
            : {}),
          ...(input.labelEn !== undefined
            ? { label_en: input.labelEn.trim() }
            : {}),
          ...(input.labelAr !== undefined
            ? { label_ar: input.labelAr.trim() }
            : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.sortOrder !== undefined
            ? { sort_order: input.sortOrder }
            : {}),
        },
        include: { category: true },
      });
      return this.presentField(field);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundApplicationError(
          'Contributor field was not found',
          'CONTRIBUTOR_FIELD_NOT_FOUND',
        );
      }
      throw error;
    }
  }

  async listExperienceLevels(includeInactive = false) {
    const levels = await this.database.contributorExperienceLevel.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ sort_order: 'asc' }, { label_en: 'asc' }],
    });
    return levels.map((level) => this.presentExperienceLevel(level));
  }

  async createExperienceLevel(
    admin: AuthenticatedUser,
    input: {
      key: string;
      labelEn: string;
      labelAr: string;
      sortOrder?: number;
    },
  ) {
    this.assertActiveAdmin(admin);
    try {
      const level = await this.database.contributorExperienceLevel.create({
        data: {
          key: input.key,
          label_en: input.labelEn.trim(),
          label_ar: input.labelAr.trim(),
          sort_order: input.sortOrder ?? 0,
        },
      });
      return this.presentExperienceLevel(level);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictApplicationError(
          'Experience level key already exists',
          'EXPERIENCE_LEVEL_KEY_TAKEN',
        );
      }
      throw error;
    }
  }

  async updateExperienceLevel(
    admin: AuthenticatedUser,
    levelId: string,
    input: {
      labelEn?: string;
      labelAr?: string;
      active?: boolean;
      sortOrder?: number;
    },
  ) {
    this.assertActiveAdmin(admin);
    try {
      const level = await this.database.contributorExperienceLevel.update({
        where: { id: levelId },
        data: {
          ...(input.labelEn !== undefined
            ? { label_en: input.labelEn.trim() }
            : {}),
          ...(input.labelAr !== undefined
            ? { label_ar: input.labelAr.trim() }
            : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.sortOrder !== undefined
            ? { sort_order: input.sortOrder }
            : {}),
        },
      });
      return this.presentExperienceLevel(level);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundApplicationError(
          'Experience level was not found',
          'EXPERIENCE_LEVEL_NOT_FOUND',
        );
      }
      throw error;
    }
  }

  private async buildProfile(
    profile: ContributorProfileWithUser,
    viewerRelationship: 'owner' | 'authenticated-viewer',
  ): Promise<ContributorProfileDto> {
    const [githubStatus, skills, reputationSummary, githubInstallations, badges] =
      await Promise.all([
        this.githubAccountService.getStatusForUser(profile.user_id),
        this.skillProfileSummaryService.listSkillsForProfile(profile.user_id, {
          includeGenerated: viewerRelationship === 'owner',
        }),
        this.reputationService.getSummaryForUser(profile.user_id),
        this.listGitHubInstallationsSafely(profile.user_id, viewerRelationship),
        this.badgesService.listForUser(profile.user_id),
      ]);

    return presentContributorProfile({
      profile,
      viewerRelationship,
      githubStatus,
      skills,
      reputationSummary,
      githubInstallations,
      badges: badges.map((badge) => ({
        id: badge.id,
        badgeType: badge.badgeType,
        awardedAt: badge.awardedAt,
      })),
    });
  }

  /**
   * GitHub is optional and must never block profile creation or viewing. A
   * provider outage — or a stale generated client — degrades to "no
   * installations" instead of failing `ensure`/profile reads.
   */
  private async listGitHubInstallationsSafely(
    userId: string,
    viewerRelationship: 'owner' | 'authenticated-viewer',
  ): Promise<ContributorProfileDto['githubInstallations']> {
    if (viewerRelationship !== 'owner' || !this.githubAppService) {
      return [];
    }

    try {
      const installations =
        await this.githubAppService.listInstallationLinks(userId);
      return installations.map((installation) => ({
        installationLinkId: installation.installationLinkId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        status: installation.status,
        verifiedAt: installation.verifiedAt,
        manageUrl: installation.manageUrl,
        repositories: installation.repositories.map((repository) => ({
          repositoryId: repository.repositoryId,
          fullName: repository.fullName,
          visibility: repository.visibility,
          defaultBranch: repository.defaultBranch,
        })),
      }));
    } catch (error) {
      this.logger.error(
        `Failed to read GitHub App installations for user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return [];
    }
  }

  private findByUserId(
    userId: string,
  ): Promise<ContributorProfileWithUser | null> {
    return this.database.contributorProfile.findUnique({
      where: { user_id: userId },
      include: {
        user: true,
        experience_level: true,
        fields: { include: { field: { include: { category: true } } } },
      },
    });
  }

  private findByUsername(
    username: string,
  ): Promise<ContributorProfileWithUser | null> {
    return this.database.contributorProfile.findFirst({
      where: { user: { username } },
      include: {
        user: true,
        experience_level: true,
        fields: { include: { field: { include: { category: true } } } },
      },
    });
  }

  private async createForUser(
    userId: string,
  ): Promise<ContributorProfileWithUser> {
    try {
      return await this.database.contributorProfile.create({
        data: { user_id: userId },
        include: {
          user: true,
          experience_level: true,
          fields: { include: { field: { include: { category: true } } } },
        },
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

  private normalizeOptionalText(value: string | null): string | null {
    return value?.trim() || null;
  }

  private normalizeDeclaredSkills(skills: string[]): string[] {
    const normalized = skills
      .map((skill) => skill.trim())
      .filter(Boolean)
      .filter(
        (skill, index, values) =>
          values.findIndex(
            (candidate) => candidate.toLowerCase() === skill.toLowerCase(),
          ) === index,
      );
    if (normalized.length > 30) {
      throw new BadRequestApplicationError(
        'A maximum of 30 declared skills is allowed',
        'DECLARED_SKILLS_LIMIT_EXCEEDED',
      );
    }
    return normalized;
  }


  private assertActiveAdmin(admin: AuthenticatedUser): void {
    if (admin.role !== 'admin' || admin.status !== 'active') {
      throw new ForbiddenApplicationError(
        'Active admin access is required',
        'ADMIN_ACCESS_REQUIRED',
      );
    }
  }

  private presentField(field: {
    id: string;
    category_id: string;
    key: string;
    label_en: string;
    label_ar: string;
    active: boolean;
    sort_order: number;
    category?: {
      id: string;
      key: string;
      label_en: string;
      label_ar: string;
    } | null;
  }) {
    return {
      id: field.id,
      categoryId: field.category_id,
      key: field.key,
      labelEn: field.label_en,
      labelAr: field.label_ar,
      active: field.active,
      sortOrder: field.sort_order,
      category: field.category
        ? {
            id: field.category.id,
            key: field.category.key,
            labelEn: field.category.label_en,
            labelAr: field.category.label_ar,
          }
        : null,
    };
  }

  private presentFieldCategory(category: {
    id: string;
    key: string;
    label_en: string;
    label_ar: string;
    active: boolean;
    sort_order: number;
    fields: Array<{
      id: string;
      category_id: string;
      key: string;
      label_en: string;
      label_ar: string;
      active: boolean;
      sort_order: number;
      category?: {
        id: string;
        key: string;
        label_en: string;
        label_ar: string;
      } | null;
    }>;
  }) {
    return {
      id: category.id,
      key: category.key,
      labelEn: category.label_en,
      labelAr: category.label_ar,
      active: category.active,
      sortOrder: category.sort_order,
      fields: category.fields.map((field) => this.presentField(field)),
    };
  }

  private presentExperienceLevel(level: {
    id: string;
    key: string;
    label_en: string;
    label_ar: string;
    active: boolean;
    sort_order: number;
  }) {
    return {
      id: level.id,
      key: level.key,
      labelEn: level.label_en,
      labelAr: level.label_ar,
      active: level.active,
      sortOrder: level.sort_order,
    };
  }
}
