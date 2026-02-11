const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
  const prisma = new PrismaClient();

  const email = 'root@test.com';
  const password = 'omnamahshivaay';

  const password_hash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: { password_hash, is_admin: true },
    create: { email, password_hash, is_admin: true },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded admin user: ${email}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
