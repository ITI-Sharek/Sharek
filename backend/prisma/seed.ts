import { PrismaClient } from '@prisma/client';
import { randomBytes, scrypt as scryptCallback } from 'crypto';
import { promisify } from 'util';

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

async function main() {
  console.log('Starting database seed...');

  const adminEmail = 'admin@sharek.local';
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log('Admin user already exists. Skipping creation.');
    return;
  }

  const passwordHash = await hashPassword('Admin@1234');

  await prisma.user.create({
    data: {
      email: adminEmail,
      password_hash: passwordHash,
      first_name: 'System',
      last_name: 'Admin',
      role: 'admin',
      status: 'active',
      preferred_language: 'en',
    },
  });

  console.log('✅ Admin user successfully created!');
  console.log(`📧 Email: ${adminEmail}`);
  console.log(`🔑 Password: Admin@1234`);
}

main()
  .catch((e) => {
    console.error('Failed to seed database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
