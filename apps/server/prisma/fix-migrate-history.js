const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();

  const deleted = await prisma.$executeRawUnsafe(
    "delete from _prisma_migrations where migration_name = '20260207213000_init' and rolled_back_at is not null",
  );

  // eslint-disable-next-line no-console
  console.log(`Deleted rolled-back init migration rows: ${deleted}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
