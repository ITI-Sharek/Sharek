import {
  PrismaClient,
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

const DEV_PASSWORD = 'Admin@1234';

const DEV_USERS: Array<{
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  gold?: boolean;
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
    email: 'gold-owner@sharek.local',
    role: 'owner',
    firstName: 'Gold',
    lastName: 'Owner',
    gold: true,
  },
  {
    email: 'contributor@sharek.local',
    role: 'contributor',
    firstName: 'Dev',
    lastName: 'Contributor',
  },
  {
    email: 'gold-contributor@sharek.local',
    role: 'contributor',
    firstName: 'Gold',
    lastName: 'Contributor',
    gold: true,
  },
];

async function main() {
  console.log('Starting database seed...');

  for (const user of DEV_USERS) {
    const existing = await prisma.user.findUnique({
      where: { email: user.email },
    });

    const seededUser =
      existing ??
      (await prisma.user.create({
        data: {
          email: user.email,
          password_hash: await hashPassword(DEV_PASSWORD),
          first_name: user.firstName,
          last_name: user.lastName,
          role: user.role,
          status: 'active',
          preferred_language: 'en',
        },
      }));

    console.log(
      existing
        ? `${user.email} already exists. Reusing account.`
        : `✅ ${user.role} user created: ${user.email}`,
    );

    if (user.gold && (user.role === 'owner' || user.role === 'contributor')) {
      await ensureGoldSubscription(seededUser.id, user.role);
      console.log(`⭐ Gold ${user.role} subscription ready: ${user.email}`);
    }
  }

  console.log(`🔑 Password for all dev users: ${DEV_PASSWORD}`);
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

main()
  .catch((e) => {
    console.error('Failed to seed database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
