import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import prisma from "../src/lib/prisma.js";

dotenv.config();

export const OFFICIAL_BRANCHES = [
  { id: 1, name: "Dimebras PR" },
  { id: 2, name: "Alfamed MS" },
  { id: 3, name: "Dimebras MT" },
  { id: 5, name: "Dimebras MS" },
  { id: 6, name: "Dimebras SC" },
];

function describeBranch(branch) {
  return `id=${branch.id}, name=${branch.name}`;
}

export async function ensureOfficialBranches(db = prisma) {
  return db.$transaction(async (tx) => {
    const ids = OFFICIAL_BRANCHES.map((branch) => branch.id);
    const names = OFFICIAL_BRANCHES.map((branch) => branch.name);

    const existingById = await tx.branch.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });

    const existingByName = await tx.branch.findMany({
      where: { name: { in: names } },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });

    for (const official of OFFICIAL_BRANCHES) {
      const branchWithId = existingById.find((branch) => branch.id === official.id);
      if (branchWithId && branchWithId.name !== official.name) {
        throw new Error(
          `Conflito de filial oficial: ID ${official.id} deveria ser ${official.name}, mas esta ocupado por ${describeBranch(branchWithId)}.`
        );
      }

      const branchWithName = existingByName.find((branch) => branch.name === official.name);
      if (branchWithName && branchWithName.id !== official.id) {
        throw new Error(
          `Conflito de filial oficial: ${official.name} deveria usar ID ${official.id}, mas existe como ${describeBranch(branchWithName)}.`
        );
      }
    }

    const existingOfficialIds = new Set(existingById.map((branch) => branch.id));
    for (const official of OFFICIAL_BRANCHES) {
      if (!existingOfficialIds.has(official.id)) {
        await tx.branch.create({
          data: { id: official.id, name: official.name },
        });
      }
    }

    await tx.$executeRaw`
      SELECT setval(
        pg_get_serial_sequence('branches', 'id'),
        GREATEST((SELECT COALESCE(MAX(id), 0) FROM branches), 6),
        true
      )
    `;
  });
}

export async function main() {
  const adminSeedPassword = process.env.ADMIN_SEED_PASSWORD;

  if (!adminSeedPassword) {
    throw new Error(
      "ADMIN_SEED_PASSWORD nao definida. Configure essa variavel no ambiente antes de executar o seed."
    );
  }

  await ensureOfficialBranches(prisma);

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
        branchId: 1,
      },
    });
  }

  console.log(
    existingAdmin
      ? "Seed OK: filial padrao verificada; usuario admin existente preservado."
      : "Seed OK: filial padrao verificada; usuario admin criado."
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .catch((e) => {
      console.error("Seed erro:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
