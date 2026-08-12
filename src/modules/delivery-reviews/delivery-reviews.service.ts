import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  Delivery,
  DeliveryReviewOutcome,
  DeliveryStatus,
  Prisma,
} from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { DatabaseService } from '../../shared/database/database.service';
import {
  BadRequestApplicationError,
  ConflictApplicationError,
  ForbiddenApplicationError,
  NotFoundApplicationError,
} from '../../shared/errors/application.error';
import { ApplicationsService } from '../applications/applications.service';
import { DeliveryLifecycleApplicationContextDto } from '../applications/dto/delivery-lifecycle-context.dto';
import { ContributionTasksService } from '../contribution-tasks/services/contribution-tasks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DeliveryApprovedEventsService } from './delivery-approved-events.service';
import { DeliveryReviewOutcomeInput } from './dto/delivery-input.dto';
import {
  DeliveryDetailDto,
  DeliveryDto,
  DeliveryLifecycleDto,
  DeliveryLifecycleStatusDto,
  DeliveryStatusDto,
  OwnerDeliveryReviewQueueDto,
} from './dto/delivery-output.dto';

const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DELIVERY_DETAIL_INCLUDE = {
  deliverySubmissions: { orderBy: { submission_number: 'asc' as const } },
  deliveryReviews: { orderBy: { submission_number: 'asc' as const } },
  contributor: {
    select: {
      id: true,
      username: true,
      first_name: true,
      last_name: true,
      avatar_url: true,
    },
  },
} satisfies Prisma.DeliveryInclude;

type DeliveryDetail = Prisma.DeliveryGetPayload<{
  include: typeof DELIVERY_DETAIL_INCLUDE;
}>;

export interface SubmitDeliveryInput {
  actor: AuthenticatedUser;
  applicationId: string;
  pullRequestUrl: string;
  contributorNotes?: string;
  idempotencyKey?: string;
}

export interface UpdateDeliveryInput {
  actor: AuthenticatedUser;
  deliveryId: string;
  pullRequestUrl: string;
  contributorNotes?: string;
  idempotencyKey?: string;
}

export interface ReviewDeliveryInput {
  actor: AuthenticatedUser;
  deliveryId: string;
  outcome: DeliveryReviewOutcomeInput;
  rating?: number;
  feedback?: string;
  idempotencyKey?: string;
}

@Injectable()
export class DeliveryReviewsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly applications: ApplicationsService,
    private readonly contributionTasks: ContributionTasksService,
    private readonly notifications: NotificationsService,
    private readonly approvedEvents: DeliveryApprovedEventsService,
  ) {}

  async submit(input: SubmitDeliveryInput): Promise<DeliveryDto> {
    this.assertActiveContributor(input.actor);
    const idempotencyKey = this.normalizeRequiredIdempotencyKey(
      input.idempotencyKey,
    );
    const contributorNotes = input.contributorNotes?.trim() || null;
    const fingerprint = this.fingerprint({
      applicationId: input.applicationId,
      pullRequestUrl: input.pullRequestUrl,
      contributorNotes,
    });
    let result;
    try {
      result = await this.database.$transaction(async (transaction) => {
        const application =
          await this.applications.lockDeliverySubmissionContext({
            applicationId: input.applicationId,
            contributorId: input.actor.id,
            transaction,
          });
        const { ownerId } =
          await this.contributionTasks.lockContributionRequestOwnerContext({
            requestId: application.contributionRequestId,
            transaction,
          });
        const existing = await transaction.delivery.findUnique({
          where: { application_id: application.applicationId },
        });
        if (existing) {
          if (existing.submission_idempotency_key === idempotencyKey) {
            if (
              existing.submission_fingerprint &&
              existing.submission_fingerprint !== fingerprint
            ) {
              throw new ConflictApplicationError(
                'Idempotency-Key was already used for different Delivery content',
                'IDEMPOTENCY_KEY_REUSED',
              );
            }
            return { delivery: existing, notification: null };
          }
          throw new ConflictApplicationError(
            'A Delivery already exists for this Application',
            'DELIVERY_ALREADY_SUBMITTED',
          );
        }

        const delivery = await transaction.delivery.create({
          data: {
            application_id: application.applicationId,
            contribution_request_id: application.contributionRequestId,
            contributor_id: application.contributorId,
            pr_url: input.pullRequestUrl,
            contributor_notes: contributorNotes,
            status: DeliveryStatus.submitted,
            submitted_at: new Date(),
            submission_idempotency_key: idempotencyKey,
            submission_fingerprint: fingerprint,
          },
        });
        await transaction.deliverySubmission.create({
          data: {
            delivery_id: delivery.id,
            submission_number: 1,
            contributor_id: delivery.contributor_id,
            pr_url: delivery.pr_url,
            contributor_notes: delivery.contributor_notes,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            submitted_at: delivery.submitted_at,
          },
        });
        const notification =
          await this.notifications.createDeliveryNotification(
            {
              userId: ownerId,
              deliveryId: delivery.id,
              contributionRequestId: delivery.contribution_request_id,
              action: 'submitted',
              submissionNumber: 1,
            },
            { transaction, emitRealtime: false },
          );
        return { delivery, notification };
      });
    } catch (error) {
      if (!this.isUniqueConstraint(error)) throw error;
      return this.resolveSubmitUniqueConflict(
        input,
        idempotencyKey,
        fingerprint,
      );
    }

    this.emitCreatedNotification(result.notification);
    return this.toDeliveryDto(result.delivery);
  }

  async getForActor(
    actor: AuthenticatedUser,
    deliveryId: string,
  ): Promise<DeliveryDetailDto> {
    if (actor.status !== 'active') {
      throw new ForbiddenApplicationError(
        'The Delivery is not available',
        'DELIVERY_NOT_AUTHORIZED',
      );
    }
    const delivery = await this.database.delivery.findUnique({
      where: { id: deliveryId },
      include: DELIVERY_DETAIL_INCLUDE,
    });
    if (!delivery) {
      throw new NotFoundApplicationError(
        'Delivery was not found',
        'DELIVERY_NOT_FOUND',
      );
    }
    if (actor.role === 'contributor' && delivery.contributor_id === actor.id) {
      return this.toDeliveryDetailDto(delivery);
    }
    if (actor.role === 'owner') {
      await this.contributionTasks.confirmOwnerDecisionActor({
        requestId: delivery.contribution_request_id,
        ownerId: actor.id,
      });
      return this.toDeliveryDetailDto(delivery);
    }
    throw new ForbiddenApplicationError(
      'The Delivery is not available',
      'DELIVERY_NOT_AUTHORIZED',
    );
  }

  async listReviewQueue(
    actor: AuthenticatedUser,
  ): Promise<OwnerDeliveryReviewQueueDto> {
    this.assertActiveOwner(actor);
    const scopes =
      await this.contributionTasks.listDeliveryReviewScopesForOwner(actor.id);
    if (scopes.length === 0) return { deliveries: [] };
    const scopeByRequestId = new Map(
      scopes.map((scope) => [scope.contributionRequestId, scope]),
    );
    const deliveries = await this.database.delivery.findMany({
      where: {
        contribution_request_id: { in: [...scopeByRequestId.keys()] },
        status: {
          in: [DeliveryStatus.submitted, DeliveryStatus.resubmitted],
        },
      },
      orderBy: [{ submitted_at: 'asc' }, { id: 'asc' }],
      include: {
        contributor: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
            avatar_url: true,
          },
        },
      },
    });
    return {
      deliveries: deliveries.map((delivery) => {
        const scope = scopeByRequestId.get(delivery.contribution_request_id)!;
        return {
          ...this.toDeliveryDto(delivery),
          contributor: this.toContributorDto(delivery.contributor),
          contributionRequest: {
            id: scope.contributionRequestId,
            title: scope.title,
            requirements: scope.requirements.map((requirement) => ({
              kind: requirement.kind.toUpperCase(),
              position: requirement.position,
              text: requirement.text,
            })),
          },
        };
      }),
    };
  }

  async listContributorLifecycle(
    actor: AuthenticatedUser,
  ): Promise<DeliveryLifecycleDto> {
    this.assertActiveContributor(actor);
    const contexts =
      await this.applications.listDeliveryLifecycleContextsForContributor(
        actor.id,
      );
    return this.composeLifecycle(contexts);
  }

  async listOwnerLifecycle(
    actor: AuthenticatedUser,
  ): Promise<DeliveryLifecycleDto> {
    this.assertActiveOwner(actor);
    const scopes =
      await this.contributionTasks.listDeliveryLifecycleScopesForOwner(actor.id);
    const contexts =
      await this.applications.listDeliveryLifecycleContextsForOwner(
        scopes.map((scope) => scope.contributionRequestId),
      );
    return this.composeLifecycle(contexts);
  }

  private async composeLifecycle(
    contexts: DeliveryLifecycleApplicationContextDto[],
  ): Promise<DeliveryLifecycleDto> {
    if (contexts.length === 0) return { contributions: [] };
    const deliveries = await this.database.delivery.findMany({
      where: {
        application_id: {
          in: contexts.map((context) => context.applicationId),
        },
      },
    });
    const deliveryByApplicationId = new Map(
      deliveries.map((delivery) => [delivery.application_id, delivery]),
    );
    return {
      contributions: contexts.map((context) => {
        const delivery = deliveryByApplicationId.get(context.applicationId);
        return {
          applicationId: context.applicationId,
          contributionRequestId: context.contributionRequestId,
          contributionRequestTitle: context.contributionRequestTitle,
          contributor: context.contributor,
          applicationStatus: context.applicationStatus,
          deliveryDueAt: context.deliveryDueAt,
          assignedAt: context.assignedAt,
          lifecycleStatus: this.composedLifecycleStatus(context, delivery),
          deliveryStatus: delivery
            ? (delivery.status.toUpperCase() as DeliveryStatusDto)
            : context.applicationStatus === 'ACCEPTED'
              ? ('NOT_STARTED' as const)
              : null,
          delivery: delivery ? this.toDeliveryDto(delivery) : null,
        };
      }),
    };
  }

  private composedLifecycleStatus(
    context: DeliveryLifecycleApplicationContextDto,
    delivery: Delivery | undefined,
  ): DeliveryLifecycleStatusDto {
    if (context.applicationStatus !== 'ACCEPTED') {
      return context.applicationStatus;
    }
    if (!delivery) return 'AWAITING_DELIVERY';
    if (
      delivery.status === DeliveryStatus.submitted ||
      delivery.status === DeliveryStatus.resubmitted
    ) {
      return 'DELIVERY_SUBMITTED';
    }
    if (delivery.status === DeliveryStatus.changes_requested) {
      return 'CHANGES_REQUESTED';
    }
    if (delivery.status === DeliveryStatus.rejected) {
      return 'DELIVERY_REJECTED';
    }
    return 'COMPLETED';
  }

  async update(input: UpdateDeliveryInput): Promise<DeliveryDto> {
    this.assertActiveContributor(input.actor);
    const idempotencyKey = this.normalizeRequiredIdempotencyKey(
      input.idempotencyKey,
    );
    const contributorNotes = input.contributorNotes?.trim() || null;
    const fingerprint = this.fingerprint({
      deliveryId: input.deliveryId,
      pullRequestUrl: input.pullRequestUrl,
      contributorNotes,
    });

    let result;
    try {
      result = await this.database.$transaction(async (transaction) => {
        const current = await this.lockDelivery(transaction, input.deliveryId);
        if (!current || current.contributor_id !== input.actor.id) {
          throw new ForbiddenApplicationError(
            'The Delivery is not available for update',
            'DELIVERY_NOT_AUTHORIZED',
          );
        }
        const replay = await transaction.deliverySubmission.findUnique({
          where: {
            contributor_id_idempotency_key: {
              contributor_id: input.actor.id,
              idempotency_key: idempotencyKey,
            },
          },
        });
        if (replay) {
          this.assertSubmissionReplay(replay, input.deliveryId, fingerprint);
          return { delivery: current, notification: null };
        }

        await this.applications.lockDeliverySubmissionContext({
          applicationId: current.application_id,
          contributorId: input.actor.id,
          transaction,
        });
        const { ownerId } =
          await this.contributionTasks.lockContributionRequestOwnerContext({
            requestId: current.contribution_request_id,
            transaction,
          });
        if (
          current.status !== DeliveryStatus.submitted &&
          current.status !== DeliveryStatus.changes_requested
        ) {
          throw new ConflictApplicationError(
            'The Delivery can no longer be updated',
            'DELIVERY_NOT_EDITABLE',
            { status: current.status },
          );
        }

        const isResubmission =
          current.status === DeliveryStatus.changes_requested;
        const submissionNumber = current.submission_number + 1;
        const submittedAt = new Date();
        const updated = await transaction.delivery.update({
          where: { id: current.id },
          data: {
            pr_url: input.pullRequestUrl,
            contributor_notes: contributorNotes,
            status: isResubmission
              ? DeliveryStatus.resubmitted
              : DeliveryStatus.submitted,
            submission_number: submissionNumber,
            submitted_at: submittedAt,
            reviewed_at: null,
          },
        });
        await transaction.deliverySubmission.create({
          data: {
            delivery_id: current.id,
            submission_number: submissionNumber,
            contributor_id: input.actor.id,
            pr_url: input.pullRequestUrl,
            contributor_notes: contributorNotes,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            submitted_at: submittedAt,
          },
        });
        const notification =
          await this.notifications.createDeliveryNotification(
            {
              userId: ownerId,
              deliveryId: current.id,
              contributionRequestId: current.contribution_request_id,
              action: isResubmission ? 'resubmitted' : 'submitted',
              submissionNumber,
            },
            { transaction, emitRealtime: false },
          );
        return { delivery: updated, notification };
      });
    } catch (error) {
      if (!this.isUniqueConstraint(error)) throw error;
      return this.resolveUpdateUniqueConflict(
        input,
        idempotencyKey,
        fingerprint,
      );
    }
    this.emitCreatedNotification(result.notification);
    return this.toDeliveryDto(result.delivery);
  }

  async review(input: ReviewDeliveryInput): Promise<DeliveryDto> {
    this.assertActiveOwner(input.actor);
    const idempotencyKey = this.normalizeRequiredIdempotencyKey(
      input.idempotencyKey,
    );
    const contract = this.normalizeReviewContract(input);
    const fingerprint = this.fingerprint({
      deliveryId: input.deliveryId,
      ...contract,
    });
    let result;
    try {
      result = await this.database.$transaction(async (transaction) => {
        const current = await this.lockDelivery(transaction, input.deliveryId);
        if (!current) {
          throw new ForbiddenApplicationError(
            'The Delivery is not available for review',
            'DELIVERY_NOT_AUTHORIZED',
          );
        }
        const { ownerId } =
          await this.contributionTasks.lockContributionRequestOwnerContext({
            requestId: current.contribution_request_id,
            transaction,
          });
        if (ownerId !== input.actor.id) {
          throw new ForbiddenApplicationError(
            'Only the current Project owner can review this Delivery',
            'DELIVERY_NOT_AUTHORIZED',
          );
        }
        const replay = await transaction.deliveryReview.findUnique({
          where: {
            reviewer_id_idempotency_key: {
              reviewer_id: input.actor.id,
              idempotency_key: idempotencyKey,
            },
          },
        });
        if (replay) {
          this.assertReviewReplay(replay, input.deliveryId, fingerprint);
          return { delivery: current, notification: null };
        }
        if (
          current.status !== DeliveryStatus.submitted &&
          current.status !== DeliveryStatus.resubmitted
        ) {
          throw new ConflictApplicationError(
            'Only a submitted Delivery can be reviewed',
            'DELIVERY_NOT_REVIEWABLE',
            { status: current.status },
          );
        }

        const reviewId = randomUUID();
        const reviewedAt = new Date();
        await transaction.deliveryReview.create({
          data: {
            id: reviewId,
            delivery_id: current.id,
            reviewer_id: input.actor.id,
            submission_number: current.submission_number,
            rating: contract.rating,
            feedback: contract.feedback,
            outcome: contract.outcome,
            idempotency_key: idempotencyKey,
            command_fingerprint: fingerprint,
            created_at: reviewedAt,
          },
        });
        const updated = await transaction.delivery.update({
          where: { id: current.id },
          data: {
            status: this.deliveryStatusForOutcome(contract.outcome),
            reviewed_at: reviewedAt,
          },
        });
        if (contract.outcome === DeliveryReviewOutcome.approved) {
          await this.contributionTasks.completeFromDeliveryReview({
            requestId: current.contribution_request_id,
            ownerId: input.actor.id,
            deliveryId: current.id,
            deliveryReviewId: reviewId,
            idempotencyKey,
            commandFingerprint: fingerprint,
            transaction,
          });
          await this.approvedEvents.append(
            {
              eventId: randomUUID(),
              deliveryId: current.id,
              deliveryReviewId: reviewId,
              contributorId: current.contributor_id,
              contributionRequestId: current.contribution_request_id,
              rating: contract.rating!,
              occurredAt: reviewedAt,
            },
            transaction,
          );
        }
        const notification =
          await this.notifications.createDeliveryNotification(
            {
              userId: current.contributor_id,
              deliveryId: current.id,
              contributionRequestId: current.contribution_request_id,
              action: contract.outcome,
              submissionNumber: current.submission_number,
              rating: contract.rating,
              feedback: contract.feedback,
            },
            { transaction, emitRealtime: false },
          );
        return { delivery: updated, notification };
      });
    } catch (error) {
      if (!this.isUniqueConstraint(error)) throw error;
      return this.resolveReviewUniqueConflict(
        input,
        idempotencyKey,
        fingerprint,
      );
    }

    this.emitCreatedNotification(result.notification);
    return this.toDeliveryDto(result.delivery);
  }

  private assertActiveContributor(actor: AuthenticatedUser): void {
    if (actor.status !== 'active' || actor.role !== 'contributor') {
      throw new ForbiddenApplicationError(
        'Only active contributors can submit a Delivery',
        'DELIVERY_NOT_AUTHORIZED',
      );
    }
  }

  private emitCreatedNotification(
    notification: { created: boolean; notificationId: string } | null,
  ): void {
    if (notification?.created) {
      void this.notifications.emitNotificationCreated(
        notification.notificationId,
      );
    }
  }

  private assertActiveOwner(actor: AuthenticatedUser): void {
    if (actor.status !== 'active' || actor.role !== 'owner') {
      throw new ForbiddenApplicationError(
        'Only active Project owners can review a Delivery',
        'DELIVERY_NOT_AUTHORIZED',
      );
    }
  }

  private normalizeReviewContract(input: ReviewDeliveryInput): {
    outcome: DeliveryReviewOutcome;
    rating: number | null;
    feedback: string | null;
  } {
    const outcome = this.toDeliveryReviewOutcome(input.outcome);
    const feedback = input.feedback?.trim() || null;
    if (outcome === DeliveryReviewOutcome.approved) {
      if (
        !Number.isInteger(input.rating) ||
        (input.rating ?? 0) < 1 ||
        (input.rating ?? 0) > 5
      ) {
        throw new BadRequestApplicationError(
          'A 1–5 rating is required when approving a Delivery',
          'DELIVERY_RATING_REQUIRED',
        );
      }
      return { outcome, rating: input.rating!, feedback };
    }
    if (!feedback) {
      throw new BadRequestApplicationError(
        'Feedback is required when requesting changes or rejecting a Delivery',
        'DELIVERY_FEEDBACK_REQUIRED',
      );
    }
    return { outcome, rating: null, feedback };
  }

  private deliveryStatusForOutcome(
    outcome: DeliveryReviewOutcome,
  ): DeliveryStatus {
    if (outcome === DeliveryReviewOutcome.approved) {
      return DeliveryStatus.approved;
    }
    if (outcome === DeliveryReviewOutcome.changes_requested) {
      return DeliveryStatus.changes_requested;
    }
    return DeliveryStatus.rejected;
  }

  private toDeliveryReviewOutcome(
    outcome: DeliveryReviewOutcomeInput,
  ): DeliveryReviewOutcome {
    if (outcome === 'APPROVED') return DeliveryReviewOutcome.approved;
    if (outcome === 'CHANGES_REQUESTED') {
      return DeliveryReviewOutcome.changes_requested;
    }
    return DeliveryReviewOutcome.rejected;
  }

  private normalizeRequiredIdempotencyKey(value?: string): string {
    const normalized = value?.trim();
    if (!normalized || !IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
      throw new BadRequestApplicationError(
        normalized
          ? 'Idempotency-Key must be a UUIDv4'
          : 'Idempotency-Key header is required',
        normalized ? 'IDEMPOTENCY_KEY_INVALID' : 'IDEMPOTENCY_KEY_REQUIRED',
      );
    }
    return normalized;
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private async lockDelivery(
    transaction: Prisma.TransactionClient,
    deliveryId: string,
  ): Promise<Delivery | null> {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "Delivery"
      WHERE "id" = ${deliveryId}::uuid
      FOR UPDATE
    `);
    if (!rows[0]) return null;
    return transaction.delivery.findUnique({ where: { id: deliveryId } });
  }

  private assertSubmissionReplay(
    replay: {
      delivery_id: string;
      command_fingerprint: string | null;
    },
    deliveryId: string,
    fingerprint: string,
  ): void {
    if (
      replay.delivery_id !== deliveryId ||
      replay.command_fingerprint !== fingerprint
    ) {
      throw new ConflictApplicationError(
        'Idempotency-Key was already used for different Delivery content',
        'IDEMPOTENCY_KEY_REUSED',
      );
    }
  }

  private assertReviewReplay(
    replay: {
      delivery_id: string;
      command_fingerprint: string | null;
    },
    deliveryId: string,
    fingerprint: string,
  ): void {
    if (
      replay.delivery_id !== deliveryId ||
      replay.command_fingerprint !== fingerprint
    ) {
      throw new ConflictApplicationError(
        'Idempotency-Key was already used for a different Delivery review',
        'IDEMPOTENCY_KEY_REUSED',
      );
    }
  }

  private async resolveSubmitUniqueConflict(
    input: SubmitDeliveryInput,
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<DeliveryDto> {
    const existing = await this.database.delivery.findUnique({
      where: { application_id: input.applicationId },
    });
    if (
      existing?.submission_idempotency_key === idempotencyKey &&
      existing.submission_fingerprint === fingerprint
    ) {
      return this.toDeliveryDto(existing);
    }
    if (existing) {
      throw new ConflictApplicationError(
        'A Delivery already exists for this Application',
        'DELIVERY_ALREADY_SUBMITTED',
      );
    }
    throw new ConflictApplicationError(
      'Idempotency-Key was already used for different Delivery content',
      'IDEMPOTENCY_KEY_REUSED',
    );
  }

  private async resolveUpdateUniqueConflict(
    input: UpdateDeliveryInput,
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<DeliveryDto> {
    const replay = await this.database.deliverySubmission.findUnique({
      where: {
        contributor_id_idempotency_key: {
          contributor_id: input.actor.id,
          idempotency_key: idempotencyKey,
        },
      },
    });
    if (replay) {
      this.assertSubmissionReplay(replay, input.deliveryId, fingerprint);
      const delivery = await this.database.delivery.findUnique({
        where: { id: replay.delivery_id },
      });
      if (delivery) return this.toDeliveryDto(delivery);
    }
    throw new ConflictApplicationError(
      'The Delivery changed concurrently; retry with a new Idempotency-Key',
      'DELIVERY_CONCURRENT_MODIFICATION',
    );
  }

  private async resolveReviewUniqueConflict(
    input: ReviewDeliveryInput,
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<DeliveryDto> {
    const replay = await this.database.deliveryReview.findUnique({
      where: {
        reviewer_id_idempotency_key: {
          reviewer_id: input.actor.id,
          idempotency_key: idempotencyKey,
        },
      },
    });
    if (replay) {
      this.assertReviewReplay(replay, input.deliveryId, fingerprint);
      const delivery = await this.database.delivery.findUnique({
        where: { id: replay.delivery_id },
      });
      if (delivery) {
        await this.contributionTasks.confirmOwnerDecisionActor({
          requestId: delivery.contribution_request_id,
          ownerId: input.actor.id,
        });
        return this.toDeliveryDto(delivery);
      }
    }
    throw new ConflictApplicationError(
      'The Delivery changed concurrently; retry with a new Idempotency-Key',
      'DELIVERY_CONCURRENT_MODIFICATION',
    );
  }

  private isUniqueConstraint(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private toDeliveryDto(delivery: {
    id: string;
    application_id: string;
    contribution_request_id: string;
    contributor_id: string;
    pr_url: string;
    contributor_notes: string | null;
    status: DeliveryStatus;
    submitted_at: Date;
    reviewed_at: Date | null;
    submission_number?: number;
  }): DeliveryDto {
    return {
      id: delivery.id,
      applicationId: delivery.application_id,
      contributionRequestId: delivery.contribution_request_id,
      contributorId: delivery.contributor_id,
      pullRequestUrl: delivery.pr_url,
      contributorNotes: delivery.contributor_notes,
      status: delivery.status.toUpperCase() as DeliveryStatusDto,
      submittedAt: delivery.submitted_at,
      reviewedAt: delivery.reviewed_at,
      submissionNumber: delivery.submission_number ?? 1,
    };
  }

  private toDeliveryDetailDto(delivery: DeliveryDetail): DeliveryDetailDto {
    return {
      ...this.toDeliveryDto(delivery),
      contributor: this.toContributorDto(delivery.contributor),
      submissions: delivery.deliverySubmissions.map((submission) => ({
        submissionNumber: submission.submission_number,
        pullRequestUrl: submission.pr_url,
        contributorNotes: submission.contributor_notes,
        submittedAt: submission.submitted_at,
      })),
      reviews: delivery.deliveryReviews.map((review) => ({
        id: review.id,
        submissionNumber: review.submission_number,
        reviewerId: review.reviewer_id,
        outcome: review.outcome.toUpperCase() as
          | 'APPROVED'
          | 'CHANGES_REQUESTED'
          | 'REJECTED',
        rating: review.rating,
        feedback: review.feedback,
        createdAt: review.created_at,
      })),
    };
  }

  private toContributorDto(contributor: {
    id: string;
    username: string | null;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  }) {
    return {
      id: contributor.id,
      username: contributor.username,
      displayName: `${contributor.first_name} ${contributor.last_name}`.trim(),
      avatarUrl: contributor.avatar_url,
    };
  }
}
