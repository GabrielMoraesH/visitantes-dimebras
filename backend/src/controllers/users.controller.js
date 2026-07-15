import prisma from "../lib/prisma.js";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { ALL_USER_ROLES } from "../constants/roles.js";
import { idParamSchema, passwordSchema, usernameSchema } from "../utils/validation.js";

const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(ALL_USER_ROLES).optional().default("RECEPCAO"),
  branchId: z.number().int().positive("branchId invalido"),
}).strict();

const updateUserSchema = z.object({
  username: usernameSchema.optional(),
  password: passwordSchema.optional(),
  role: z.enum(ALL_USER_ROLES).optional(),
  branchId: z.number().int().positive("branchId invalido").optional(),
}).strict();

function zodIssues(err) {
  return err?.issues?.map((i) => ({
    path: i.path?.join(".") || "",
    message: i.message,
  })) || [];
}

export async function createUser(req, res) {
  try {
    const data = createUserSchema.parse(req.body);

    const exists = await prisma.user.findUnique({
      where: { username: data.username },
    });
    if (exists) return res.status(400).json({ message: "Usuário já existe" });

    const branch = await prisma.branch.findUnique({
      where: { id: data.branchId },
    });
    if (!branch) return res.status(400).json({ message: "Filial (branchId) não existe" });

    const passwordHash = await bcrypt.hash(data.password, 10);

    const created = await prisma.user.create({
      data: {
        username: data.username,
        passwordHash,
        role: data.role,
        branchId: data.branchId,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        role: true,
        branchId: true,
        isActive: true,
        createdAt: true,
        branch: { select: { name: true } },
      },
    });

    return res.status(201).json(created);
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ message: "Dados inválidos", issues: zodIssues(err) });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function listUsers(req, res) {
  try {
    const users = await prisma.user.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        username: true,
        role: true,
        branchId: true,
        isActive: true,
        branch: { select: { name: true } },
        createdAt: true,
      },
    });

    return res.json(users);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function disableUser(req, res) {
  try {
    const { id } = idParamSchema.parse(req.params);

    if (id === 1) {
      return res.status(400).json({ message: "Não é permitido desativar o ADMIN (id=1)" });
    }

    if (Number(req.user?.id) === id) {
      return res.status(400).json({ message: "Você não pode desativar seu próprio usuário" });
    }

    const exists = await prisma.user.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ message: "Usuário não encontrado" });

    if (exists.isActive === false) {
      return res.json({ ok: true });
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    if (err?.name === "ZodError") {
      return res.status(400).json({ message: "Dados inválidos", issues: zodIssues(err) });
    }
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function enableUser(req, res) {
  try {
    const { id } = idParamSchema.parse(req.params);

    const exists = await prisma.user.findUnique({ where: { id } });
    if (!exists) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    if (exists.isActive === true) {
      return res.json({ ok: true });
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: true },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    if (err?.name === "ZodError") {
      return res.status(400).json({
        message: "Dados inválidos",
        issues: zodIssues(err),
      });
    }
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function updateUser(req, res) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = updateUserSchema.parse(req.body);

    const exists = await prisma.user.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ message: "Usuário não encontrado" });

    if (id === 1) {
      const triedOtherFields =
        typeof data.username !== "undefined" ||
        typeof data.role !== "undefined" ||
        typeof data.branchId !== "undefined";

      if (triedOtherFields) {
        return res.status(400).json({
          message: "No ADMIN (id=1) só é permitido alterar a senha",
        });
      }

      if (!data.password) {
        return res.status(400).json({ message: "Informe a nova senha do ADMIN" });
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { passwordHash: await bcrypt.hash(data.password, 10) },
        select: {
          id: true,
          username: true,
          role: true,
          branchId: true,
          isActive: true,
          createdAt: true,
          branch: { select: { name: true } },
        },
      });

      return res.json(updated);
    }

    if (data.username && data.username !== exists.username) {
      const conflict = await prisma.user.findUnique({ where: { username: data.username } });
      if (conflict) return res.status(400).json({ message: "Username já existe" });
    }

    if (typeof data.branchId === "number") {
      const branch = await prisma.branch.findUnique({ where: { id: data.branchId } });
      if (!branch) return res.status(400).json({ message: "Filial (branchId) não existe" });
    }

    const updateData = {};
    if (data.username) updateData.username = data.username;
    if (data.role) updateData.role = data.role;
    if (typeof data.branchId === "number") updateData.branchId = data.branchId;

    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "Nada para atualizar" });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        role: true,
        branchId: true,
        isActive: true,
        createdAt: true,
        branch: { select: { name: true } },
      },
    });

    return res.json(updated);
  } catch (err) {
    console.error(err);
    if (err?.name === "ZodError") {
      return res.status(400).json({ message: "Dados inválidos", issues: zodIssues(err) });
    }
    return res.status(500).json({ message: "Erro interno" });
  }
}
