import {
  PrismaClient,
  SubscriptionEntitlementKey,
  SubscriptionPlanType,
  SubscriptionSource,
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

const DEV_PASSWORD = 'Admin@1234';

const DEV_USERS: Array<{
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
}> = [
  {
    email: 'admin@sharek.local',
    role: 'admin',
    firstName: 'System',
    lastName: 'Admin',
  },
  {
    email: 'owner@sharek.local',
    role: 'owner',
    firstName: 'Dev',
    lastName: 'Owner',
  },
  {
    email: 'contributor@sharek.local',
    role: 'contributor',
    firstName: 'Dev',
    lastName: 'Contributor',
  },
];

async function main() {
  console.log('Starting database seed...');

  for (const user of DEV_USERS) {
    const existing = await prisma.user.findUnique({
      where: { email: user.email },
    });

    if (existing) {
      console.log(`${user.email} already exists. Skipping creation.`);
      continue;
    }

    const passwordHash = await hashPassword(DEV_PASSWORD);

    await prisma.user.create({
      data: {
        email: user.email,
        password_hash: passwordHash,
        first_name: user.firstName,
        last_name: user.lastName,
        role: user.role,
        status: 'active',
        preferred_language: 'en',
      },
    });

    console.log(`✅ ${user.role} user created: ${user.email}`);
  }

  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: 'owner@sharek.local' },
  });
  const contributor = await prisma.user.findUniqueOrThrow({
    where: { email: 'contributor@sharek.local' },
  });
  await ensureDemoSubscription({
    userId: owner.id,
    roleContext: SubscriptionUserRoleContext.owner,
    planType: SubscriptionPlanType.bronze,
  });
  await ensureDemoSubscription({
    userId: contributor.id,
    roleContext: SubscriptionUserRoleContext.contributor,
    planType: SubscriptionPlanType.bronze,
  });
  await ensureDemoMaterialAnalysisEntitlement(owner.id);

  console.log(`🔑 Password for all dev users: ${DEV_PASSWORD}`);
}

async function ensureDemoSubscription(input: {
  userId: string;
  roleContext: SubscriptionUserRoleContext;
  planType: SubscriptionPlanType;
}): Promise<void> {
  const active = await prisma.subscription.findFirst({
    where: {
      user_id: input.userId,
      user_role_context: input.roleContext,
      status: 'active',
    },
  });
  if (active) return;

  await prisma.subscription.create({
    data: {
      user_id: input.userId,
      plan_type: input.planType,
      user_role_context: input.roleContext,
      source: SubscriptionSource.demo,
      starts_at: new Date(),
    },
  });
}

async function ensureDemoMaterialAnalysisEntitlement(
  userId: string,
): Promise<void> {
  const active = await prisma.subscriptionEntitlement.findFirst({
    where: {
      user_id: userId,
      key: SubscriptionEntitlementKey.project_material_analysis,
      status: 'active',
    },
  });
  if (active) return;

  await prisma.subscriptionEntitlement.create({
    data: {
      user_id: userId,
      key: SubscriptionEntitlementKey.project_material_analysis,
      source: SubscriptionSource.demo,
      starts_at: new Date(),
    },
  });
}

main()
  .catch((e) => {
    console.error('Failed to seed database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
