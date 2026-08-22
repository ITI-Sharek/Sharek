import { Injectable } from '@nestjs/common';
import { ApplicationStatus, Prisma } from '@prisma/client';

import { DatabaseService } from '../../../shared/database/database.service';
import {
  ConflictApplicationError,
  ForbiddenApplicationError,
} from '../../../shared/errors/application.error';
import { DeliveryLifecycleApplicationContextDto } from '../dto/delivery-lifecycle-context.dto';
import { toApplicationStatusDto } from '../mappers/application.mapper';

/**
 * The Delivery-facing read and lock surface of Applications: the row lock a
 * Delivery submission must take before writing, and the Application progression
 * both lifecycle endpoints compose deliveries against.
 */
@Injectable()
export class ApplicationDeliveryContextService {
  constructor(private readonly database: DatabaseService) {}

  async lockDeliverySubmissionContext(input: {
    applicationId: string;
    contributorId: string;
    transaction: Prisma.TransactionClient;
  }): Promise<{
    applicationId: string;
    contributionRequestId: string;
    contributorId: string;
    status: ApplicationStatus;
  }> {
    const applications = await input.transaction.$queryRaw<
      Array<{
        id: string;
        contribution_request_id: string;
        contributor_id: string;
        status: ApplicationStatus;
      }>
    >(Prisma.sql`
        SELECT "id", "contribution_request_id", "contributor_id", "status"
        FROM "Application"
        WHERE "id" = ${input.applicationId}::uuid
        FOR UPDATE
      `);
    const application = applications[0];
    if (!application || application.contributor_id !== input.contributorId) {
      throw new ForbiddenApplicationError(
        'The Application is not available for Delivery submission',
        'DELIVERY_NOT_AUTHORIZED',
      );
    }
    if (application.status !== ApplicationStatus.accepted) {
      throw new ConflictApplicationError(
        'Only an accepted Application can submit a Delivery',
        'APPLICATION_NOT_ACCEPTED',
        { status: application.status },
      );
    }
    return {
      applicationId: application.id,
      contributionRequestId: application.contribution_request_id,
      contributorId: application.contributor_id,
      status: application.status,
    };
  }

  async listDeliveryLifecycleContextsForContributor(
    contributorId: string,
  ): Promise<DeliveryLifecycleApplicationContextDto[]> {
    return this.listDeliveryLifecycleContexts({ contributor_id: contributorId });
  }

  async listDeliveryLifecycleContextsForOwner(
    contributionRequestIds: string[],
  ): Promise<DeliveryLifecycleApplicationContextDto[]> {
    if (contributionRequestIds.length === 0) return [];
    return this.listDeliveryLifecycleContexts({
      contribution_request_id: { in: contributionRequestIds },
    });
  }

  private async listDeliveryLifecycleContexts(
    where: Prisma.ApplicationWhereInput,
  ): Promise<DeliveryLifecycleApplicationContextDto[]> {
    const applications = await this.database.application.findMany({
      where,
      select: {
        id: true,
        contribution_request_id: true,
        contributor_id: true,
        status: true,
        contributionRequest: { select: { title: true } },
        contributor: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
            avatar_url: true,
          },
        },
        assignment: {
          select: {
            agreed_delivery_due_at: true,
            assigned_at: true,
          },
        },
      },
      orderBy: [{ submitted_at: 'desc' }, { id: 'desc' }],
    });
    return applications.map((application) => ({
      applicationId: application.id,
      contributionRequestId: application.contribution_request_id,
      contributionRequestTitle: application.contributionRequest.title,
      contributorId: application.contributor_id,
      contributor: {
        id: application.contributor.id,
        username: application.contributor.username,
        displayName:
          `${application.contributor.first_name} ${application.contributor.last_name}`.trim(),
        avatarUrl: application.contributor.avatar_url,
      },
      applicationStatus: toApplicationStatusDto(application.status),
      deliveryDueAt: application.assignment?.agreed_delivery_due_at ?? null,
      assignedAt: application.assignment?.assigned_at ?? null,
    }));
  }
}
