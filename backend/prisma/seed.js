import bcrypt from "bcrypt";
import dotenv from "dotenv";
import prisma from "../src/lib/prisma.js";

dotenv.config();

async function main() {
  const adminSeedPassword = process.env.ADMIN_SEED_PASSWORD;

  if (!adminSeedPassword) {
    throw new Error(
      "ADMIN_SEED_PASSWORD nao definida. Configure essa variavel no ambiente antes de executar o seed."
    );
  }

  const branch = await prisma.branch.upsert({
    where: { id: 1 },
    update: {},
    create: { name: "Cascavel" },
  });

  const existingAdmin = await prisma.user.findUnique({
    where: { username: "admin" },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminSeedPassword, 10);

    await prisma.user.create({
      data: {
        username: "admin",
        passwordHash,
        role: "ADMIN",
        branchId: branch.id,
      },
    });
  }

  console.log(
    existingAdmin
      ? "Seed OK: filial padrao verificada; usuario admin existente preservado."
      : "Seed OK: filial padrao verificada; usuario admin criado."
  );
}

main()
  .catch((e) => {
    console.error("Seed erro:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
