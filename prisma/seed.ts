import {
  ContributionRequestDifficulty,
  ContributionRequestRequirementKind,
  ContributionRequestSkillInferenceStatus,
  ContributionRequestSkillRequirementSource,
  ContributionRequestStatus,
  GitHubAccountIngestionStatus,
  PrismaClient,
  ProjectCategory,
  ProjectDifficulty,
  ProjectStatus,
  SkillProfileProficiencyLevel,
  SkillProfileGenerationStatus,
  SkillProfileStatus,
  SubscriptionPlanType,
  SubscriptionSource,
  SubscriptionStatus,
  SubscriptionUserRoleContext,
  UserRole,
} from '@prisma/client';
import { randomBytes, scrypt as scryptCallback } from 'crypto';
import { promisify } from 'util';

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

function normalizeSkillName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim()
    .replace(/\s+/g, '')
    .replace(/ /g, '');
}

const DEV_PASSWORD = 'Admin@1234';

const DEV_USERS: Array<{
  email: string;
  username: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  gold?: boolean;
}> = [
  {
    email: 'admin@sharek.local',
    username: 'admin',
    role: 'admin',
    firstName: 'System',
    lastName: 'Admin',
  },
  {
    email: 'owner@sharek.local',
    username: 'dev_owner',
    role: 'owner',
    firstName: 'Dev',
    lastName: 'Owner',
  },
  {
    email: 'gold-owner@sharek.local',
    username: 'gold_owner',
    role: 'owner',
    firstName: 'Gold',
    lastName: 'Owner',
    gold: true,
  },
  {
    email: 'contributor@sharek.local',
    username: 'dev_contributor',
    role: 'contributor',
    firstName: 'Dev',
    lastName: 'Contributor',
  },
  {
    email: 'gold-contributor@sharek.local',
    username: 'gold_contributor',
    role: 'contributor',
    firstName: 'Gold',
    lastName: 'Contributor',
    gold: true,
  },
  {
    email: 'gold-no-matches@sharek.local',
    username: 'gold_no_matches',
    role: 'contributor',
    firstName: 'Gold',
    lastName: 'No Matches',
    gold: true,
  },
  {
    email: 'gold-no-skills@sharek.local',
    username: 'gold_no_skills',
    role: 'contributor',
    firstName: 'Gold',
    lastName: 'No Skills',
    gold: true,
  },
  {
    email: 'karim-muhammad@sharek.local',
    username: 'Karim-Muhammad',
    role: 'owner',
    firstName: 'Karim',
    lastName: 'Muhammad',
  },
];

const CATALOG_FIELD_CATEGORIES = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    key: 'technology',
    label_en: 'Technology',
    label_ar: 'التكنولوجيا',
    sort_order: 10,
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    key: 'design',
    label_en: 'Design',
    label_ar: 'التصميم',
    sort_order: 20,
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    key: 'content',
    label_en: 'Content',
    label_ar: 'المحتوى',
    sort_order: 30,
  },
] as const;

const CATALOG_FIELDS = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    categoryKey: 'technology',
    key: 'web',
    label_en: 'Web Development',
    label_ar: 'تطوير الويب',
    sort_order: 10,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    categoryKey: 'technology',
    key: 'mobile',
    label_en: 'Mobile Applications',
    label_ar: 'تطبيقات الجوال',
    sort_order: 20,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    categoryKey: 'technology',
    key: 'ai',
    label_en: 'Artificial Intelligence',
    label_ar: 'الذكاء الاصطناعي',
    sort_order: 30,
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    categoryKey: 'design',
    key: 'design',
    label_en: 'UI/UX Design',
    label_ar: 'تصميم UI/UX',
    sort_order: 40,
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    categoryKey: 'technology',
    key: 'devops',
    label_en: 'DevOps',
    label_ar: 'DevOps',
    sort_order: 50,
  },
  {
    id: '10000000-0000-4000-8000-000000000006',
    categoryKey: 'content',
    key: 'docs',
    label_en: 'Documentation and Content',
    label_ar: 'توثيق ومحتوى',
    sort_order: 60,
  },
];

const CATALOG_EXPERIENCE_LEVELS = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    key: 'zero_to_one',
    label_en: '0-1 year',
    label_ar: '0-1 سنة',
    sort_order: 10,
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    key: 'two_to_four',
    label_en: '2-4 years',
    label_ar: '2-4 سنوات',
    sort_order: 20,
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    key: 'five_to_ten',
    label_en: '5-10 years',
    label_ar: '5-10 سنوات',
    sort_order: 30,
  },
  {
    id: '20000000-0000-4000-8000-000000000004',
    key: 'ten_plus',
    label_en: '10+ years',
    label_ar: '10+ سنوات',
    sort_order: 40,
  },
];

async function ensureCatalogLookups() {
  const categoryIdsByKey = new Map<string, string>();
  for (const category of CATALOG_FIELD_CATEGORIES) {
    const existing = await prisma.contributorFieldCategory.findUnique({
      where: { key: category.key },
    });
    const seededCategory =
      existing ?? (await prisma.contributorFieldCategory.create({ data: category }));
    categoryIdsByKey.set(category.key, seededCategory.id);
    if (!existing) {
      console.log(`✅ Contributor field category created: ${category.key}`);
    }
  }

  for (const field of CATALOG_FIELDS) {
    const existing = await prisma.contributorField.findUnique({
      where: { key: field.key },
    });
    if (!existing) {
      const categoryId = categoryIdsByKey.get(field.categoryKey);
      if (!categoryId) {
        throw new Error(`Missing contributor field category: ${field.categoryKey}`);
      }
      const { categoryKey: _categoryKey, ...fieldData } = field;
      await prisma.contributorField.create({
        data: { ...fieldData, category_id: categoryId },
      });
      console.log(`✅ Contributor field created: ${field.key}`);
    }
  }

  for (const level of CATALOG_EXPERIENCE_LEVELS) {
    const existing = await prisma.contributorExperienceLevel.findUnique({
      where: { key: level.key },
    });
    if (!existing) {
      await prisma.contributorExperienceLevel.create({ data: level });
      console.log(`✅ Contributor experience level created: ${level.key}`);
    }
  }
}

async function ensureUsers(): Promise<Map<string, { id: string; email: string; role: UserRole }>> {
  const usersByEmail = new Map<string, { id: string; email: string; role: UserRole }>();

  for (const user of DEV_USERS) {
    const existing = await prisma.user.findUnique({
      where: { email: user.email },
    });

    let seededUser = existing;
    if (!seededUser) {
      seededUser = await prisma.user.create({
        data: {
          email: user.email,
          username: user.username,
          password_hash: await hashPassword(DEV_PASSWORD),
          first_name: user.firstName,
          last_name: user.lastName,
          role: user.role,
          status: 'active',
          preferred_language: 'en',
        },
      });
      console.log(`✅ ${user.role} user created: ${user.email}`);
    } else {
      if (!seededUser.username) {
        seededUser = await prisma.user.update({
          where: { id: seededUser.id },
          data: { username: user.username },
        });
      }
      console.log(`${user.email} already exists. Reusing account.`);
    }

    usersByEmail.set(user.email, {
      id: seededUser.id,
      email: seededUser.email,
      role: seededUser.role,
    });

    if (user.gold && (user.role === 'owner' || user.role === 'contributor')) {
      await ensureGoldSubscription(seededUser.id, user.role);
      console.log(`⭐ Gold ${user.role} subscription ready: ${user.email}`);
    }
  }

  return usersByEmail;
}

async function ensureGoldSubscription(
  userId: string,
  role: 'owner' | 'contributor',
): Promise<void> {
  const roleContext =
    role === 'owner'
      ? SubscriptionUserRoleContext.owner
      : SubscriptionUserRoleContext.contributor;
  const existing = await prisma.subscription.findFirst({
    where: {
      user_id: userId,
      user_role_context: roleContext,
      status: { in: [SubscriptionStatus.active, SubscriptionStatus.cancelled] },
    },
    orderBy: { created_at: 'desc' },
  });
  const plan = {
    plan_type: SubscriptionPlanType.gold,
    status: SubscriptionStatus.active,
    source: SubscriptionSource.demo,
    starts_at: new Date('2026-01-01T00:00:00.000Z'),
    expires_at: null,
    current_period_start: new Date('2026-01-01T00:00:00.000Z'),
    current_period_end: null,
    cancelled_at: null,
  };
  if (existing) {
    await prisma.subscription.update({ where: { id: existing.id }, data: plan });
    return;
  }
  await prisma.subscription.create({
    data: {
      user_id: userId,
      user_role_context: roleContext,
      ...plan,
    },
  });
}

async function ensureContributorProfileField(
  profileId: string,
  fieldId: string,
): Promise<void> {
  await prisma.contributorProfileField.upsert({
    where: {
      profile_id_field_id: {
        profile_id: profileId,
        field_id: fieldId,
      },
    },
    update: {},
    create: { profile_id: profileId, field_id: fieldId },
  });
}

async function ensureContributorProfiles(
  usersByEmail: Map<string, { id: string; email: string; role: UserRole }>,
) {
  const expTwoToFour = await prisma.contributorExperienceLevel.findUnique({
    where: { key: 'two_to_four' },
  });
  const expFiveToTen = await prisma.contributorExperienceLevel.findUnique({
    where: { key: 'five_to_ten' },
  });
  const fieldWeb = await prisma.contributorField.findUnique({
    where: { key: 'web' },
  });
  const fieldDevops = await prisma.contributorField.findUnique({
    where: { key: 'devops' },
  });
  const fieldAi = await prisma.contributorField.findUnique({
    where: { key: 'ai' },
  });

  const devContributor = usersByEmail.get('contributor@sharek.local');
  if (devContributor) {
    const existingProfile = await prisma.contributorProfile.findUnique({
      where: { user_id: devContributor.id },
    });

    if (!existingProfile) {
      const profile = await prisma.contributorProfile.create({
        data: {
          user_id: devContributor.id,
          bio: 'Full-stack developer building scalable web applications with React, TypeScript, and NestJS.',
          availability: '10-15 hrs/week',
          experience_level_id: expTwoToFour?.id ?? null,
          declared_skills: [
            'TypeScript',
            'React',
            'Node.js',
            'NestJS',
            'PostgreSQL',
            'Docker',
          ],
        },
      });

      if (fieldWeb) {
        await prisma.contributorProfileField.create({
          data: { profile_id: profile.id, field_id: fieldWeb.id },
        });
      }
      if (fieldDevops) {
        await prisma.contributorProfileField.create({
          data: { profile_id: profile.id, field_id: fieldDevops.id },
        });
      }
      console.log(`✅ Contributor profile created for ${devContributor.email}`);
    }

    const existingRep = await prisma.reputationRecord.findUnique({
      where: { user_id: devContributor.id },
    });
    if (!existingRep) {
      await prisma.reputationRecord.create({
        data: {
          user_id: devContributor.id,
          overall_rating: 4.8,
          total_contributions: 6,
          successful_contributions: 6,
          success_rate: 100.0,
          total_ratings_received: 5,
        },
      });
    }
  }

  const goldContributor = usersByEmail.get('gold-contributor@sharek.local');
  if (goldContributor) {
    const existingProfile = await prisma.contributorProfile.findUnique({
      where: { user_id: goldContributor.id },
    });

    if (!existingProfile) {
      const profile = await prisma.contributorProfile.create({
        data: {
          user_id: goldContributor.id,
          bio: 'Senior AI & Systems Engineer specialized in Python, PyTorch, FastAPI, and distributed microservices.',
          availability: '15-20 hrs/week',
          experience_level_id: expFiveToTen?.id ?? null,
          declared_skills: [
            'Python',
            'FastAPI',
            'TypeScript',
            'Docker',
            'PyTorch',
            'Tailwind CSS',
            'Redis',
          ],
        },
      });

      if (fieldAi) {
        await prisma.contributorProfileField.create({
          data: { profile_id: profile.id, field_id: fieldAi.id },
        });
      }
      if (fieldWeb) {
        await prisma.contributorProfileField.create({
          data: { profile_id: profile.id, field_id: fieldWeb.id },
        });
      }
      if (fieldDevops) {
        await prisma.contributorProfileField.create({
          data: { profile_id: profile.id, field_id: fieldDevops.id },
        });
      }
      console.log(
        `✅ Contributor profile created for ${goldContributor.email}`,
      );
    }

    const existingRep = await prisma.reputationRecord.findUnique({
      where: { user_id: goldContributor.id },
    });
    if (!existingRep) {
      await prisma.reputationRecord.create({
        data: {
          user_id: goldContributor.id,
          overall_rating: 5.0,
          total_contributions: 14,
          successful_contributions: 14,
          success_rate: 100.0,
          total_ratings_received: 12,
        },
      });
    }
  }

  const goldNoMatches = usersByEmail.get('gold-no-matches@sharek.local');
  if (goldNoMatches) {
    const profile = await prisma.contributorProfile.upsert({
      where: { user_id: goldNoMatches.id },
      update: {},
      create: {
        user_id: goldNoMatches.id,
        bio: 'Gold fixture with an approved specialty that is intentionally absent from the seeded requests.',
        availability: '5-10 hrs/week',
        experience_level_id: expTwoToFour?.id ?? null,
        declared_skills: ['Elixir'],
      },
    });
    if (fieldWeb) {
      await ensureContributorProfileField(profile.id, fieldWeb.id);
    }

    const existingRep = await prisma.reputationRecord.findUnique({
      where: { user_id: goldNoMatches.id },
    });
    if (!existingRep) {
      await prisma.reputationRecord.create({
        data: {
          user_id: goldNoMatches.id,
          overall_rating: 4.7,
          total_contributions: 4,
          successful_contributions: 4,
          success_rate: 100.0,
          total_ratings_received: 4,
        },
      });
    }
  }

  const goldNoSkills = usersByEmail.get('gold-no-skills@sharek.local');
  if (goldNoSkills) {
    const profile = await prisma.contributorProfile.upsert({
      where: { user_id: goldNoSkills.id },
      update: {},
      create: {
        user_id: goldNoSkills.id,
        bio: 'Gold fixture with a completed profile but no approved skills yet.',
        availability: '5-10 hrs/week',
        experience_level_id: expTwoToFour?.id ?? null,
        declared_skills: [],
      },
    });
    if (fieldWeb) {
      await ensureContributorProfileField(profile.id, fieldWeb.id);
    }

    const existingRep = await prisma.reputationRecord.findUnique({
      where: { user_id: goldNoSkills.id },
    });
    if (!existingRep) {
      await prisma.reputationRecord.create({
        data: {
          user_id: goldNoSkills.id,
          overall_rating: null,
          total_contributions: 0,
          successful_contributions: 0,
          success_rate: 0,
          total_ratings_received: 0,
        },
      });
    }
  }
}

async function ensureDemoGitHubAccounts(
  usersByEmail: Map<string, { id: string; email: string; role: UserRole }>,
) {
  const fixtures = [
    {
      email: 'contributor@sharek.local',
      githubId: 'sharek-demo-free-contributor',
      username: 'sharek-free-contributor',
    },
    {
      email: 'gold-contributor@sharek.local',
      githubId: 'sharek-demo-gold-contributor',
      username: 'sharek-gold-contributor',
    },
    {
      email: 'gold-no-matches@sharek.local',
      githubId: 'sharek-demo-gold-no-matches',
      username: 'sharek-gold-no-matches',
    },
    {
      email: 'gold-no-skills@sharek.local',
      githubId: 'sharek-demo-gold-no-skills',
      username: 'sharek-gold-no-skills',
    },
  ];

  for (const fixture of fixtures) {
    const user = usersByEmail.get(fixture.email);
    if (!user) continue;

    const existing = await prisma.gitHubAccount.findUnique({
      where: { user_id: user.id },
    });
    if (existing) continue;

    const githubIdInUse = await prisma.gitHubAccount.findUnique({
      where: { github_id: fixture.githubId },
    });
    if (githubIdInUse) {
      console.warn(
        `Skipping demo GitHub account for ${fixture.email}: github_id already exists`,
      );
      continue;
    }

    const connectedAt = new Date('2026-01-01T00:00:00.000Z');
    await prisma.gitHubAccount.create({
      data: {
        user_id: user.id,
        github_id: fixture.githubId,
        username: fixture.username,
        avatar_url: `https://github.com/${fixture.username}.png`,
        profile_url: `https://github.com/${fixture.username}`,
        raw_profile_data: {
          login: fixture.username,
          type: 'User',
          source: 'sharek-seed-fixture',
        },
        ingestion_status: GitHubAccountIngestionStatus.completed,
        connected_at: connectedAt,
        last_synced_at: connectedAt,
      },
    });
    console.log(`✅ Demo GitHub account ready: ${fixture.email}`);
  }
}

async function ensureNoSkillsReviewFixture(
  usersByEmail: Map<string, { id: string; email: string; role: UserRole }>,
) {
  const user = usersByEmail.get('gold-no-skills@sharek.local');
  if (!user) return;

  const existing = await prisma.skillProfileGeneration.findFirst({
    where: { user_id: user.id },
    orderBy: { created_at: 'desc' },
  });
  if (existing) return;

  const seededAt = new Date('2026-01-01T00:00:00.000Z');
  await prisma.skillProfileGeneration.create({
    data: {
      user_id: user.id,
      status: SkillProfileGenerationStatus.pending_review,
      selected_repositories: [],
      evidence_snapshot: {
        source: 'sharek-seed-fixture',
        note: 'Pending-review fixture with no approved skills.',
      },
      provider: 'seed-fixture',
      model: 'seed-fixture',
      prompt_version: 'seed-fixture-v1',
      schema_version: 'seed-fixture-v1',
      service_version: 'seed-fixture-v1',
      selected_repository_count: 0,
      snapshotted_repository_count: 0,
      consent_version: 'seed-fixture-v1',
      consented_at: seededAt,
      authorization_verified_at: seededAt,
    },
  });
  console.log(`✅ Pending-review no-skills fixture ready: ${user.email}`);
}

async function ensureSkillProfiles(
  usersByEmail: Map<string, { id: string; email: string; role: UserRole }>,
) {
  const devContributor = usersByEmail.get('contributor@sharek.local');
  if (devContributor) {
    const skillsToSeed = [
      {
        name: 'TypeScript',
        key: 'typescript',
        proficiency: SkillProfileProficiencyLevel.intermediate,
        confidence: 0.92,
        status: SkillProfileStatus.approved,
        summary:
          'Demonstrated strong TypeScript skills across multiple frontend and backend repositories.',
      },
      {
        name: 'React',
        key: 'react',
        proficiency: SkillProfileProficiencyLevel.intermediate,
        confidence: 0.89,
        status: SkillProfileStatus.approved,
        summary:
          'Extensive component architecture and state management experience.',
      },
      {
        name: 'Node.js',
        key: 'nodejs',
        proficiency: SkillProfileProficiencyLevel.intermediate,
        confidence: 0.86,
        status: SkillProfileStatus.approved,
        summary:
          'Built REST APIs and background services with Express and Node.js.',
      },
      {
        name: 'NestJS',
        key: 'nestjs',
        proficiency: SkillProfileProficiencyLevel.beginner,
        confidence: 0.78,
        status: SkillProfileStatus.pending,
        summary:
          'Modular architecture and dependency injection implementation.',
      },
    ];

    for (const skill of skillsToSeed) {
      const existing = await prisma.skillProfile.findFirst({
        where: {
          user_id: devContributor.id,
          skill_name: skill.name,
        },
      });
      if (!existing) {
        await prisma.skillProfile.create({
          data: {
            user_id: devContributor.id,
            skill_name: skill.name,
            skill_key: skill.key,
            proficiency_level: skill.proficiency,
            confidence_score: skill.confidence,
            status: skill.status,
            evidence_summary: skill.summary,
          },
        });
      }
    }
  }

  const goldContributor = usersByEmail.get('gold-contributor@sharek.local');
  if (goldContributor) {
    const skillsToSeed = [
      {
        name: 'Python',
        key: 'python',
        proficiency: SkillProfileProficiencyLevel.advanced,
        confidence: 0.97,
        status: SkillProfileStatus.approved,
        summary:
          'Senior Python development in async frameworks, data pipelines, and machine learning.',
      },
      {
        name: 'FastAPI',
        key: 'fastapi',
        proficiency: SkillProfileProficiencyLevel.advanced,
        confidence: 0.95,
        status: SkillProfileStatus.approved,
        summary:
          'Production high-performance API design with Pydantic and async endpoints.',
      },
      {
        name: 'TypeScript',
        key: 'typescript',
        proficiency: SkillProfileProficiencyLevel.advanced,
        confidence: 0.92,
        status: SkillProfileStatus.approved,
        summary:
          'Advanced TypeScript type modeling and clean architecture implementations.',
      },
      {
        name: 'Docker',
        key: 'docker',
        proficiency: SkillProfileProficiencyLevel.intermediate,
        confidence: 0.88,
        status: SkillProfileStatus.approved,
        summary:
          'Containerization, multi-stage builds, and docker-compose orchestration.',
      },
      {
        name: 'PyTorch',
        key: 'pytorch',
        proficiency: SkillProfileProficiencyLevel.intermediate,
        confidence: 0.85,
        status: SkillProfileStatus.approved,
        summary: 'Deep learning model fine-tuning and inference pipelines.',
      },
      {
        // Deliberately differs from the request's "Node.js" spelling. The
        // matching fixture verifies that normalized skill identity survives
        // all the way to the contributor dashboard.
        name: 'NodeJS',
        key: 'nodejs',
        proficiency: SkillProfileProficiencyLevel.intermediate,
        confidence: 0.9,
        status: SkillProfileStatus.approved,
        summary: 'Built backend services and APIs with NodeJS.',
      },
    ];

    for (const skill of skillsToSeed) {
      const existing = await prisma.skillProfile.findFirst({
        where: {
          user_id: goldContributor.id,
          skill_name: skill.name,
        },
      });
      if (!existing) {
        await prisma.skillProfile.create({
          data: {
            user_id: goldContributor.id,
            skill_name: skill.name,
            skill_key: skill.key,
            proficiency_level: skill.proficiency,
            confidence_score: skill.confidence,
            status: skill.status,
            evidence_summary: skill.summary,
          },
        });
      }
    }
  }

  const goldNoMatches = usersByEmail.get('gold-no-matches@sharek.local');
  if (goldNoMatches) {
    const skill = {
      name: 'Elixir',
      key: 'elixir',
      proficiency: SkillProfileProficiencyLevel.intermediate,
      confidence: 0.88,
      status: SkillProfileStatus.approved,
      summary: 'Approved Elixir experience for the no-match dashboard fixture.',
    };
    const existing = await prisma.skillProfile.findFirst({
      where: { user_id: goldNoMatches.id, skill_name: skill.name },
    });
    if (!existing) {
      await prisma.skillProfile.create({
        data: {
          user_id: goldNoMatches.id,
          skill_name: skill.name,
          skill_key: skill.key,
          proficiency_level: skill.proficiency,
          confidence_score: skill.confidence,
          status: skill.status,
          evidence_summary: skill.summary,
        },
      });
    }
  }
}

interface ProjectSeedData {
  ownerEmail: string;
  title: string;
  slug: string;
  description: string;
  github_repo_url: string;
  category: ProjectCategory;
  difficulty: ProjectDifficulty;
  languages: string[];
  tags: string[];
  technologies: string[];
  readme: string;
  requests: Array<{
    title: string;
    description: string;
    technology_tags: string[];
    difficulty: ContributionRequestDifficulty;
    reward: number;
    reward_currency: string;
    requirements: Array<{
      kind: ContributionRequestRequirementKind;
      position: number;
      text: string;
    }>;
    skillRequirements: Array<{
      skill_name: string;
      required_level: SkillProfileProficiencyLevel;
      kind: ContributionRequestRequirementKind;
      position: number;
    }>;
  }>;
}

const SEED_PROJECTS: ProjectSeedData[] = [
  {
    ownerEmail: 'karim-muhammad@sharek.local',
    title: 'mentoor-swc-todo',
    slug: 'mentoor-swc-todo',
    description:
      'Development seed for the public Karim-Muhammad/mentoor-swc-todo repository. Refresh the project source to load verified GitHub metadata.',
    github_repo_url: 'https://github.com/Karim-Muhammad/mentoor-swc-todo',
    category: ProjectCategory.web,
    difficulty: ProjectDifficulty.beginner,
    languages: [],
    tags: [],
    technologies: [],
    readme: 'Source metadata is populated by the Project source refresh workflow.',
    requests: [
      {
        title: 'Document the contribution setup',
        description:
          'Write a concise contributor setup guide after reviewing the repository structure and local development workflow.',
        technology_tags: [],
        difficulty: ContributionRequestDifficulty.beginner,
        reward: 0,
        reward_currency: 'USD',
        requirements: [
          {
            kind: ContributionRequestRequirementKind.required,
            position: 1,
            text: 'Produce a clear local setup and contribution guide',
          },
        ],
        skillRequirements: [
          {
            skill_name: 'Documentation',
            required_level: SkillProfileProficiencyLevel.beginner,
            kind: ContributionRequestRequirementKind.required,
            position: 1,
          },
        ],
      },
    ],
  },
  {
    ownerEmail: 'karim-muhammad@sharek.local',
    title: 'ecommerce-api2',
    slug: 'ecommerce-api2',
    description:
      'Development seed for the public Karim-Muhammad/ecommerce-api2 repository. Refresh the project source to load verified GitHub metadata.',
    github_repo_url: 'https://github.com/Karim-Muhammad/ecommerce-api2',
    category: ProjectCategory.web,
    difficulty: ProjectDifficulty.intermediate,
    languages: [],
    tags: [],
    technologies: [],
    readme: 'Source metadata is populated by the Project source refresh workflow.',
    requests: [
      {
        title: 'Review API error handling',
        description:
          'Review the repository error-handling paths and propose a focused improvement with tests.',
        technology_tags: [],
        difficulty: ContributionRequestDifficulty.intermediate,
        reward: 0,
        reward_currency: 'USD',
        requirements: [
          {
            kind: ContributionRequestRequirementKind.required,
            position: 1,
            text: 'Identify one error-handling improvement and cover it with tests',
          },
        ],
        skillRequirements: [
          {
            skill_name: 'JavaScript',
            required_level: SkillProfileProficiencyLevel.intermediate,
            kind: ContributionRequestRequirementKind.required,
            position: 1,
          },
        ],
      },
    ],
  },
  {
    ownerEmail: 'karim-muhammad@sharek.local',
    title: 'laracommerce',
    slug: 'laracommerce',
    description:
      'Development seed for the public Karim-Muhammad/laracommerce repository. Refresh the project source to load verified GitHub metadata.',
    github_repo_url: 'https://github.com/Karim-Muhammad/laracommerce',
    category: ProjectCategory.web,
    difficulty: ProjectDifficulty.intermediate,
    languages: [],
    tags: [],
    technologies: [],
    readme: 'Source metadata is populated by the Project source refresh workflow.',
    requests: [
      {
        title: 'Map the contribution workflow',
        description:
          'Map the repository contribution workflow and identify one small, well-scoped improvement for a new contributor.',
        technology_tags: [],
        difficulty: ContributionRequestDifficulty.intermediate,
        reward: 0,
        reward_currency: 'USD',
        requirements: [
          {
            kind: ContributionRequestRequirementKind.required,
            position: 1,
            text: 'Describe one scoped improvement with acceptance criteria',
          },
        ],
        skillRequirements: [
          {
            skill_name: 'PHP',
            required_level: SkillProfileProficiencyLevel.beginner,
            kind: ContributionRequestRequirementKind.required,
            position: 1,
          },
        ],
      },
    ],
  },
  {
    ownerEmail: 'owner@sharek.local',
    title: 'Share-k Community Platform',
    slug: 'sharek-platform',
    description:
      'An open source collaborative matching and contribution platform connecting project owners and talented engineers.',
    github_repo_url: 'https://github.com/ITI-Sharek/Sharek',
    category: ProjectCategory.web,
    difficulty: ProjectDifficulty.intermediate,
    languages: ['TypeScript', 'JavaScript', 'HTML', 'CSS'],
    tags: ['opensource', 'community', 'react', 'nestjs'],
    technologies: [
      'TypeScript',
      'NestJS',
      'React',
      'PostgreSQL',
      'Redis',
      'Tailwind CSS',
    ],
    readme:
      '# Share-k Platform\n\nCollaborative open-source matchmaking and contribution platform.',
    requests: [
      {
        title: 'Implement Realtime Notification Center',
        description:
          'Design and implement the real-time notification drawer with unread counter badges, sound alerts, and WebSocket event subscribers.',
        technology_tags: ['TypeScript', 'NestJS', 'Socket.IO', 'Redis'],
        difficulty: ContributionRequestDifficulty.intermediate,
        reward: 150.0,
        reward_currency: 'USD',
        requirements: [
          {
            kind: ContributionRequestRequirementKind.required,
            position: 1,
            text: 'Implement Redis-backed WebSocket gateway for broadcast events',
          },
          {
            kind: ContributionRequestRequirementKind.required,
            position: 2,
            text: 'Add notification center UI with unread badge and sound alerts',
          },
          {
            kind: ContributionRequestRequirementKind.preferred,
            position: 1,
            text: 'Experience with BullMQ background queue workers',
          },
        ],
        skillRequirements: [
          {
            skill_name: 'TypeScript',
            required_level: SkillProfileProficiencyLevel.intermediate,
            kind: ContributionRequestRequirementKind.required,
            position: 1,
          },
          {
            skill_name: 'NestJS',
            required_level: SkillProfileProficiencyLevel.beginner,
            kind: ContributionRequestRequirementKind.required,
            position: 2,
          },
          {
            skill_name: 'Redis',
            required_level: SkillProfileProficiencyLevel.beginner,
            kind: ContributionRequestRequirementKind.preferred,
            position: 3,
          },
        ],
      },
    ],
  },
  {
    ownerEmail: 'gold-owner@sharek.local',
    title: 'AI Intelligent Code Reviewer',
    slug: 'ai-code-reviewer',
    description:
      'Automated AI code review engine providing architectural insights, linting, and vulnerability scanning.',
    github_repo_url: 'https://github.com/ITI-Sharek/ai-reviewer',
    category: ProjectCategory.ai_ml,
    difficulty: ProjectDifficulty.advanced,
    languages: ['Python', 'TypeScript'],
    tags: ['ai', 'llm', 'fastapi', 'code-review'],
    technologies: ['Python', 'FastAPI', 'PyTorch', 'Redis', 'Docker'],
    readme:
      '# AI Code Reviewer\n\nAutomated AI code review and architectural analysis tool.',
    requests: [
      {
        title: 'FastAPI Model Analysis & Chunking Pipeline',
        description:
          'Construct an asynchronous document analysis service in FastAPI that chunks pull request files and streams LLM feedback.',
        technology_tags: ['Python', 'FastAPI', 'PyTorch', 'Docker'],
        difficulty: ContributionRequestDifficulty.advanced,
        reward: 250.0,
        reward_currency: 'USD',
        requirements: [
          {
            kind: ContributionRequestRequirementKind.required,
            position: 1,
            text: 'Build asynchronous chunk extraction and batch inference pipeline',
          },
          {
            kind: ContributionRequestRequirementKind.required,
            position: 2,
            text: 'Integrate vector embeddings for similarity scoring and prompt context',
          },
          {
            kind: ContributionRequestRequirementKind.preferred,
            position: 1,
            text: 'Experience with streaming responses and server-sent events',
          },
        ],
        skillRequirements: [
          {
            skill_name: 'Python',
            required_level: SkillProfileProficiencyLevel.advanced,
            kind: ContributionRequestRequirementKind.required,
            position: 1,
          },
          {
            skill_name: 'FastAPI',
            required_level: SkillProfileProficiencyLevel.intermediate,
            kind: ContributionRequestRequirementKind.required,
            position: 2,
          },
          {
            skill_name: 'Docker',
            required_level: SkillProfileProficiencyLevel.beginner,
            kind: ContributionRequestRequirementKind.preferred,
            position: 3,
          },
        ],
      },
    ],
  },
  {
    ownerEmail: 'owner@sharek.local',
    title: 'Cloud & DevOps Infrastructure Automation',
    slug: 'devops-infra-automation',
    description:
      'Infrastructure as code templates, CI/CD automated deployment pipelines, and observability tooling.',
    github_repo_url: 'https://github.com/ITI-Sharek/devops-infra',
    category: ProjectCategory.devops,
    difficulty: ProjectDifficulty.intermediate,
    languages: ['HCL', 'Shell', 'Dockerfile'],
    tags: ['devops', 'docker', 'ci-cd', 'kubernetes'],
    technologies: [
      'Docker',
      'GitHub Actions',
      'Terraform',
      'Kubernetes',
      'Prometheus',
    ],
    readme:
      '# DevOps Infra Automation\n\nInfrastructure automation, deployment pipelines, and monitoring.',
    requests: [
      {
        title: 'Multi-Stage Docker & GitHub Actions CI/CD',
        description:
          'Optimize Dockerfile layer caching, build multi-arch container images, and write GitHub Actions automated testing pipelines.',
        technology_tags: ['Docker', 'GitHub Actions', 'Shell'],
        difficulty: ContributionRequestDifficulty.intermediate,
        reward: 120.0,
        reward_currency: 'USD',
        requirements: [
          {
            kind: ContributionRequestRequirementKind.required,
            position: 1,
            text: 'Create optimized multi-stage build workflow with layer caching',
          },
          {
            kind: ContributionRequestRequirementKind.required,
            position: 2,
            text: 'Configure automated Jest and Lint verification on pull requests',
          },
        ],
        skillRequirements: [
          {
            skill_name: 'Docker',
            required_level: SkillProfileProficiencyLevel.intermediate,
            kind: ContributionRequestRequirementKind.required,
            position: 1,
          },
        ],
      },
    ],
  },
  {
    ownerEmail: 'gold-owner@sharek.local',
    title: 'Share-k Mobile Companion',
    slug: 'sharek-mobile',
    description:
      'Cross-platform mobile application for real-time notifications, project updates, and contribution chats.',
    github_repo_url: 'https://github.com/ITI-Sharek/sharek-mobile',
    category: ProjectCategory.mobile,
    difficulty: ProjectDifficulty.beginner,
    languages: ['Dart', 'Flutter'],
    tags: ['mobile', 'flutter', 'ios', 'android'],
    technologies: ['Flutter', 'Dart', 'Socket.IO', 'Firebase'],
    readme:
      '# Share-k Mobile Companion\n\nMobile companion app for Android and iOS.',
    requests: [
      {
        title: 'Flutter Authentication & Profile Views',
        description:
          'Build modern, accessible authentication screens and contributor profile viewers in Flutter with responsive dark mode.',
        technology_tags: ['Flutter', 'Dart', 'Socket.IO'],
        difficulty: ContributionRequestDifficulty.beginner,
        reward: 100.0,
        reward_currency: 'USD',
        requirements: [
          {
            kind: ContributionRequestRequirementKind.required,
            position: 1,
            text: 'Implement login and registration flow with form validation',
          },
          {
            kind: ContributionRequestRequirementKind.required,
            position: 2,
            text: 'Design responsive profile overview with skill proficiency chips',
          },
        ],
        skillRequirements: [
          {
            skill_name: 'Flutter',
            required_level: SkillProfileProficiencyLevel.beginner,
            kind: ContributionRequestRequirementKind.required,
            position: 1,
          },
          {
            skill_name: 'Dart',
            required_level: SkillProfileProficiencyLevel.beginner,
            kind: ContributionRequestRequirementKind.required,
            position: 2,
          },
        ],
      },
    ],
  },
  {
    ownerEmail: 'gold-owner@sharek.local',
    title: 'Gold Matching Skill Normalization Fixture',
    slug: 'gold-matching-skill-normalization',
    description:
      'A deterministic development fixture proving that equivalent skill spellings match correctly in the Gold contributor dashboard.',
    github_repo_url: 'https://github.com/ITI-Sharek/gold-matching-fixture',
    category: ProjectCategory.web,
    difficulty: ProjectDifficulty.intermediate,
    languages: ['JavaScript', 'TypeScript'],
    tags: ['matching', 'normalization', 'development-fixture'],
    technologies: ['Node.js', 'TypeScript'],
    readme:
      '# Gold Matching Skill Normalization Fixture\n\nThis project exists only to exercise the NodeJS versus Node.js matching case locally.',
    requests: [
      {
        title: 'Node.js Skill Normalization Check',
        description:
          'Implement a small Node.js service and verify that the contribution request can be matched to an approved NodeJS skill.',
        technology_tags: ['Node.js', 'TypeScript'],
        difficulty: ContributionRequestDifficulty.intermediate,
        reward: 80.0,
        reward_currency: 'USD',
        requirements: [
          {
            kind: ContributionRequestRequirementKind.required,
            position: 1,
            text: 'Implement the Node.js service and add focused tests',
          },
        ],
        skillRequirements: [
          {
            skill_name: 'Node.js',
            required_level: SkillProfileProficiencyLevel.intermediate,
            kind: ContributionRequestRequirementKind.required,
            position: 1,
          },
        ],
      },
    ],
  },
];

async function ensureProjectsAndContributionRequests(
  usersByEmail: Map<string, { id: string; email: string; role: UserRole }>,
) {
  const now = new Date();
  const applicationsCloseAt = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000,
  );
  const targetCompletionDate = new Date(
    now.getTime() + 60 * 24 * 60 * 60 * 1000,
  );

  for (const item of SEED_PROJECTS) {
    const owner = usersByEmail.get(item.ownerEmail);
    if (!owner) continue;

    const slugNormalized = item.slug.toLowerCase().trim();
    let project = await prisma.project.findUnique({
      where: { slug_normalized: slugNormalized },
    });

    if (!project) {
      project = await prisma.project.create({
        data: {
          owner_id: owner.id,
          title: item.title,
          slug: item.slug,
          slug_normalized: slugNormalized,
          description: item.description,
          github_repo_url: item.github_repo_url,
          category: item.category,
          difficulty: item.difficulty,
          status: ProjectStatus.published,
          published_at: now,
          languages: item.languages,
          tags: item.tags,
          technologies: item.technologies,
          readme_content: item.readme,
        },
      });
      console.log(`✅ Project created: ${item.title}`);
    } else {
      console.log(`Project already exists: ${item.title}`);
    }

    for (const req of item.requests) {
      let contributionRequest = await prisma.contributionRequest.findFirst({
        where: {
          project_id: project.id,
          title: req.title,
        },
      });

      if (!contributionRequest) {
        contributionRequest = await prisma.contributionRequest.create({
          data: {
            project_id: project.id,
            owner_id: owner.id,
            title: req.title,
            description: req.description,
            technology_tags: req.technology_tags,
            difficulty: req.difficulty,
            applications_close_at: applicationsCloseAt,
            target_completion_date: targetCompletionDate,
            reward: req.reward,
            reward_currency: req.reward_currency,
            status: ContributionRequestStatus.published,
            max_applicants: 3,
            published_at: now,
            skill_inference_status:
              ContributionRequestSkillInferenceStatus.succeeded,
          },
        });
        console.log(`✅ Contribution Request created: ${req.title}`);

        for (const requirement of req.requirements) {
          await prisma.contributionRequestRequirement.create({
            data: {
              contribution_request_id: contributionRequest.id,
              kind: requirement.kind,
              position: requirement.position,
              text: requirement.text,
            },
          });
        }

        for (const skillReq of req.skillRequirements) {
          await prisma.contributionRequestSkillRequirement.create({
            data: {
              contribution_request_id: contributionRequest.id,
              skill_name: skillReq.skill_name,
              skill_name_normalized: normalizeSkillName(skillReq.skill_name),
              required_level: skillReq.required_level,
              kind: skillReq.kind,
              source: ContributionRequestSkillRequirementSource.owner_override,
              position: skillReq.position,
            },
          });
        }
      }
    }
  }
}

async function main() {
  console.log('Starting database seed...');

  await ensureCatalogLookups();
  const usersByEmail = await ensureUsers();
  await ensureContributorProfiles(usersByEmail);
  await ensureDemoGitHubAccounts(usersByEmail);
  await ensureSkillProfiles(usersByEmail);
  await ensureNoSkillsReviewFixture(usersByEmail);
  await ensureProjectsAndContributionRequests(usersByEmail);

  console.log('✅ Seed completed successfully!');
  console.log(`🔑 Password for all dev users: ${DEV_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error('Failed to seed database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
