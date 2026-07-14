import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function login(req, res) {
  try {
    const { username, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { username },
      include: { branch: true },
    });

    if (!user) {
      return res.status(401).json({ message: "Usuário ou senha inválidos" });
    }
    if (user.isActive === false) {
      return res.status(403).json({ 
        message: "Usuário desativado. Contate o administrador." 
      });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Usuário ou senha inválidos" });
    }

    const token = jwt.sign(
      {
        sub: String(user.id),
        role: user.role,
        branchId: user.branchId,
        branchName: user.branch?.name || null,
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        branch: { id: user.branch.id, name: user.branch.name },
      },
    });
  } catch (err) {
    if (err?.name === "ZodError") {
      return res.status(400).json({ message: "Dados inválidos", issues: err.issues });
    }
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}
