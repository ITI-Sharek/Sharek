import { Injectable } from '@nestjs/common';
import { Prisma, ReportReason } from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { DatabaseService } from '../../../shared/database/database.service';
import { ConflictApplicationError } from '../../../shared/errors/application.error';
import { ApplicationsService } from '../../applications/applications.service';
import { DecisionFeedbackReportDto } from '../dto/decision-feedback-report.response';

@Injectable()
export class DecisionFeedbackReportsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly applications: ApplicationsService,
  ) {}

  async create(input: {
    actor: AuthenticatedUser;
    ownerDecisionId: string;
    reason: ReportReason;
    description: string;
  }): Promise<DecisionFeedbackReportDto> {
    const context = await this.applications.getOwnerDecisionReportContext(
      input.actor,
      input.ownerDecisionId,
    );
    try {
      const report = await this.database.report.create({
        data: {
          reporter_id: input.actor.id,
          reported_user_id: context.ownerId,
          reported_content_id: context.ownerDecisionId,
          reported_content_type: 'owner_decision',
          owner_decision_id: context.ownerDecisionId,
          reason: input.reason,
          description: input.description.trim(),
        },
      });
      return {
        id: report.id,
        ownerDecisionId: context.ownerDecisionId,
        reason: report.reason,
        description: report.description,
        status: report.status,
        createdAt: report.created_at,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictApplicationError(
          'This Owner Decision was already reported',
          'OWNER_DECISION_REPORT_ALREADY_EXISTS',
        );
      }
      throw error;
    }
  }
}
