import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { ALL_USER_ROLES } from "../constants/roles.js";
import { idParamSchema, passwordSchema, usernameSchema } from "../utils/validation.js";

const LAST_ACTIVE_ADMIN_REQUIRED = {
  ok: false,
  status: 409,
  code: "LAST_ACTIVE_ADMIN_REQUIRED",
  message: "Não é possível desativar ou remover o perfil do último administrador ativo.",
};

const SERIALIZATION_CONFLICT = {
  ok: false,
  status: 409,
  code: "SERIALIZATION_CONFLICT",
  message: "Não foi possível concluir a alteração de usuário. Tente novamente.",
};

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

async function branchExists(branchId, db = prisma) {
  const branch = await db.branch.findUnique({
    where: { id: branchId },
  });

  return Boolean(branch);
}

function shouldKeepActiveAdmin(currentUser, updateData) {
  if (currentUser.role !== "ADMIN" || currentUser.isActive !== true) return true;
  if (updateData.isActive === false) return false;
  if (updateData.role && updateData.role !== "ADMIN") return false;
  return true;
}

async function assertActiveAdminWillRemain(db, currentUser, updateData) {
  if (shouldKeepActiveAdmin(currentUser, updateData)) return null;

  const otherActiveAdmins = await db.user.count({
    where: {
      id: { not: currentUser.id },
      role: "ADMIN",
      isActive: true,
    },
  });

  return otherActiveAdmins > 0 ? null : { ...LAST_ACTIVE_ADMIN_REQUIRED };
}

async function runCriticalUserTransaction(callback) {
  try {
    return await prisma.$transaction(callback, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    if (error?.code === "P2034") {
      return { ...SERIALIZATION_CONFLICT };
    }
    throw error;
  }
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

  return {
    ok: true,
    user,
    audit: {
      role: user.role,
      branchId: user.branchId,
      active: Boolean(user.isActive),
    },
  };
}

export async function disableUser({ actor, userId }) {
  const id = parseUserId(userId);

  if (id === 1) {
    return { ok: false, status: 400, message: "Não é permitido desativar o ADMIN (id=1)" };
  }

  if (Number(actor?.id) === id) {
    return { ok: false, status: 400, message: "Você não pode desativar seu próprio usuário" };
  }

  return runCriticalUserTransaction(async (tx) => {
    const exists = await tx.user.findUnique({ where: { id } });
    if (!exists) return { ok: false, status: 404, message: "Usuário não encontrado" };

    if (exists.isActive === false) {
      return {
        ok: true,
        audit: { active: false },
        auditShouldLog: false,
      };
    }

    const activeAdminError = await assertActiveAdminWillRemain(tx, exists, { isActive: false });
    if (activeAdminError) return activeAdminError;

    const user = await tx.user.update({
      where: { id },
      data: { isActive: false },
      select: USER_SAFE_SELECT,
    });

    return {
      ok: true,
      user,
      audit: { active: Boolean(user.isActive) },
      auditShouldLog: exists.isActive !== user.isActive,
    };
  });
}

export async function enableUser({ actor, userId }) {
  const id = parseUserId(userId);

  const exists = await prisma.user.findUnique({ where: { id } });
  if (!exists) {
    return { ok: false, status: 404, message: "Usuário não encontrado" };
  }

  if (exists.isActive === true) {
    return {
      ok: true,
      audit: { active: true },
      auditShouldLog: false,
    };
  }

  const user = await prisma.user.update({
    where: { id },
    data: { isActive: true },
    select: USER_SAFE_SELECT,
  });

  return {
    ok: true,
    user,
    audit: { active: Boolean(user.isActive) },
    auditShouldLog: exists.isActive !== user.isActive,
  };
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

    return {
      ok: true,
      user,
      audit: {
        usernameChanged: false,
        roleChanged: false,
        branchChanged: false,
        credentialsChanged: true,
      },
      auditShouldLog: true,
    };
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

  return runCriticalUserTransaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id } });
    if (!current) return { ok: false, status: 404, message: "Usuário não encontrado" };

    if (data.username && data.username !== current.username) {
      const conflict = await tx.user.findUnique({ where: { username: data.username } });
      if (conflict) return { ok: false, status: 400, message: "Username já existe" };
    }

    if (typeof data.branchId === "number") {
      const hasBranch = await branchExists(data.branchId, tx);
      if (!hasBranch) return { ok: false, status: 400, message: "Filial (branchId) não existe" };
    }

    const activeAdminError = await assertActiveAdminWillRemain(tx, current, updateData);
    if (activeAdminError) return activeAdminError;

    const user = await tx.user.update({
      where: { id },
      data: updateData,
      select: USER_SAFE_SELECT,
    });

    const audit = {
      usernameChanged:
        Object.prototype.hasOwnProperty.call(updateData, "username") && user.username !== current.username,
      roleChanged: Object.prototype.hasOwnProperty.call(updateData, "role") && user.role !== current.role,
      branchChanged:
        Object.prototype.hasOwnProperty.call(updateData, "branchId") && user.branchId !== current.branchId,
      credentialsChanged: Object.prototype.hasOwnProperty.call(updateData, "passwordHash"),
    };

    return {
      ok: true,
      user,
      audit,
      auditShouldLog: Object.values(audit).some(Boolean),
    };
  });
}
