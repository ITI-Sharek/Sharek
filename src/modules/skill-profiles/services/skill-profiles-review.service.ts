import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SkillProfile,
  SkillProfileProficiencyLevel,
  SkillProfileReviewAction,
  SkillProfileReviewDecision,
  SkillProfileStatus,
  User,
} from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import {
  BadRequestApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../../shared/errors/application.error';
import {
  ContributorActivationResultDto,
  IdentityAccountStatusService,
} from '../../identity/services/identity-account-status.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  PendingSkillReviewItemDto,
  PendingSkillReviewsDto,
  ReviewedSkillProfileDto,
  SkillProfileReviewDecisionDto,
  SkillProfileReviewNotificationDto,
  SkillProfileReviewResultDto,
} from '../dto/admin-skill-review.dto';
import { toBoundedSkillEvidenceSources } from '../utils/skill-profile-evidence-projection.util';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_NOTE_LENGTH = 1000;

type SkillProfileWithUser = SkillProfile & { user: User };

@Injectable()
export class SkillProfilesReviewService {
  constructor(
    private readonly database: DatabaseService,
    private readonly identityAccountStatusService: IdentityAccountStatusService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listPendingReviews(input: {
    admin: AuthenticatedUser;
    page?: number;
    limit?: number;
  }): Promise<PendingSkillReviewsDto> {
    this.assertActiveAdmin(input.admin);
    const { page, limit } = this.normalizePagination(input.page, input.limit);
    const where = { status: SkillProfileStatus.pending };

    const [total, skills] = await Promise.all([
      this.database.skillProfile.count({ where }),
      this.database.skillProfile.findMany({
        where,
        include: { user: true },
        orderBy: { created_at: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: skills.map((skill) => this.presentPendingReviewItem(skill)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async approve(input: {
    admin: AuthenticatedUser;
    skillProfileId: string;
    proficiency?: SkillProfileProficiencyLevel;
    notes?: string;
  }): Promise<SkillProfileReviewResultDto> {
    const review = await this.updatePendingSkill({
      admin: input.admin,
      skillProfileId: input.skillProfileId,
      action: SkillProfileReviewAction.approve,
      newStatus: SkillProfileStatus.approved,
      proficiency: input.proficiency,
      notes: this.normalizeNotes(input.notes, { required: false }),
    });
    const activation =
      await this.identityAccountStatusService.activateContributorAfterSkillApproval(
        review.skill.contributorId,
      );
    const notification = await this.createReviewNotification({
      review,
      approved: true,
      activation,
    });

    return {
      ...review,
      activation,
      notification,
    };
  }

  async reject(input: {
    admin: AuthenticatedUser;
    skillProfileId: string;
    notes: string;
  }): Promise<SkillProfileReviewResultDto> {
    const review = await this.updatePendingSkill({
      admin: input.admin,
      skillProfileId: input.skillProfileId,
      action: SkillProfileReviewAction.reject,
      newStatus: SkillProfileStatus.rejected,
      notes: this.normalizeNotes(input.notes, { required: true }),
    });
    const notification = await this.createReviewNotification({
      review,
      approved: false,
      activation: null,
    });

    return {
      ...review,
      notification,
    };
  }

  async adjustProficiency(input: {
    admin: AuthenticatedUser;
    skillProfileId: string;
    proficiency: SkillProfileProficiencyLevel;
    notes?: string;
  }): Promise<SkillProfileReviewResultDto> {
    return this.updatePendingSkill({
      admin: input.admin,
      skillProfileId: input.skillProfileId,
      action: SkillProfileReviewAction.adjust_proficiency,
      newStatus: SkillProfileStatus.pending,
      proficiency: input.proficiency,
      notes: this.normalizeNotes(input.notes, { required: false }),
      rejectSameProficiency: true,
    });
  }

  private async createReviewNotification(input: {
    review: SkillProfileReviewResultDto;
    approved: boolean;
    activation: ContributorActivationResultDto | null;
  }): Promise<SkillProfileReviewNotificationDto> {
    const notification =
      await this.notificationsService.createSkillReviewNotification({
      userId: input.review.skill.contributorId,
      skillProfileId: input.review.skill.skillProfileId,
      skillName: input.review.skill.skillName,
      approved: input.approved,
      activated: input.activation?.activated ?? false,
    });

    return {
      notificationId: notification.notificationId,
      created: notification.created,
      deliveredRealtime: notification.deliveredRealtime,
    };
  }

  private async updatePendingSkill(input: {
    admin: AuthenticatedUser;
    skillProfileId: string;
    action: SkillProfileReviewAction;
    newStatus: SkillProfileStatus;
    proficiency?: SkillProfileProficiencyLevel;
    notes: string | null;
    rejectSameProficiency?: boolean;
  }): Promise<SkillProfileReviewResultDto> {
    this.assertActiveAdmin(input.admin);

    return this.database.$transaction(async (transaction) => {
      const skill = await transaction.skillProfile.findUnique({
        where: { id: input.skillProfileId },
        include: { user: true },
      });

      if (!skill) {
        throw new NotFoundApplicationError(
          'Skill review item was not found',
          'SKILL_PROFILE_REVIEW_NOT_FOUND',
        );
      }

      if (skill.status !== SkillProfileStatus.pending) {
        throw new ConflictApplicationError(
          'Skill review item is not pending',
          'SKILL_PROFILE_REVIEW_NOT_PENDING',
          { status: skill.status },
        );
      }

      const nextProficiency = input.proficiency ?? skill.proficiency_level;

      if (
        input.rejectSameProficiency &&
        nextProficiency === skill.proficiency_level
      ) {
        throw new ConflictApplicationError(
          'Skill already has this proficiency label',
          'SKILL_PROFILE_REVIEW_PROFICIENCY_UNCHANGED',
        );
      }

      const reviewedAt = new Date();
      const originalProficiency =
        nextProficiency !== skill.proficiency_level
          ? skill.original_proficiency ?? skill.proficiency_level
          : skill.original_proficiency;

      const updateResult = await transaction.skillProfile.updateMany({
        where: {
          id: skill.id,
          status: SkillProfileStatus.pending,
        },
        data: {
          status: input.newStatus,
          proficiency_level: nextProficiency,
          reviewed_by: input.admin.id,
          reviewed_at: reviewedAt,
          admin_notes: input.notes,
          original_proficiency: originalProficiency,
        },
      });

      if (updateResult.count !== 1) {
        throw new ConflictApplicationError(
          'Skill review item is not pending',
          'SKILL_PROFILE_REVIEW_NOT_PENDING',
        );
      }

      const [updatedSkill, decision] = await Promise.all([
        transaction.skillProfile.findUniqueOrThrow({
          where: { id: skill.id },
          include: { user: true },
        }),
        transaction.skillProfileReviewDecision.create({
          data: {
            skill_profile_id: skill.id,
            reviewer_id: input.admin.id,
            action: input.action,
            previous_status: skill.status,
            new_status: input.newStatus,
            previous_proficiency: skill.proficiency_level,
            new_proficiency: nextProficiency,
            notes: input.notes,
          },
        }),
      ]);

      return {
        skill: this.presentReviewedSkill(updatedSkill),
        decision: this.presentDecision(decision),
        activation: null,
        notification: null,
      };
    });
  }

  private assertActiveAdmin(user: AuthenticatedUser): void {
    if (user.role !== 'admin' || user.status !== 'active') {
      throw new ForbiddenApplicationError(
        'Only active admins can review skill profiles',
        'SKILL_PROFILE_REVIEW_FORBIDDEN',
      );
    }
  }

  private normalizePagination(
    page = DEFAULT_PAGE,
    limit = DEFAULT_LIMIT,
  ): { page: number; limit: number } {
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestApplicationError(
        'Page must be a positive integer',
        'SKILL_PROFILE_REVIEW_PAGE_INVALID',
      );
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestApplicationError(
        `Limit must be between 1 and ${MAX_LIMIT}`,
        'SKILL_PROFILE_REVIEW_LIMIT_INVALID',
      );
    }

    return { page, limit };
  }

  private normalizeNotes(
    value: string | undefined,
    options: { required: boolean },
  ): string | null {
    const notes = value?.trim() ?? '';

    if (options.required && notes.length === 0) {
      throw new BadRequestApplicationError(
        'Review notes are required',
        'SKILL_PROFILE_REVIEW_NOTES_REQUIRED',
      );
    }

    if (notes.length > MAX_NOTE_LENGTH) {
      throw new BadRequestApplicationError(
        `Review notes must be at most ${MAX_NOTE_LENGTH} characters`,
        'SKILL_PROFILE_REVIEW_NOTES_TOO_LONG',
      );
    }

    return notes.length > 0 ? notes : null;
  }

  private presentPendingReviewItem(
    skill: SkillProfileWithUser,
  ): PendingSkillReviewItemDto {
    return {
      skillProfileId: skill.id,
      contributorId: skill.user_id,
      contributorName: this.getContributorName(skill.user),
      contributorUsername: skill.user.username,
      generationId: skill.generation_id,
      skillName: skill.skill_name,
      proficiencyLevel: skill.proficiency_level,
      confidence: skill.confidence_score,
      status: skill.status,
      evidenceSummary: skill.evidence_summary,
      evidenceSources: toBoundedSkillEvidenceSources(
        skill.evidence_sources,
      ) as unknown as Prisma.JsonValue,
      createdAt: skill.created_at,
    };
  }

  private presentReviewedSkill(
    skill: SkillProfileWithUser,
  ): ReviewedSkillProfileDto {
    return {
      skillProfileId: skill.id,
      contributorId: skill.user_id,
      contributorName: this.getContributorName(skill.user),
      skillName: skill.skill_name,
      proficiencyLevel: skill.proficiency_level,
      confidence: skill.confidence_score,
      status: skill.status,
      evidenceSummary: skill.evidence_summary,
      evidenceSources: toBoundedSkillEvidenceSources(
        skill.evidence_sources,
      ) as unknown as Prisma.JsonValue,
      originalProficiency: skill.original_proficiency,
      adminNotes: skill.admin_notes,
      reviewedBy: skill.reviewed_by,
      reviewedAt: skill.reviewed_at,
    };
  }

  private presentDecision(
    decision: SkillProfileReviewDecision,
  ): SkillProfileReviewDecisionDto {
    return {
      decisionId: decision.id,
      skillProfileId: decision.skill_profile_id,
      reviewerId: decision.reviewer_id,
      action: decision.action,
      previousStatus: decision.previous_status,
      newStatus: decision.new_status,
      previousProficiency: decision.previous_proficiency,
      newProficiency: decision.new_proficiency,
      notes: decision.notes,
      createdAt: decision.created_at,
    };
  }

  private getContributorName(user: User): string {
    return `${user.first_name} ${user.last_name}`.trim();
  }
}
