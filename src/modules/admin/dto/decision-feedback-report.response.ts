import { ReportReason, ReportStatus } from '@prisma/client';

export interface DecisionFeedbackReportDto {
  id: string;
  ownerDecisionId: string;
  reason: ReportReason;
  description: string;
  status: ReportStatus;
  createdAt: Date;
}
