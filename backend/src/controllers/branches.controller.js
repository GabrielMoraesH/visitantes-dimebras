import prisma from "../lib/prisma.js";

export async function listBranches(req, res) {
  try {
    const items = await prisma.branch.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    return res.json(items);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao carregar filiais" });
  }
}
