import { NotificationType } from '@prisma/client';

export type NotificationLanguage = 'ar' | 'en';

export type NotificationPriorityValue = 'urgent' | 'attention' | 'ambient';

export interface ApplicationNotificationParameters {
  applicationId: string;
  contributionRequestId: string;
}

export interface DeliveryNotificationParameters {
  deliveryId: string;
  contributionRequestId: string;
  submissionNumber: number;
  rating?: number;
  feedback?: string;
}

export interface ProposalNotificationParameters {
  proposalId: string;
  projectId: string;
  revisionRequestSequence?: number;
  resultingContributionRequestId?: string;
}

export interface SkillReviewNotificationParameters {
  skillProfileId: string;
  skillName: string;
}

export type SkillProfileGenerationNotificationStatus =
  | 'ready_for_review'
  | 'needs_more_evidence'
  | 'failed';

export interface SkillProfileGenerationNotificationParameters {
  generationId: string;
  status: SkillProfileGenerationNotificationStatus;
  audience: 'contributor' | 'admin';
  skillCount?: number;
  selectedRepositoryCount?: number;
}

export interface ConversationActivityNotificationParameters {
  conversationId: string;
  messageId: string;
  senderName: string;
  messagePreview: string;
  messageCount: number;
}

export type MatchNotificationKind =
  | 'owner_invite'
  | 'gold_auto_match'
  | 'skill_matched_task';

export interface MatchFoundNotificationParameters {
  contributionRequestId: string;
  requestTitle: string;
  audience: 'contributor' | 'owner';
  notificationKind: MatchNotificationKind;
  matchScore?: number;
  matchedSkills?: string[];
}

export interface TaskRecommendationNotificationParameters {
  contributionRequestId: string;
  requestTitle: string;
  matchScore: number;
  matchedSkills: string[];
}

export interface LegacyNotificationParameters {
  legacyTitle: string;
  legacyBody: string;
}

export interface NotificationTemplateParameterMap {
  'delivery.submitted': DeliveryNotificationParameters;
  'delivery.resubmitted': DeliveryNotificationParameters;
  'delivery.approved': DeliveryNotificationParameters;
  'delivery.changes_requested': DeliveryNotificationParameters;
  'delivery.rejected': DeliveryNotificationParameters;
  'application.accepted': ApplicationNotificationParameters;
  'application.submitted': ApplicationNotificationParameters;
  'application.withdrawn': ApplicationNotificationParameters;
  'application.declined_by_owner': ApplicationNotificationParameters;
  'application.not_selected': ApplicationNotificationParameters;
  'application.owner_review_reminder': ApplicationNotificationParameters;
  'application.expired': ApplicationNotificationParameters;
  'proposal.revision_requested': ProposalNotificationParameters;
  'proposal.accepted': ProposalNotificationParameters;
  'proposal.declined': ProposalNotificationParameters;
  'skill_review.activated': SkillReviewNotificationParameters;
  'skill_review.approved': SkillReviewNotificationParameters;
  'skill_review.not_approved': SkillReviewNotificationParameters;
  'skill_profile_generation.ready_for_review': SkillProfileGenerationNotificationParameters;
  'skill_profile_generation.needs_more_evidence': SkillProfileGenerationNotificationParameters;
  'skill_profile_generation.failed': SkillProfileGenerationNotificationParameters;
  'conversation.activity': ConversationActivityNotificationParameters;
  'match.found': MatchFoundNotificationParameters;
  'task.recommendation': TaskRecommendationNotificationParameters;
  'system.legacy': LegacyNotificationParameters;
}

export type NotificationTemplateKey = keyof NotificationTemplateParameterMap;
export type NotificationTemplateParameters =
  NotificationTemplateParameterMap[NotificationTemplateKey];

export interface NotificationTemplatePolicy {
  category: NotificationType;
  priority: NotificationPriorityValue;
}

export interface NotificationParameterContract {
  required: readonly string[];
  validate: (parameters: unknown) => NotificationTemplateParameters;
}

export interface NotificationTemplateDefinition {
  key: NotificationTemplateKey;
  version: number;
  category: NotificationType;
  priority: NotificationPriorityValue;
  parameterContract: NotificationParameterContract;
  render: Record<
    NotificationLanguage,
    (parameters: Record<string, unknown>) => { title: string; body: string }
  >;
  buildDeepLink: (parameters: Record<string, unknown>) => string | null;
}
