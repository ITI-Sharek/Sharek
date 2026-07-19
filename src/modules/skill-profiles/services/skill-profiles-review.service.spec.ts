import {
  SkillProfileProficiencyLevel,
  SkillProfileReviewAction,
  SkillProfileStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';

import { AuthenticatedUser } from '../../../shared/auth/authenticated-request';
import { SkillProfilesReviewService } from './skill-profiles-review.service';

const admin: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
};

const contributor = {
  id: 'user-1',
  email: 'contributor@example.com',
  username: 'contributor',
  password_hash: null,
  first_name: 'Sharek',
  last_name: 'Contributor',
  avatar_url: null,
  role: UserRole.contributor,
  status: UserStatus.pending,
  preferred_language: 'en',
  created_at: new Date('2026-07-19T00:00:00.000Z'),
  updated_at: new Date('2026-07-19T00:00:00.000Z'),
  last_login_at: null,
};

const pendingSkill = {
  id: 'skill-1',
  user_id: contributor.id,
  generation_id: 'generation-1',
  skill_name: 'TypeScript',
  skill_key: 'typescript',
  proficiency_level: SkillProfileProficiencyLevel.beginner,
  confidence_score: 0.91,
  evidence_summary: 'Authored TypeScript services',
  evidence_sources: { evidenceIds: ['github:owner/repo'] },
  status: SkillProfileStatus.pending,
  reviewed_by: null,
  admin_notes: null,
  original_proficiency: null,
  reviewed_at: null,
  superseded_at: null,
  created_at: new Date('2026-07-19T00:00:00.000Z'),
  updated_at: new Date('2026-07-19T00:00:00.000Z'),
  user: contributor,
};

const approvedSkill = {
  ...pendingSkill,
  status: SkillProfileStatus.approved,
  proficiency_level: SkillProfileProficiencyLevel.advanced,
  reviewed_by: admin.id,
  reviewed_at: new Date('2026-07-19T00:05:00.000Z'),
  original_proficiency: SkillProfileProficiencyLevel.beginner,
};

const reviewDecision = {
  id: 'decision-1',
  skill_profile_id: pendingSkill.id,
  reviewer_id: admin.id,
  action: SkillProfileReviewAction.approve,
  previous_status: SkillProfileStatus.pending,
  new_status: SkillProfileStatus.approved,
  previous_proficiency: SkillProfileProficiencyLevel.beginner,
  new_proficiency: SkillProfileProficiencyLevel.advanced,
  notes: 'Evidence supports advanced label',
  created_at: new Date('2026-07-19T00:06:00.000Z'),
};

function createService() {
  const identityAccountStatusService = {
    activateContributorAfterSkillApproval: jest.fn().mockResolvedValue({
      userId: contributor.id,
      activated: true,
      status: UserStatus.active,
    }),
  };
  const notificationsService = {
    createSkillReviewNotification: jest.fn().mockResolvedValue({
      notificationId: 'notification-1',
      created: true,
      deliveredRealtime: true,
    }),
  };
  const transaction = {
    skillProfile: {
      findUnique: jest.fn().mockResolvedValue(pendingSkill),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(approvedSkill),
    },
    skillProfileReviewDecision: {
      create: jest.fn().mockResolvedValue(reviewDecision),
    },
  };
  const database = {
    skillProfile: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([pendingSkill]),
    },
    $transaction: jest
      .fn()
      .mockImplementation((callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
  };

  return {
    service: new SkillProfilesReviewService(
      database as never,
      identityAccountStatusService as never,
      notificationsService as never,
    ),
    database,
    identityAccountStatusService,
    notificationsService,
    transaction,
  };
}

describe('SkillProfilesReviewService', () => {
  it('lists pending skill reviews with pagination', async () => {
    const { service, database } = createService();

    await expect(
      service.listPendingReviews({ admin, page: 2, limit: 10 }),
    ).resolves.toMatchObject({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
      items: [
        {
          skillProfileId: 'skill-1',
          contributorId: 'user-1',
          contributorName: 'Sharek Contributor',
          skillName: 'TypeScript',
          status: 'pending',
        },
      ],
    });
    expect(database.skillProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: SkillProfileStatus.pending },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('approves a pending skill and stores a decision record', async () => {
    const {
      service,
      transaction,
      identityAccountStatusService,
      notificationsService,
    } = createService();

    await expect(
      service.approve({
        admin,
        skillProfileId: pendingSkill.id,
        proficiency: SkillProfileProficiencyLevel.advanced,
        notes: ' Evidence supports advanced label ',
      }),
    ).resolves.toMatchObject({
      skill: {
        skillProfileId: pendingSkill.id,
        status: 'approved',
        proficiencyLevel: 'advanced',
        originalProficiency: 'beginner',
      },
      decision: {
        action: 'approve',
        previousStatus: 'pending',
        newStatus: 'approved',
        previousProficiency: 'beginner',
        newProficiency: 'advanced',
        notes: 'Evidence supports advanced label',
      },
      activation: {
        userId: contributor.id,
        activated: true,
        status: 'active',
      },
      notification: {
        notificationId: 'notification-1',
        created: true,
        deliveredRealtime: true,
      },
    });
    expect(transaction.skillProfile.updateMany).toHaveBeenCalledWith({
      where: {
        id: pendingSkill.id,
        status: SkillProfileStatus.pending,
      },
      data: expect.objectContaining({
        status: SkillProfileStatus.approved,
        proficiency_level: SkillProfileProficiencyLevel.advanced,
        reviewed_by: admin.id,
        admin_notes: 'Evidence supports advanced label',
        original_proficiency: SkillProfileProficiencyLevel.beginner,
      }),
    });
    expect(transaction.skillProfileReviewDecision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        skill_profile_id: pendingSkill.id,
        reviewer_id: admin.id,
        action: SkillProfileReviewAction.approve,
      }),
    });
    expect(
      identityAccountStatusService.activateContributorAfterSkillApproval,
    ).toHaveBeenCalledWith(contributor.id);
    expect(notificationsService.createSkillReviewNotification).toHaveBeenCalledWith({
      userId: contributor.id,
      skillProfileId: pendingSkill.id,
      skillName: 'TypeScript',
      approved: true,
      activated: true,
    });
  });

  it('rejects a pending skill and requires notes', async () => {
    const {
      service,
      transaction,
      identityAccountStatusService,
      notificationsService,
    } = createService();
    transaction.skillProfile.findUniqueOrThrow.mockResolvedValue({
      ...pendingSkill,
      status: SkillProfileStatus.rejected,
      reviewed_by: admin.id,
      reviewed_at: new Date('2026-07-19T00:05:00.000Z'),
      admin_notes: 'Weak evidence',
    });
    transaction.skillProfileReviewDecision.create.mockResolvedValue({
      ...reviewDecision,
      action: SkillProfileReviewAction.reject,
      new_status: SkillProfileStatus.rejected,
      notes: 'Weak evidence',
    });

    await expect(
      service.reject({
        admin,
        skillProfileId: pendingSkill.id,
        notes: 'Weak evidence',
      }),
    ).resolves.toMatchObject({
      skill: { status: 'rejected' },
      decision: {
        action: 'reject',
        newStatus: 'rejected',
        notes: 'Weak evidence',
      },
      activation: null,
      notification: {
        notificationId: 'notification-1',
        created: true,
        deliveredRealtime: true,
      },
    });
    expect(
      identityAccountStatusService.activateContributorAfterSkillApproval,
    ).not.toHaveBeenCalled();
    expect(notificationsService.createSkillReviewNotification).toHaveBeenCalledWith({
      userId: contributor.id,
      skillProfileId: pendingSkill.id,
      skillName: 'TypeScript',
      approved: false,
      activated: false,
    });

    await expect(
      service.reject({ admin, skillProfileId: pendingSkill.id, notes: '   ' }),
    ).rejects.toMatchObject({
      code: 'SKILL_PROFILE_REVIEW_NOTES_REQUIRED',
      statusCode: 400,
    });
  });

  it('adjusts proficiency while keeping the skill pending', async () => {
    const {
      service,
      transaction,
      identityAccountStatusService,
      notificationsService,
    } = createService();
    transaction.skillProfile.findUniqueOrThrow.mockResolvedValue({
      ...pendingSkill,
      proficiency_level: SkillProfileProficiencyLevel.intermediate,
      original_proficiency: SkillProfileProficiencyLevel.beginner,
      reviewed_by: admin.id,
      reviewed_at: new Date('2026-07-19T00:05:00.000Z'),
    });
    transaction.skillProfileReviewDecision.create.mockResolvedValue({
      ...reviewDecision,
      action: SkillProfileReviewAction.adjust_proficiency,
      new_status: SkillProfileStatus.pending,
      new_proficiency: SkillProfileProficiencyLevel.intermediate,
      notes: null,
    });

    await expect(
      service.adjustProficiency({
        admin,
        skillProfileId: pendingSkill.id,
        proficiency: SkillProfileProficiencyLevel.intermediate,
      }),
    ).resolves.toMatchObject({
      skill: {
        status: 'pending',
        proficiencyLevel: 'intermediate',
        originalProficiency: 'beginner',
      },
      decision: {
        action: 'adjust_proficiency',
        previousStatus: 'pending',
        newStatus: 'pending',
      },
      activation: null,
      notification: null,
    });
    expect(
      identityAccountStatusService.activateContributorAfterSkillApproval,
    ).not.toHaveBeenCalled();
    expect(notificationsService.createSkillReviewNotification).not.toHaveBeenCalled();
  });

  it('blocks non-admin users and already reviewed skills', async () => {
    const { service, transaction } = createService();

    await expect(
      service.listPendingReviews({
        admin: { ...admin, role: 'contributor' },
      }),
    ).rejects.toMatchObject({
      code: 'SKILL_PROFILE_REVIEW_FORBIDDEN',
      statusCode: 403,
    });

    transaction.skillProfile.findUnique.mockResolvedValue({
      ...pendingSkill,
      status: SkillProfileStatus.approved,
    });
    await expect(
      service.approve({ admin, skillProfileId: pendingSkill.id }),
    ).rejects.toMatchObject({
      code: 'SKILL_PROFILE_REVIEW_NOT_PENDING',
      statusCode: 409,
    });
  });
});
