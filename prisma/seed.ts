import { PrismaClient, UserRole } from '@prisma/client';
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
