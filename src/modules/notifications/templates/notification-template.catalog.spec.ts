import { NotificationType } from '@prisma/client';

import {
  NOTIFICATION_TEMPLATE_KEYS,
  buildApplicationNotificationDeepLink,
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
      contributionRequestId: 'request-1',
      proposalId: 'proposal-1',
      projectId: 'project-1',
      skillProfileId: 'skill-1',
      skillName: 'TypeScript',
      legacyTitle: 'Legacy title',
      legacyBody: 'Legacy body',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      senderName: 'Contributor Name',
      messagePreview: 'Hello owner',
      messageCount: 1,
    };

    expect(definitions.map((definition) => definition.key)).toEqual(
      NOTIFICATION_TEMPLATE_KEYS,
    );
    expect(definitions).toHaveLength(15);

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

  it('keeps critical workflow templates in the attention category', () => {
    expect(getNotificationTemplatePolicy('application.accepted')).toEqual({
      category: NotificationType.application_status,
      priority: 'attention',
    });
    expect(getNotificationTemplatePolicy('skill_review.approved')).toEqual({
      category: NotificationType.skill_review,
      priority: 'attention',
    });
  });
});
