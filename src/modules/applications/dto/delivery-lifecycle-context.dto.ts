import { ApplicationStatusDto } from './application-response.dto';

export interface DeliveryLifecycleApplicationContextDto {
  applicationId: string;
  contributionRequestId: string;
  contributionRequestTitle: string;
  contributorId: string;
  contributor: {
    id: string;
    username: string | null;
    displayName: string;
    avatarUrl: string | null;
  };
  applicationStatus: ApplicationStatusDto;
  deliveryDueAt: Date | null;
  assignedAt: Date | null;
}
