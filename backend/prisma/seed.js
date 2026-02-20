import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // cria filial padrão
  const branch = await prisma.branch.upsert({
    where: { id: 1 },
    update: {},
    create: { name: "Cascavel" },
  });

  // cria admin padrão
  const passwordHash = await bcrypt.hash("admin123", 10);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      passwordHash,
      role: "ADMIN",
      branchId: branch.id,
    },
    create: {
      username: "admin",
      passwordHash,
      role: "ADMIN",
      branchId: branch.id,
    },
  });

  console.log("✅ Seed OK: admin / admin123");
}

main()
  .catch((e) => {
    console.error("❌ Seed erro:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
