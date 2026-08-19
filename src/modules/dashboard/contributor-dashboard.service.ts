import { Injectable } from '@nestjs/common';
import { ApplicationStatus, DeliveryStatus, SkillProfileStatus } from '@prisma/client';

import { AuthenticatedUser } from '../../shared/auth/authenticated-request';
import { DatabaseService } from '../../shared/database/database.service';
import { ForbiddenApplicationError } from '../../shared/errors/application.error';
import { RecommendedTasksService } from '../matching/recommended-tasks.service';
import { ReputationService } from '../reputation/reputation.service';
import { SubscriptionStatusService } from '../subscriptions/subscription-status.service';

@Injectable()
export class ContributorDashboardService {
  constructor(
    private readonly database: DatabaseService,
    private readonly recommendations: RecommendedTasksService,
    private readonly reputation: ReputationService,
    private readonly subscriptions: SubscriptionStatusService,
  ) {}

  async getForContributor(actor: AuthenticatedUser) {
    this.assertActiveContributor(actor);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [user, githubAccount, latestGeneration, approvedSkills, unreadNotifications,
      pendingApplications, acceptedApplications, changedDeliveries, reputation,
      verifiedThisMonth, subscription, recommended] = await Promise.all([
      this.database.user.findUniqueOrThrow({
        where: { id: actor.id },
        select: { first_name: true, contributorProfile: { select: { id: true, fields: { select: { field_id: true } } } } },
      }),
      this.database.gitHubAccount.findUnique({ where: { user_id: actor.id }, select: { id: true } }),
      this.database.skillProfileGeneration.findFirst({
        where: { user_id: actor.id },
        orderBy: { created_at: 'desc' },
        select: { status: true },
      }),
      this.database.skillProfile.count({ where: { user_id: actor.id, status: SkillProfileStatus.approved } }),
      this.database.notification.count({ where: { user_id: actor.id, is_read: false } }),
      this.database.application.count({
        where: { contributor_id: actor.id, status: ApplicationStatus.pending_owner_review },
      }),
      this.database.application.findMany({
        where: { contributor_id: actor.id, status: ApplicationStatus.accepted },
        orderBy: { updated_at: 'desc' },
        take: 3,
        select: { id: true, contributionRequest: { select: { title: true } } },
      }),
      this.database.delivery.findMany({
        where: { contributor_id: actor.id, status: DeliveryStatus.changes_requested },
        orderBy: { updated_at: 'desc' },
        take: 3,
        select: { id: true, contributionRequest: { select: { title: true } } },
      }),
      this.reputation.getSummaryForUser(actor.id),
      this.database.skillProfile.count({
        where: {
          user_id: actor.id,
          status: SkillProfileStatus.approved,
          reviewed_at: { gte: monthStart },
        },
      }),
      this.subscriptions.getPlanStatus(actor),
      this.recommendations.listForContributor(actor),
    ]);

    const onboardingSteps = this.onboardingSteps({
      hasProfileFields: (user.contributorProfile?.fields.length ?? 0) > 0,
      hasGithubAccount: githubAccount !== null,
      generationStatus: latestGeneration?.status ?? null,
      approvedSkills,
    });
    const onboarding = onboardingSteps.some((step) => step.status !== 'done');
    const attentionItems = [
      ...changedDeliveries.map((delivery) => ({
        id: `delivery:${delivery.id}`,
        kind: 'changes_requested' as const,
        title: delivery.contributionRequest.title,
        subtitle: 'Changes were requested for your delivery.',
        actionLabel: 'Review changes',
      })),
      ...acceptedApplications.map((application) => ({
        id: `application:${application.id}`,
        kind: 'accepted' as const,
        title: application.contributionRequest.title,
        subtitle: 'Your application was accepted.',
        actionLabel: 'View assignment',
      })),
    ];
    // Not sliced. A Gold contributor's plan allowance *is* the cap — the
    // matching module already applied `matchedProjectLimit`, so trimming again
    // here would sell ten matched projects and deliver three.
    const matchedTasks = recommended.recommendations.map((task) => ({
      id: task.requestId,
      title: task.title,
      projectName: task.projectName,
      // What the Request asks for, not what the contributor happens to have.
      // These two were the same list until the fit gauge below needed a real
      // denominator, which made every match render as a complete one.
      requiredSkills: task.requiredSkillNames,
      matchedSkills: task.matchedSkills.map((skill) => skill.name),
      matchedCount: task.matchedRequiredCount,
      requiredCount: task.requiredSkillCount,
    }));

    return {
      state: onboarding
        ? 'onboarding'
        : pendingApplications === 0 && attentionItems.length === 0
          ? 'verified-empty'
          : 'active',
      greetingName: user.first_name,
      unreadNotifications,
      quota: {
        planName: subscription.plan,
        usedToday: subscription.usage?.used ?? 0,
        dailyLimit: subscription.usage?.limit ?? 0,
      },
      attentionItems,
      matchReason: recommended.recommendations[0]?.justification ?? '',
      matchedTasks,
      // The plan and the reason travel with the list so the UI can tell a free
      // contributor (upgrade prompt) from a Gold one with nothing matched today
      // (a different, non-commercial sentence). Without these an empty list is
      // unexplainable and renders as a bare heading over nothing.
      matching: {
        planType: recommended.planType,
        reason: recommended.reason,
      },
      growth: {
        ratingPrevious: null,
        ratingCurrent: reputation.rating,
        completedCount: reputation.completedContributions,
        successRate: reputation.successRate,
        skillsVerifiedThisMonth: verifiedThisMonth,
      },
      applications: { pendingOwnerReviewCount: pendingApplications },
      onboardingSteps,
      fullyMatchedTasksCount: recommended.recommendations.length,
    };
  }

  private onboardingSteps(input: {
    hasProfileFields: boolean;
    hasGithubAccount: boolean;
    generationStatus: string | null;
    approvedSkills: number;
  }) {
    const analysisInProgress = ['queued', 'collecting_evidence', 'analyzing'].includes(
      input.generationStatus ?? '',
    );
    return [
      { id: 'profile', label: 'Complete your contributor profile', status: input.hasProfileFields ? 'done' : 'in_progress', hint: input.hasProfileFields ? null : 'Add your areas of interest.' },
      { id: 'github', label: 'Connect GitHub', status: input.hasGithubAccount ? 'done' : 'todo', hint: input.hasGithubAccount ? null : 'Connect GitHub to analyze your work.' },
      { id: 'analysis', label: 'Analyze your skills', status: input.approvedSkills > 0 ? 'done' : analysisInProgress ? 'in_progress' : 'todo', hint: input.approvedSkills > 0 ? null : analysisInProgress ? 'Your analysis is in progress.' : 'Start an analysis after connecting GitHub.' },
      { id: 'review', label: 'Get skills approved', status: input.approvedSkills > 0 ? 'done' : input.generationStatus === 'pending_review' ? 'in_progress' : 'todo', hint: input.approvedSkills > 0 ? null : input.generationStatus === 'pending_review' ? 'Your skills are awaiting review.' : 'Approved skills unlock matching.' },
    ] as const;
  }

  private assertActiveContributor(actor: AuthenticatedUser) {
    if (actor.role !== 'contributor' || actor.status !== 'active') {
      throw new ForbiddenApplicationError(
        'An active contributor account is required',
        'CONTRIBUTOR_DASHBOARD_NOT_AUTHORIZED',
      );
    }
  }
}
