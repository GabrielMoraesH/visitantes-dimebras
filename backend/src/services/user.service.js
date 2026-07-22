import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { ALL_USER_ROLES } from "../constants/roles.js";
import { idParamSchema, passwordSchema, usernameSchema } from "../utils/validation.js";

const USER_SAFE_SELECT = {
  id: true,
  username: true,
  role: true,
  branchId: true,
  isActive: true,
  createdAt: true,
  branch: { select: { name: true } },
};

const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(ALL_USER_ROLES).optional().default("RECEPCAO"),
  branchId: z.number().int().positive("branchId inválido"),
}).strict();

const updateUserSchema = z.object({
  username: usernameSchema.optional(),
  password: passwordSchema.optional(),
  role: z.enum(ALL_USER_ROLES).optional(),
  branchId: z.number().int().positive("branchId inválido").optional(),
}).strict();

function parseUserId(userId) {
  if (userId && typeof userId === "object") return idParamSchema.parse(userId).id;
  return idParamSchema.parse({ id: String(userId) }).id;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function branchExists(branchId) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
  });

  return Boolean(branch);
}

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: { id: "asc" },
    select: USER_SAFE_SELECT,
  });
}

export async function createUser({ actor, input }) {
  const data = createUserSchema.parse(input);

  const exists = await prisma.user.findUnique({
    where: { username: data.username },
  });
  if (exists) return { ok: false, status: 400, message: "Usuário já existe" };

  const hasBranch = await branchExists(data.branchId);
  if (!hasBranch) return { ok: false, status: 400, message: "Filial (branchId) não existe" };

  const passwordHash = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      username: data.username,
      passwordHash,
      role: data.role,
      branchId: data.branchId,
      isActive: true,
    },
    select: USER_SAFE_SELECT,
  });

  return { ok: true, user };
}

export async function disableUser({ actor, userId }) {
  const id = parseUserId(userId);

  if (id === 1) {
    return { ok: false, status: 400, message: "Não é permitido desativar o ADMIN (id=1)" };
  }

  if (Number(actor?.id) === id) {
    return { ok: false, status: 400, message: "Você não pode desativar seu próprio usuário" };
  }

  const exists = await prisma.user.findUnique({ where: { id } });
  if (!exists) return { ok: false, status: 404, message: "Usuário não encontrado" };

  if (exists.isActive === false) {
    return { ok: true };
  }

  await prisma.user.update({
    where: { id },
    data: { isActive: false },
  });

  return { ok: true };
}

export async function enableUser({ actor, userId }) {
  const id = parseUserId(userId);

  const exists = await prisma.user.findUnique({ where: { id } });
  if (!exists) {
    return { ok: false, status: 404, message: "Usuário não encontrado" };
  }

  if (exists.isActive === true) {
    return { ok: true };
  }

  await prisma.user.update({
    where: { id },
    data: { isActive: true },
  });

  return { ok: true };
}

export async function updateUser({ actor, userId, input }) {
  const id = parseUserId(userId);
  const data = updateUserSchema.parse(input);

  const exists = await prisma.user.findUnique({ where: { id } });
  if (!exists) return { ok: false, status: 404, message: "Usuário não encontrado" };

  if (id === 1) {
    const triedOtherFields =
      typeof data.username !== "undefined" ||
      typeof data.role !== "undefined" ||
      typeof data.branchId !== "undefined";

    if (triedOtherFields) {
      return {
        ok: false,
        status: 400,
        message: "No ADMIN (id=1) só é permitido alterar a senha",
      };
    }

    if (!data.password) {
      return { ok: false, status: 400, message: "Informe a nova senha do ADMIN" };
    }

    const user = await prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(data.password) },
      select: USER_SAFE_SELECT,
    });

    return { ok: true, user };
  }

  if (data.username && data.username !== exists.username) {
    const conflict = await prisma.user.findUnique({ where: { username: data.username } });
    if (conflict) return { ok: false, status: 400, message: "Username já existe" };
  }

  if (typeof data.branchId === "number") {
    const hasBranch = await branchExists(data.branchId);
    if (!hasBranch) return { ok: false, status: 400, message: "Filial (branchId) não existe" };
  }

  const updateData = {};
  if (data.username) updateData.username = data.username;
  if (data.role) updateData.role = data.role;
  if (typeof data.branchId === "number") updateData.branchId = data.branchId;

  if (data.password) {
    updateData.passwordHash = await hashPassword(data.password);
  }

  if (Object.keys(updateData).length === 0) {
    return { ok: false, status: 400, message: "Nada para atualizar" };
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: USER_SAFE_SELECT,
  });

  return { ok: true, user };
}
