import { NotificationType } from '@prisma/client';

import {
  ApplicationNotificationParameters,
  LegacyNotificationParameters,
  NotificationLanguage,
  NotificationParameterContract,
  NotificationPriorityValue,
  NotificationTemplateDefinition,
  NotificationTemplateKey,
  NotificationTemplateParameterMap,
  NotificationTemplateParameters,
  NotificationTemplatePolicy,
  ProposalNotificationParameters,
  SkillProfileGenerationNotificationParameters,
  SkillProfileGenerationNotificationStatus,
  SkillReviewNotificationParameters,
  ConversationActivityNotificationParameters,
  DeliveryNotificationParameters,
  BadgeNotificationParameters,
  ChatAttachmentBlockedNotificationParameters,
  AssignmentCallMissedNotificationParameters,
} from './notification-template.types';

export const NOTIFICATION_TEMPLATE_KEYS = [
  'delivery.submitted',
  'delivery.resubmitted',
  'delivery.approved',
  'delivery.changes_requested',
  'delivery.rejected',
  'application.accepted',
  'application.submitted',
  'application.withdrawn',
  'application.declined_by_owner',
  'application.not_selected',
  'application.owner_review_reminder',
  'application.expired',
  'proposal.revision_requested',
  'proposal.accepted',
  'proposal.declined',
  'skill_review.activated',
  'skill_review.approved',
  'skill_review.not_approved',
  'skill_profile_generation.ready_for_review',
  'skill_profile_generation.needs_more_evidence',
  'skill_profile_generation.failed',
  'conversation.activity',
  'chat_attachment.blocked',
  'assignment_call.missed',
  'system.legacy',
  'achievement.first_contribution',
] as const satisfies readonly NotificationTemplateKey[];

const APPLICATION_ACTIONS = [
  'submitted',
  'withdrawn',
  'owner_review_reminder',
] as const;

type ApplicationNotificationAction =
  | 'submitted'
  | 'withdrawn'
  | 'accepted'
  | 'declined_by_owner'
  | 'not_selected'
  | 'owner_review_reminder'
  | 'expired';

const POLICY: Readonly<Record<NotificationTemplateKey, NotificationTemplatePolicy>> = {
  'delivery.submitted': {
    category: NotificationType.delivery_update,
    priority: 'attention',
  },
  'delivery.resubmitted': {
    category: NotificationType.delivery_update,
    priority: 'attention',
  },
  'delivery.approved': {
    category: NotificationType.delivery_update,
    priority: 'attention',
  },
  'delivery.changes_requested': {
    category: NotificationType.delivery_update,
    priority: 'attention',
  },
  'delivery.rejected': {
    category: NotificationType.delivery_update,
    priority: 'attention',
  },
  'application.accepted': {
    category: NotificationType.application_status,
    priority: 'attention',
  },
  'application.submitted': {
    category: NotificationType.application_status,
    priority: 'attention',
  },
  'application.withdrawn': {
    category: NotificationType.application_status,
    priority: 'attention',
  },
  'application.declined_by_owner': {
    category: NotificationType.application_status,
    priority: 'attention',
  },
  'application.not_selected': {
    category: NotificationType.application_status,
    priority: 'attention',
  },
  'application.owner_review_reminder': {
    category: NotificationType.application_status,
    priority: 'attention',
  },
  'application.expired': {
    category: NotificationType.application_status,
    priority: 'attention',
  },
  'proposal.revision_requested': {
    category: NotificationType.proposal_status,
    priority: 'attention',
  },
  'proposal.accepted': {
    category: NotificationType.proposal_status,
    priority: 'attention',
  },
  'proposal.declined': {
    category: NotificationType.proposal_status,
    priority: 'attention',
  },
  'skill_review.activated': {
    category: NotificationType.skill_review,
    priority: 'attention',
  },
  'skill_review.approved': {
    category: NotificationType.skill_review,
    priority: 'attention',
  },
  'skill_review.not_approved': {
    category: NotificationType.skill_review,
    priority: 'attention',
  },
  'skill_profile_generation.ready_for_review': {
    category: NotificationType.skill_profile_generation,
    priority: 'attention',
  },
  'skill_profile_generation.needs_more_evidence': {
    category: NotificationType.skill_profile_generation,
    priority: 'attention',
  },
  'skill_profile_generation.failed': {
    category: NotificationType.skill_profile_generation,
    priority: 'attention',
  },
  'conversation.activity': {
    category: NotificationType.conversation_activity,
    priority: 'attention',
  },
  'chat_attachment.blocked': {
    category: NotificationType.moderation,
    priority: 'attention',
  },
  'assignment_call.missed': {
    category: NotificationType.assignment_call,
    priority: 'urgent',
  },
  'system.legacy': {
    category: NotificationType.system,
    priority: 'ambient',
  },
  'achievement.first_contribution': {
    category: NotificationType.achievement,
    priority: 'ambient',
  },
};

const APPLICATION_COPY: Record<
  ApplicationNotificationAction,
  Record<NotificationLanguage, { title: string; body: string }>
> = {
  accepted: {
    en: {
      title: 'Application accepted',
      body: 'Your Application was accepted and an Assignment was created.',
    },
    ar: {
      title: 'تم قبول طلب المساهمة',
      body: 'تم قبول طلب مساهمتك وإنشاء تكليف لك.',
    },
  },
  submitted: {
    en: {
      title: 'New Application received',
      body: 'A contributor submitted an Application for your Contribution Request.',
    },
    ar: {
      title: 'تم استلام طلب مساهمة جديد',
      body: 'قدّم مساهم طلبًا للمساهمة في طلب مشاركتك.',
    },
  },
  withdrawn: {
    en: {
      title: 'Application withdrawn',
      body: 'A contributor withdrew an Application from your Contribution Request.',
    },
    ar: {
      title: 'تم سحب طلب المساهمة',
      body: 'سحب مساهم طلبه من طلب مشاركتك.',
    },
  },
  declined_by_owner: {
    en: {
      title: 'Application declined by owner',
      body: 'The Project owner declined your Application. This decision affects only this Application.',
    },
    ar: {
      title: 'رفض مالك المشروع طلب المساهمة',
      body: 'رفض مالك المشروع طلبك. يؤثر هذا القرار في هذا الطلب فقط.',
    },
  },
  not_selected: {
    en: {
      title: 'Another contributor was selected',
      body: 'Another contributor was selected for this Contribution Request. This does not affect your eligibility or reputation.',
    },
    ar: {
      title: 'تم اختيار مساهم آخر',
      body: 'تم اختيار مساهم آخر لهذا الطلب. لا يؤثر ذلك في أهليتك أو سمعتك.',
    },
  },
  owner_review_reminder: {
    en: {
      title: 'Application awaiting review',
      body: 'An Application for your Contribution Request has been waiting for review for 3 days.',
    },
    ar: {
      title: 'طلب مساهمة في انتظار المراجعة',
      body: 'ينتظر طلب مساهمة في طلب مشاركتك المراجعة منذ 3 أيام.',
    },
  },
  expired: {
    en: {
      title: 'Application review window expired',
      body: 'Your Application expired because it was not reviewed within 7 days. This is not an owner rejection and does not affect your eligibility or reputation.',
    },
    ar: {
      title: 'انتهت مهلة مراجعة طلب المساهمة',
      body: 'انتهت صلاحية طلبك لأنه لم يُراجع خلال 7 أيام. لا يُعد ذلك رفضًا ولا يؤثر في أهليتك أو سمعتك.',
    },
  },
};

const DELIVERY_COPY: Record<
  'submitted' | 'resubmitted' | 'approved' | 'changes_requested' | 'rejected',
  Record<NotificationLanguage, { title: string; body: string }>
> = {
  submitted: {
    en: {
      title: 'Delivery submitted',
      body: 'A contributor submitted a Delivery for your Contribution Request.',
    },
    ar: {
      title: 'تم تسليم العمل',
      body: 'قدّم مساهم تسليمًا لطلب المساهمة الخاص بك.',
    },
  },
  resubmitted: {
    en: {
      title: 'Delivery resubmitted',
      body: 'A contributor resubmitted a Delivery after addressing your feedback.',
    },
    ar: {
      title: 'أُعيد تسليم العمل',
      body: 'أعاد مساهم تسليم العمل بعد معالجة ملاحظاتك.',
    },
  },
  approved: {
    en: {
      title: 'Delivery approved',
      body: 'The Project owner approved your Delivery. Your contribution is complete.',
    },
    ar: {
      title: 'تم اعتماد التسليم',
      body: 'اعتمد مالك المشروع تسليمك. اكتملت مساهمتك.',
    },
  },
  changes_requested: {
    en: {
      title: 'Delivery changes requested',
      body: 'The Project owner requested changes to your Delivery. Review the feedback and resubmit.',
    },
    ar: {
      title: 'طُلبت تعديلات على التسليم',
      body: 'طلب مالك المشروع تعديلات على تسليمك. راجع الملاحظات وأعد التسليم.',
    },
  },
  rejected: {
    en: {
      title: 'Delivery not approved',
      body: 'The Project owner did not approve your Delivery. Review the feedback.',
    },
    ar: {
      title: 'لم يتم اعتماد التسليم',
      body: 'لم يعتمد مالك المشروع تسليمك. راجع الملاحظات.',
    },
  },
};

const BADGE_COPY: Record<
  'first_contribution',
  Record<NotificationLanguage, { title: string; body: string }>
> = {
  first_contribution: {
    en: {
      title: 'Badge earned: First Contribution',
      body: 'Your first Delivery was approved. Keep contributing to earn more badges.',
    },
    ar: {
      title: 'وسام جديد: أول مساهمة',
      body: 'تم اعتماد أول تسليم لك. واصل المساهمة لكسب المزيد من الأوسمة.',
    },
  },
};

const APPLICATION_PARAMETER_CONTRACT: NotificationParameterContract = {
  required: ['applicationId', 'contributionRequestId'],
  validate: (parameters) =>
    validateApplicationParameters(parameters) as NotificationTemplateParameters,
};

const DELIVERY_PARAMETER_CONTRACT: NotificationParameterContract = {
  required: ['deliveryId', 'contributionRequestId', 'submissionNumber'],
  validate: (parameters) =>
    validateDeliveryParameters(parameters) as NotificationTemplateParameters,
};

const PROPOSAL_PARAMETER_CONTRACT: NotificationParameterContract = {
  required: ['proposalId', 'projectId'],
  validate: (parameters) =>
    validateProposalParameters(parameters) as NotificationTemplateParameters,
};

const SKILL_PARAMETER_CONTRACT: NotificationParameterContract = {
  required: ['skillProfileId', 'skillName'],
  validate: (parameters) =>
    validateSkillParameters(parameters) as NotificationTemplateParameters,
};

const SKILL_GENERATION_PARAMETER_CONTRACT: NotificationParameterContract = {
  required: ['generationId', 'status', 'audience'],
  validate: (parameters) =>
    validateSkillGenerationParameters(
      parameters,
    ) as NotificationTemplateParameters,
};

const CONVERSATION_PARAMETER_CONTRACT: NotificationParameterContract = {
  required: [
    'conversationId',
    'messageId',
    'senderName',
    'messagePreview',
    'messageCount',
  ],
  validate: (parameters) =>
    validateConversationParameters(parameters) as NotificationTemplateParameters,
};

const CHAT_ATTACHMENT_BLOCKED_PARAMETER_CONTRACT: NotificationParameterContract = {
  required: ['conversationId', 'filename'],
  validate: (parameters) =>
    validateChatAttachmentBlockedParameters(
      parameters,
    ) as NotificationTemplateParameters,
};

const ASSIGNMENT_CALL_MISSED_PARAMETER_CONTRACT: NotificationParameterContract = {
  required: ['conversationId', 'callId', 'callerName'],
  validate: (parameters) =>
    validateAssignmentCallMissedParameters(
      parameters,
    ) as NotificationTemplateParameters,
};

const LEGACY_PARAMETER_CONTRACT: NotificationParameterContract = {
  required: ['legacyTitle', 'legacyBody'],
  validate: (parameters) =>
    validateLegacyParameters(parameters) as NotificationTemplateParameters,
};

const BADGE_PARAMETER_CONTRACT: NotificationParameterContract = {
  required: ['badgeType'],
  validate: (parameters) =>
    validateBadgeParameters(parameters) as NotificationTemplateParameters,
};

function validateApplicationParameters(
  parameters: unknown,
): ApplicationNotificationParameters {
  const record = requireRecord(parameters);
  return {
    applicationId: requiredString(record, 'applicationId'),
    contributionRequestId: requiredString(record, 'contributionRequestId'),
  };
}

function validateDeliveryParameters(
  parameters: unknown,
): DeliveryNotificationParameters {
  const record = requireRecord(parameters);
  const feedback = record.feedback;
  if (feedback !== undefined && (typeof feedback !== 'string' || !feedback.trim())) {
    throw invalidParameters();
  }
  const rating = record.rating;
  if (
    rating !== undefined &&
    (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5)
  ) {
    throw invalidParameters();
  }
  return {
    deliveryId: requiredString(record, 'deliveryId'),
    contributionRequestId: requiredString(record, 'contributionRequestId'),
    submissionNumber: requiredPositiveInteger(record, 'submissionNumber'),
    ...(typeof rating === 'number' ? { rating } : {}),
    ...(typeof feedback === 'string' ? { feedback: feedback.trim() } : {}),
  };
}

function validateProposalParameters(
  parameters: unknown,
): ProposalNotificationParameters {
  const record = requireRecord(parameters);
  const revisionRequestSequence = record.revisionRequestSequence;
  if (
    revisionRequestSequence !== undefined &&
    (typeof revisionRequestSequence !== 'number' ||
      !Number.isInteger(revisionRequestSequence) ||
      revisionRequestSequence < 1)
  ) {
    throw invalidParameters();
  }

  return {
    proposalId: requiredString(record, 'proposalId'),
    projectId: requiredString(record, 'projectId'),
    ...(revisionRequestSequence === undefined ? {} : { revisionRequestSequence }),
    ...(record.resultingContributionRequestId === undefined
      ? {}
      : {
          resultingContributionRequestId: requiredString(
            record,
            'resultingContributionRequestId',
          ),
        }),
  };
}

function validateSkillParameters(
  parameters: unknown,
): SkillReviewNotificationParameters {
  const record = requireRecord(parameters);
  return {
    skillProfileId: requiredString(record, 'skillProfileId'),
    skillName: requiredString(record, 'skillName'),
  };
}

function validateSkillGenerationParameters(
  parameters: unknown,
): SkillProfileGenerationNotificationParameters {
  const record = requireRecord(parameters);
  const status = record.status;
  if (
    status !== 'ready_for_review' &&
    status !== 'needs_more_evidence' &&
    status !== 'failed'
  ) {
    throw invalidParameters();
  }
  const audience = record.audience;
  if (audience !== 'contributor' && audience !== 'admin') {
    throw invalidParameters();
  }

  return {
    generationId: requiredString(record, 'generationId'),
    status,
    audience,
    ...(record.skillCount === undefined
      ? {}
      : { skillCount: optionalNonNegativeInteger(record, 'skillCount') }),
    ...(record.selectedRepositoryCount === undefined
      ? {}
      : {
          selectedRepositoryCount: optionalNonNegativeInteger(
            record,
            'selectedRepositoryCount',
          ),
        }),
  };
}

function validateConversationParameters(
  parameters: unknown,
): ConversationActivityNotificationParameters {
  const record = requireRecord(parameters);
  return {
    conversationId: requiredString(record, 'conversationId'),
    messageId: requiredString(record, 'messageId'),
    senderName: requiredString(record, 'senderName'),
    messagePreview: requiredString(record, 'messagePreview'),
    messageCount: requiredPositiveInteger(record, 'messageCount'),
  };
}

function validateChatAttachmentBlockedParameters(
  parameters: unknown,
): ChatAttachmentBlockedNotificationParameters {
  const record = requireRecord(parameters);
  return {
    conversationId: requiredString(record, 'conversationId'),
    filename: requiredString(record, 'filename'),
  };
}

function validateAssignmentCallMissedParameters(
  parameters: unknown,
): AssignmentCallMissedNotificationParameters {
  const record = requireRecord(parameters);
  return {
    conversationId: requiredString(record, 'conversationId'),
    callId: requiredString(record, 'callId'),
    callerName: requiredString(record, 'callerName'),
  };
}

function validateLegacyParameters(
  parameters: unknown,
): LegacyNotificationParameters {
  const record = requireRecord(parameters);
  return {
    legacyTitle: requiredString(record, 'legacyTitle'),
    legacyBody: requiredString(record, 'legacyBody'),
  };
}

function validateBadgeParameters(
  parameters: unknown,
): BadgeNotificationParameters {
  const record = requireRecord(parameters);
  if (record.badgeType !== 'first_contribution') throw invalidParameters();
  return { badgeType: record.badgeType };
}

function requireRecord(parameters: unknown): Record<string, unknown> {
  if (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters)) {
    throw invalidParameters();
  }
  return parameters as Record<string, unknown>;
}

function requiredString(parameters: Record<string, unknown>, key: string): string {
  const value = parameters[key];
  if (typeof value !== 'string' || value.trim() === '') throw invalidParameters();
  return value;
}

function requiredPositiveInteger(
  parameters: Record<string, unknown>,
  key: string,
): number {
  const value = parameters[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw invalidParameters();
  }
  return value;
}

function optionalNonNegativeInteger(
  parameters: Record<string, unknown>,
  key: string,
): number {
  const value = parameters[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw invalidParameters();
  }
  return value;
}

function invalidParameters(): Error {
  return new Error('NOTIFICATION_PARAMETERS_INVALID');
}

function safeIdentifier(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalidParameters();
  return encodeURIComponent(value);
}

export function buildApplicationNotificationDeepLink(
  action: ApplicationNotificationAction,
  parameters: ApplicationNotificationParameters,
): string {
  const validated = validateApplicationParameters(parameters);
  const applicationId = safeIdentifier(validated.applicationId);
  const contributionRequestId = safeIdentifier(
    validated.contributionRequestId,
  );
  const usesRequest = APPLICATION_ACTIONS.includes(
    action as (typeof APPLICATION_ACTIONS)[number],
  );
  return usesRequest
    ? `/contribution-requests/${contributionRequestId}`
    : `/applications/${applicationId}`;
}

export function buildProposalNotificationDeepLink(
  parameters: ProposalNotificationParameters,
): string {
  const validated = validateProposalParameters(parameters);
  safeIdentifier(validated.projectId);
  return `/proposals/${safeIdentifier(validated.proposalId)}`;
}

export function buildSkillReviewNotificationDeepLink(): string {
  return '/settings?section=github';
}

export function buildConversationActivityNotificationDeepLink(
  parameters: ConversationActivityNotificationParameters,
): string {
  const validated = validateConversationParameters(parameters);
  return `/messages?conversation=${safeIdentifier(validated.conversationId)}`;
}

export function buildChatAttachmentBlockedNotificationDeepLink(
  parameters: ChatAttachmentBlockedNotificationParameters,
): string {
  const validated = validateChatAttachmentBlockedParameters(parameters);
  return `/messages?conversation=${safeIdentifier(validated.conversationId)}`;
}

export function buildAssignmentCallMissedNotificationDeepLink(
  parameters: AssignmentCallMissedNotificationParameters,
): string {
  const validated = validateAssignmentCallMissedParameters(parameters);
  return `/messages?conversation=${safeIdentifier(validated.conversationId)}`;
}

function applicationTemplate(
  action: ApplicationNotificationAction,
): NotificationTemplateDefinition {
  const key = `application.${action}` as NotificationTemplateKey;
  return {
    key,
    version: 1,
    ...POLICY[key],
    parameterContract: APPLICATION_PARAMETER_CONTRACT,
    render: {
      en: (parameters) => {
        validateApplicationParameters(parameters);
        return APPLICATION_COPY[action].en;
      },
      ar: (parameters) => {
        validateApplicationParameters(parameters);
        return APPLICATION_COPY[action].ar;
      },
    },
    buildDeepLink: (parameters) =>
      buildApplicationNotificationDeepLink(
        action,
        validateApplicationParameters(parameters),
      ),
  };
}

function deliveryTemplate(
  action: 'submitted' | 'resubmitted' | 'approved' | 'changes_requested' | 'rejected',
): NotificationTemplateDefinition {
  const key = `delivery.${action}` as NotificationTemplateKey;
  return {
    key,
    version: 1,
    ...POLICY[key],
    parameterContract: DELIVERY_PARAMETER_CONTRACT,
    render: {
      en: (parameters) => {
        validateDeliveryParameters(parameters);
        return deliveryCopy(action, validateDeliveryParameters(parameters), 'en');
      },
      ar: (parameters) => {
        validateDeliveryParameters(parameters);
        return deliveryCopy(action, validateDeliveryParameters(parameters), 'ar');
      },
    },
    buildDeepLink: (parameters) =>
      buildDeliveryNotificationDeepLink(validateDeliveryParameters(parameters)),
  };
}

function deliveryCopy(
  action: 'submitted' | 'resubmitted' | 'approved' | 'changes_requested' | 'rejected',
  parameters: DeliveryNotificationParameters,
  language: NotificationLanguage,
): { title: string; body: string } {
  const copy = DELIVERY_COPY[action][language];
  if (action === 'approved' && parameters.rating) {
    const label = language === 'ar' ? 'التقييم' : 'Rating';
    return {
      ...copy,
      body: `${copy.body} ${label}: ${'★'.repeat(parameters.rating)} (${parameters.rating}/5).`,
    };
  }
  if (!parameters.feedback || (action !== 'changes_requested' && action !== 'rejected')) {
    return copy;
  }
  const label = language === 'ar' ? 'ملاحظات المالك' : 'Owner feedback';
  return { ...copy, body: `${copy.body} ${label}: ${parameters.feedback}` };
}

export function buildDeliveryNotificationDeepLink(
  parameters: DeliveryNotificationParameters,
): string {
  return `/deliveries/${safeIdentifier(validateDeliveryParameters(parameters).deliveryId)}`;
}

function badgeTemplate(): NotificationTemplateDefinition {
  const key: NotificationTemplateKey = 'achievement.first_contribution';
  return {
    key,
    version: 1,
    ...POLICY[key],
    parameterContract: BADGE_PARAMETER_CONTRACT,
    render: {
      en: (parameters) => {
        const validated = validateBadgeParameters(parameters);
        return BADGE_COPY[validated.badgeType].en;
      },
      ar: (parameters) => {
        const validated = validateBadgeParameters(parameters);
        return BADGE_COPY[validated.badgeType].ar;
      },
    },
    buildDeepLink: () => null,
  };
}

function proposalTemplate(
  action: 'revision_requested' | 'accepted' | 'declined',
  copy: Record<NotificationLanguage, { title: string; body: string }>,
): NotificationTemplateDefinition {
  const key = `proposal.${action}` as NotificationTemplateKey;
  return {
    key,
    version: 1,
    ...POLICY[key],
    parameterContract: PROPOSAL_PARAMETER_CONTRACT,
    render: {
      en: (parameters) => {
        validateProposalParameters(parameters);
        return copy.en;
      },
      ar: (parameters) => {
        validateProposalParameters(parameters);
        return copy.ar;
      },
    },
    buildDeepLink: (parameters) =>
      buildProposalNotificationDeepLink(validateProposalParameters(parameters)),
  };
}

function skillTemplate(
  key: 'skill_review.activated' | 'skill_review.approved' | 'skill_review.not_approved',
  render: Record<NotificationLanguage, (skillName: string) => string>,
  titles: Record<NotificationLanguage, string>,
): NotificationTemplateDefinition {
  return {
    key,
    version: 1,
    ...POLICY[key],
    parameterContract: SKILL_PARAMETER_CONTRACT,
    render: {
      en: (parameters) => {
        const validated = validateSkillParameters(parameters);
        return { title: titles.en, body: render.en(validated.skillName) };
      },
      ar: (parameters) => {
        const validated = validateSkillParameters(parameters);
        return { title: titles.ar, body: render.ar(validated.skillName) };
      },
    },
    buildDeepLink: () => buildSkillReviewNotificationDeepLink(),
  };
}

function skillGenerationTemplate(
  status: SkillProfileGenerationNotificationStatus,
): NotificationTemplateDefinition {
  const key = `skill_profile_generation.${status}` as NotificationTemplateKey;
  return {
    key,
    version: 1,
    ...POLICY[key],
    parameterContract: SKILL_GENERATION_PARAMETER_CONTRACT,
    render: {
      en: (parameters) =>
        renderSkillGeneration(
          validateSkillGenerationParameters(parameters),
          'en',
        ),
      ar: (parameters) =>
        renderSkillGeneration(
          validateSkillGenerationParameters(parameters),
          'ar',
        ),
    },
    buildDeepLink: () => null,
  };
}

function renderSkillGeneration(
  parameters: SkillProfileGenerationNotificationParameters,
  language: NotificationLanguage,
): { title: string; body: string } {
  if (parameters.status === 'ready_for_review') {
    const count = parameters.skillCount ?? 0;
    if (parameters.audience === 'admin') {
      return language === 'ar'
        ? {
            title: 'تحليل مهارات بانتظار مراجعة المشرف',
            body: `لدى مساهم تحليل مهارات مكتمل يتضمن ${count} مهارة بانتظار المراجعة.`,
          }
        : {
            title: 'Skill analysis awaiting admin review',
            body: `A contributor has a completed skill analysis with ${count} skill${count === 1 ? '' : 's'} waiting for your review.`,
          };
    }
    return language === 'ar'
      ? {
          title: 'تحليل المهارات جاهز للمراجعة',
          body: `اكتمل تحليل مهاراتك. توجد ${count} مهارة بانتظار مراجعة المشرف.`,
        }
      : {
          title: 'Skill analysis ready for review',
          body: `Your skill analysis is complete. ${count} skill${count === 1 ? '' : 's'} are waiting for admin review.`,
        };
  }

  if (parameters.status === 'needs_more_evidence') {
    return language === 'ar'
      ? {
          title: 'نحتاج إلى أدلة إضافية',
          body: 'اكتمل التحليل، لكن الأدلة غير كافية. اختر مستودعات إضافية أو حاول مرة أخرى.',
        }
      : {
          title: 'More evidence is needed',
          body: 'Your skill analysis finished, but there was not enough evidence. Select more repositories or try again.',
        };
  }

  return language === 'ar'
    ? {
        title: 'تعذر تحليل المهارات',
        body: 'تعذر إكمال تحليل مهاراتك. يرجى المحاولة مرة أخرى.',
      }
    : {
        title: 'Skill analysis failed',
        body: 'Your skill analysis could not be completed. Please try again.',
      };
}

const CHAT_ATTACHMENT_BLOCKED_TEMPLATE: NotificationTemplateDefinition = {
  key: 'chat_attachment.blocked',
  version: 1,
  ...POLICY['chat_attachment.blocked'],
  parameterContract: CHAT_ATTACHMENT_BLOCKED_PARAMETER_CONTRACT,
  render: {
    en: (parameters) => {
      const validated = validateChatAttachmentBlockedParameters(parameters);
      return {
        title: 'Attachment blocked',
        body: `Your attachment "${validated.filename}" was blocked because it failed a security scan.`,
      };
    },
    ar: (parameters) => {
      const validated = validateChatAttachmentBlockedParameters(parameters);
      return {
        title: 'تم حظر المرفق',
        body: `تم حظر مرفقك "${validated.filename}" لأنه لم يجتز فحص الأمان.`,
      };
    },
  },
  buildDeepLink: (parameters) =>
    buildChatAttachmentBlockedNotificationDeepLink(
      validateChatAttachmentBlockedParameters(parameters),
    ),
};

const ASSIGNMENT_CALL_MISSED_TEMPLATE: NotificationTemplateDefinition = {
  key: 'assignment_call.missed',
  version: 1,
  ...POLICY['assignment_call.missed'],
  parameterContract: ASSIGNMENT_CALL_MISSED_PARAMETER_CONTRACT,
  render: {
    en: (parameters) => {
      const validated = validateAssignmentCallMissedParameters(parameters);
      return {
        title: 'Missed call',
        body: `You missed a call from ${validated.callerName}.`,
      };
    },
    ar: (parameters) => {
      const validated = validateAssignmentCallMissedParameters(parameters);
      return {
        title: 'مكالمة فائتة',
        body: `فاتتك مكالمة من ${validated.callerName}.`,
      };
    },
  },
  buildDeepLink: (parameters) =>
    buildAssignmentCallMissedNotificationDeepLink(
      validateAssignmentCallMissedParameters(parameters),
    ),
};

const LEGACY_TEMPLATE: NotificationTemplateDefinition = {
  key: 'system.legacy',
  version: 1,
  ...POLICY['system.legacy'],
  parameterContract: LEGACY_PARAMETER_CONTRACT,
  render: {
    en: (parameters) => {
      const validated = validateLegacyParameters(parameters);
      return { title: validated.legacyTitle, body: validated.legacyBody };
    },
    ar: (parameters) => {
      const validated = validateLegacyParameters(parameters);
      return { title: validated.legacyTitle, body: validated.legacyBody };
    },
  },
  buildDeepLink: () => null,
};

const CONVERSATION_TEMPLATE: NotificationTemplateDefinition = {
  key: 'conversation.activity',
  version: 1,
  ...POLICY['conversation.activity'],
  parameterContract: CONVERSATION_PARAMETER_CONTRACT,
  render: {
    en: (parameters) => {
      const validated = validateConversationParameters(parameters);
      return {
        title:
          validated.messageCount === 1
            ? `New message from ${validated.senderName}`
            : `${validated.messageCount} new messages from ${validated.senderName}`,
        body: validated.messagePreview,
      };
    },
    ar: (parameters) => {
      const validated = validateConversationParameters(parameters);
      return {
        title:
          validated.messageCount === 1
            ? `رسالة جديدة من ${validated.senderName}`
            : `${validated.messageCount} رسائل جديدة من ${validated.senderName}`,
        body: validated.messagePreview,
      };
    },
  },
  buildDeepLink: (parameters) =>
    buildConversationActivityNotificationDeepLink(
      validateConversationParameters(parameters),
    ),
};

const definitions: NotificationTemplateDefinition[] = [
  deliveryTemplate('submitted'),
  deliveryTemplate('resubmitted'),
  deliveryTemplate('approved'),
  deliveryTemplate('changes_requested'),
  deliveryTemplate('rejected'),
  applicationTemplate('accepted'),
  applicationTemplate('submitted'),
  applicationTemplate('withdrawn'),
  applicationTemplate('declined_by_owner'),
  applicationTemplate('not_selected'),
  applicationTemplate('owner_review_reminder'),
  applicationTemplate('expired'),
  proposalTemplate('revision_requested', {
    en: {
      title: 'Proposal revision requested',
      body: 'The Project owner requested a revision to your Contribution Proposal.',
    },
    ar: {
      title: 'طلب تعديل مقترح المساهمة',
      body: 'طلب مالك المشروع تعديل مقترح مساهمتك.',
    },
  }),
  proposalTemplate('accepted', {
    en: {
      title: 'Proposal accepted',
      body: 'The Project owner accepted your Contribution Proposal and created an attributed draft Contribution Request.',
    },
    ar: {
      title: 'تم قبول مقترح المساهمة',
      body: 'قبل مالك المشروع مقترحك وأنشأ مسودة طلب مشاركة منسوبة إليك.',
    },
  }),
  proposalTemplate('declined', {
    en: {
      title: 'Proposal declined',
      body: 'The Project owner declined your Contribution Proposal. Review the proposal for the owner’s reason.',
    },
    ar: {
      title: 'تم رفض مقترح المساهمة',
      body: 'رفض مالك المشروع مقترحك. راجع المقترح لمعرفة سبب المالك.',
    },
  }),
  skillTemplate(
    'skill_review.activated',
    {
      en: (skillName) =>
        `Your ${skillName} skill was approved. Your contributor account is now active.`,
      ar: (skillName) =>
        `تمت الموافقة على مهارة ${skillName}. حساب المساهم لديك نشط الآن.`,
    },
    { en: 'Skill profile approved', ar: 'تمت الموافقة على ملف المهارة' },
  ),
  skillTemplate(
    'skill_review.approved',
    {
      en: (skillName) => `Your ${skillName} skill was approved.`,
      ar: (skillName) => `تمت الموافقة على مهارة ${skillName}.`,
    },
    { en: 'Skill approved', ar: 'تمت الموافقة على المهارة' },
  ),
  skillTemplate(
    'skill_review.not_approved',
    {
      en: (skillName) =>
        `Your ${skillName} skill was reviewed and was not approved.`,
      ar: (skillName) => `تمت مراجعة مهارة ${skillName} ولم تتم الموافقة عليها.`,
    },
    { en: 'Skill review update', ar: 'تحديث مراجعة المهارة' },
  ),
  skillGenerationTemplate('ready_for_review'),
  skillGenerationTemplate('needs_more_evidence'),
  skillGenerationTemplate('failed'),
  CONVERSATION_TEMPLATE,
  CHAT_ATTACHMENT_BLOCKED_TEMPLATE,
  ASSIGNMENT_CALL_MISSED_TEMPLATE,
  LEGACY_TEMPLATE,
  badgeTemplate(),
];

const templates = new Map<string, NotificationTemplateDefinition>(
  definitions.map((definition) => [
    `${definition.key}:${definition.version}`,
    definition,
  ]),
);

export function getNotificationTemplateDefinitions(): readonly NotificationTemplateDefinition[] {
  return definitions;
}

export function getNotificationTemplatePolicy(
  key: NotificationTemplateKey,
): { category: NotificationType; priority: NotificationPriorityValue } {
  return POLICY[key];
}

export function validateNotificationTemplateParameters<
  K extends NotificationTemplateKey,
>(
  key: K,
  parameters: unknown,
): NotificationTemplateParameterMap[K] {
  switch (key) {
    case 'delivery.submitted':
    case 'delivery.resubmitted':
    case 'delivery.approved':
    case 'delivery.changes_requested':
    case 'delivery.rejected':
      return validateDeliveryParameters(parameters) as NotificationTemplateParameterMap[K];
    case 'system.legacy':
      return validateLegacyParameters(parameters) as NotificationTemplateParameterMap[K];
    case 'skill_review.activated':
    case 'skill_review.approved':
    case 'skill_review.not_approved':
      return validateSkillParameters(parameters) as NotificationTemplateParameterMap[K];
    case 'skill_profile_generation.ready_for_review':
    case 'skill_profile_generation.needs_more_evidence':
    case 'skill_profile_generation.failed':
      return validateSkillGenerationParameters(parameters) as NotificationTemplateParameterMap[K];
    case 'conversation.activity':
      return validateConversationParameters(parameters) as NotificationTemplateParameterMap[K];
    case 'chat_attachment.blocked':
      return validateChatAttachmentBlockedParameters(
        parameters,
      ) as NotificationTemplateParameterMap[K];
    case 'assignment_call.missed':
      return validateAssignmentCallMissedParameters(
        parameters,
      ) as NotificationTemplateParameterMap[K];
    case 'achievement.first_contribution':
      return validateBadgeParameters(parameters) as NotificationTemplateParameterMap[K];
    case 'proposal.revision_requested':
    case 'proposal.accepted':
    case 'proposal.declined':
      return validateProposalParameters(parameters) as NotificationTemplateParameterMap[K];
    default:
      return validateApplicationParameters(parameters) as NotificationTemplateParameterMap[K];
  }
}

export function findNotificationTemplate(
  key: string,
  version: number,
): NotificationTemplateDefinition | undefined {
  return templates.get(`${key}:${version}`);
}
