const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const roles = await p.role.findMany({ select: { id: true, name: true, code: true } });
  console.log('ROLES', JSON.stringify(roles, null, 2));
  const users = await p.user.findMany({
    select: { id: true, email: true, fullName: true, role: { select: { name: true, code: true } } },
    take: 30,
  });
  console.log('USERS', JSON.stringify(users, null, 2));
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
