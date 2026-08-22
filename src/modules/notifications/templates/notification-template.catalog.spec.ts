import { NotificationType } from '@prisma/client';

import {
  NOTIFICATION_TEMPLATE_KEYS,
  buildApplicationNotificationDeepLink,
  buildDeliveryNotificationDeepLink,
  buildProposalNotificationDeepLink,
  buildSkillReviewNotificationDeepLink,
  getNotificationTemplateDefinitions,
  getNotificationTemplatePolicy,
  validateNotificationTemplateParameters,
} from './notification-template.catalog';

describe('Notification template catalog', () => {
  it('exposes every supported version-one template with bilingual copy and policy', () => {
    const definitions = getNotificationTemplateDefinitions();
    const sampleParameters = {
      applicationId: 'application-1',
      deliveryId: 'delivery-1',
      contributionRequestId: 'request-1',
      submissionNumber: 1,
      proposalId: 'proposal-1',
      projectId: 'project-1',
      skillProfileId: 'skill-1',
      skillName: 'TypeScript',
      generationId: 'generation-1',
      status: 'ready_for_review',
      audience: 'contributor',
      skillCount: 3,
      selectedRepositoryCount: 2,
      legacyTitle: 'Legacy title',
      legacyBody: 'Legacy body',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      senderName: 'Contributor Name',
      messagePreview: 'Hello owner',
      messageCount: 1,
      badgeType: 'first_contribution',
      filename: 'brief.pdf',
      callId: 'call-1',
      callerName: 'Caller Name',
    };

    expect(definitions.map((definition) => definition.key)).toEqual(
      NOTIFICATION_TEMPLATE_KEYS,
    );
    expect(definitions).toHaveLength(26);

    for (const definition of definitions) {
      expect(definition.version).toBe(1);
      expect(definition.render.en(sampleParameters)).toEqual(
        expect.objectContaining({ title: expect.any(String), body: expect.any(String) }),
      );
      expect(definition.render.ar(sampleParameters)).toEqual(
        expect.objectContaining({ title: expect.any(String), body: expect.any(String) }),
      );
      expect(definition.category).toBe(
        getNotificationTemplatePolicy(definition.key).category,
      );
      expect(definition.priority).toBe(
        getNotificationTemplatePolicy(definition.key).priority,
      );
    }
  });

  it('declares required parameter contracts and rejects incomplete Application data', () => {
    expect(
      validateNotificationTemplateParameters('application.accepted', {
        applicationId: 'application-1',
        contributionRequestId: 'request-1',
      }),
    ).toEqual({
      applicationId: 'application-1',
      contributionRequestId: 'request-1',
    });

    expect(() =>
      validateNotificationTemplateParameters('application.accepted', {
        applicationId: 'application-1',
      }),
    ).toThrow('NOTIFICATION_PARAMETERS_INVALID');
  });

  it('builds only trusted relative links from validated identifiers', () => {
    expect(
      buildApplicationNotificationDeepLink('submitted', {
        applicationId: 'application-1',
        contributionRequestId: 'request-1',
      }),
    ).toBe('/contribution-requests/request-1');
    expect(
      buildApplicationNotificationDeepLink('accepted', {
        applicationId: 'application-1',
        contributionRequestId: 'request-1',
      }),
    ).toBe('/applications/application-1');
    expect(
      buildProposalNotificationDeepLink({
        proposalId: 'proposal-1',
        projectId: 'project-1',
      }),
    ).toBe('/proposals/proposal-1');
    expect(
      buildDeliveryNotificationDeepLink({
        deliveryId: 'delivery-1',
        contributionRequestId: 'request-1',
        submissionNumber: 2,
      }),
    ).toBe('/deliveries/delivery-1');
    expect(buildSkillReviewNotificationDeepLink()).toBe(
      '/settings?section=github',
    );
    expect(() =>
      buildApplicationNotificationDeepLink('accepted', {
        applicationId: '../unsafe',
        contributionRequestId: 'request-1',
      }),
    ).toThrow('NOTIFICATION_PARAMETERS_INVALID');
  });

  it('renders owner feedback in contributor-facing Delivery outcomes', () => {
    const rejected = getNotificationTemplateDefinitions().find(
      (definition) => definition.key === 'delivery.rejected',
    )!;
    expect(
      rejected.render.en({
        deliveryId: 'delivery-1',
        contributionRequestId: 'request-1',
        submissionNumber: 1,
        feedback: 'The authentication flow is incomplete.',
      }).body,
    ).toContain('The authentication flow is incomplete.');

    const approved = getNotificationTemplateDefinitions().find(
      (definition) => definition.key === 'delivery.approved',
    )!;
    expect(
      approved.render.en({
        deliveryId: 'delivery-1',
        contributionRequestId: 'request-1',
        submissionNumber: 1,
        rating: 5,
      }).body,
    ).toContain('★★★★★ (5/5)');
  });

  it('keeps critical workflow templates in the attention category', () => {
    expect(getNotificationTemplatePolicy('application.accepted')).toEqual({
      category: NotificationType.application_status,
      priority: 'attention',
    });
    expect(getNotificationTemplatePolicy('delivery.approved')).toEqual({
      category: NotificationType.delivery_update,
      priority: 'attention',
    });
    expect(getNotificationTemplatePolicy('skill_review.approved')).toEqual({
      category: NotificationType.skill_review,
      priority: 'attention',
    });
  });
});
