import { prisma } from "../prisma.js";
import bcrypt from "bcryptjs";
import { z } from "zod";

const createUserSchema = z.object({
  username: z.string().trim().min(3, "Usuário deve ter no mínimo 3 caracteres"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  role: z.enum(["RECEPCAO", "ADMIN"]).optional().default("RECEPCAO"),
  branchId: z.number().int().positive("branchId inválido"),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const updatePasswordSchema = z.object({
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

const updateUserSchema = z.object({
  username: z.string().trim().min(3, "Usuário deve ter no mínimo 3 caracteres").optional(),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").optional(),
  role: z.enum(["RECEPCAO", "ADMIN"]).optional(),
  branchId: z.coerce.number().int().positive("branchId inválido").optional(),
});

export async function createUser(req, res) {
  try {
    const data = createUserSchema.parse(req.body);

    const exists = await prisma.user.findUnique({
      where: { username: data.username },
    });

    if (exists) {
      return res.status(400).json({ message: "Usuário já existe" });
    }

    const branch = await prisma.branch.findUnique({
      where: { id: data.branchId },
    });

    if (!branch) {
      return res.status(400).json({ message: "Filial (branchId) não existe" });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const created = await prisma.user.create({
      data: {
        username: data.username,
        passwordHash,
        role: data.role,
        branchId: data.branchId,
      },
      select: {
        id: true,
        username: true,
        role: true,
        branchId: true,
        createdAt: true,
        branch: { select: { name: true } },
      },
    });

    return res.status(201).json(created);
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({
        message: "Dados inválidos",
        issues: err.issues.map((i) => ({
          path: i.path?.join(".") || "",
          message: i.message,
        })),
      });
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

export async function deleteUser(req, res) {
  try {
    const { id } = idParamSchema.parse(req.params);

    if (id === 1) {
      return res.status(400).json({ message: "Não é permitido excluir o ADMIN (id=1)" });
    }

    if (Number(req.user?.id) === id) {
      return res.status(400).json({ message: "Você não pode excluir seu próprio usuário" });
    }

    const exists = await prisma.user.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ message: "Usuário não encontrado" });

    await prisma.user.delete({ where: { id } });

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

// (opcional) se você ainda usa PUT /users/:id/password
export async function updateUserPassword(req, res) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const { password } = updatePasswordSchema.parse(req.body);

    const exists = await prisma.user.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ message: "Usuário não encontrado" });

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    if (err?.name === "ZodError") {
      return res.status(400).json({
        message: "Dados inválidos",
        issues: err.issues.map((i) => ({
          path: i.path?.join(".") || "",
          message: i.message,
        })),
      });
    }
    return res.status(500).json({ message: "Erro interno" });
  }
}

// ✅ EDITAR usuário (username, role, branchId e senha opcional)
export async function updateUser(req, res) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = updateUserSchema.parse(req.body);

    // recomendado: não editar o admin principal
    if (id === 1) {
      return res.status(400).json({ message: "Não é permitido editar o ADMIN (id=1)" });
    }

    const exists = await prisma.user.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ message: "Usuário não encontrado" });

    // username único
    if (data.username && data.username !== exists.username) {
      const conflict = await prisma.user.findUnique({ where: { username: data.username } });
      if (conflict) return res.status(400).json({ message: "Username já existe" });
    }

    // branch válido
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
        createdAt: true,
        branch: { select: { name: true } },
      },
    });

    return res.json(updated);
  } catch (err) {
    console.error(err);
    if (err?.name === "ZodError") {
      return res.status(400).json({
        message: "Dados inválidos",
        issues: err.issues.map((i) => ({
          path: i.path?.join(".") || "",
          message: i.message,
        })),
      });
    }
    return res.status(500).json({ message: "Erro interno" });
  }
}