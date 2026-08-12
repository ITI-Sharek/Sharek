export type DeliveryStatusDto =
  | 'SUBMITTED'
  | 'CHANGES_REQUESTED'
  | 'RESUBMITTED'
  | 'APPROVED'
  | 'REJECTED';

export type DeliveryLifecycleStatusDto =
  | 'PENDING_OWNER_REVIEW'
  | 'DECLINED_BY_OWNER'
  | 'NOT_SELECTED'
  | 'EXPIRED'
  | 'WITHDRAWN'
  | 'REQUEST_CANCELLED'
  | 'AWAITING_DELIVERY'
  | 'DELIVERY_SUBMITTED'
  | 'CHANGES_REQUESTED'
  | 'DELIVERY_REJECTED'
  | 'COMPLETED';

export type DeliveryEvidenceStatusDto = 'NOT_STARTED' | DeliveryStatusDto;

export interface DeliveryDto {
  id: string;
  applicationId: string;
  contributionRequestId: string;
  contributorId: string;
  pullRequestUrl: string;
  contributorNotes: string | null;
  status: DeliveryStatusDto;
  submittedAt: Date;
  reviewedAt: Date | null;
  submissionNumber: number;
}

export interface DeliveryContributorDto {
  id: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
}

export interface DeliveryDetailDto extends DeliveryDto {
  contributor: DeliveryContributorDto;
  submissions: Array<{
    submissionNumber: number;
    pullRequestUrl: string;
    contributorNotes: string | null;
    submittedAt: Date;
  }>;
  reviews: Array<{
    id: string;
    submissionNumber: number;
    reviewerId: string;
    outcome: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
    rating: number | null;
    feedback: string | null;
    createdAt: Date;
  }>;
}

export interface OwnerDeliveryReviewQueueDto {
  deliveries: Array<
    DeliveryDto & {
      contributor: DeliveryContributorDto;
      contributionRequest: {
        id: string;
        title: string;
        requirements: Array<{
          kind: string;
          position: number;
          text: string;
        }>;
      };
    }
  >;
}

export interface DeliveryLifecycleDto {
  contributions: Array<{
    applicationId: string;
    contributionRequestId: string;
    contributionRequestTitle: string;
    contributor: DeliveryContributorDto;
    applicationStatus:
      | 'PENDING_OWNER_REVIEW'
      | 'ACCEPTED'
      | 'DECLINED_BY_OWNER'
      | 'NOT_SELECTED'
      | 'EXPIRED'
      | 'WITHDRAWN'
      | 'REQUEST_CANCELLED';
    deliveryDueAt: Date | null;
    assignedAt: Date | null;
    lifecycleStatus: DeliveryLifecycleStatusDto;
    deliveryStatus: DeliveryEvidenceStatusDto | null;
    delivery: DeliveryDto | null;
  }>;
}

export interface DeliveryApprovedFactDto {
  eventId: string;
  deliveryId: string;
  deliveryReviewId: string;
  contributorId: string;
  contributionRequestId: string;
  rating: number;
  occurredAt: Date;
}
