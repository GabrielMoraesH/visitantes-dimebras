import prisma from "../lib/prisma.js";

const BRANCH_LIST_SELECT = {
  id: true,
  name: true,
};

export async function listBranches() {
  return prisma.branch.findMany({
    orderBy: { id: "asc" },
    select: BRANCH_LIST_SELECT,
  });
}
