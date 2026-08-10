import { NotificationType } from '@prisma/client';

export type NotificationLanguage = 'ar' | 'en';

export type NotificationPriorityValue = 'urgent' | 'attention' | 'ambient';

export interface ApplicationNotificationParameters {
  applicationId: string;
  contributionRequestId: string;
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

export interface ConversationActivityNotificationParameters {
  conversationId: string;
  messageId: string;
  senderName: string;
  messagePreview: string;
  messageCount: number;
}

export interface LegacyNotificationParameters {
  legacyTitle: string;
  legacyBody: string;
}

export interface NotificationTemplateParameterMap {
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
  'conversation.activity': ConversationActivityNotificationParameters;
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
