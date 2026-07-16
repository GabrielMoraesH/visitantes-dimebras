import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { ALL_USER_ROLES } from "../constants/roles.js";
import { passwordSchema, usernameSchema } from "../utils/validation.js";

const INVALID_CREDENTIALS = "Usuário ou senha inválidos";

const loginSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
  })
  .strict();

export async function login({ input }) {
  const { username, password } = loginSchema.parse(input);

  const user = await prisma.user.findUnique({
    where: { username },
    include: { branch: true },
  });

  if (!user) {
    return { ok: false, status: 401, message: INVALID_CREDENTIALS };
  }

  if (user.isActive === false || !ALL_USER_ROLES.includes(user.role)) {
    return { ok: false, status: 401, message: INVALID_CREDENTIALS };
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return { ok: false, status: 401, message: INVALID_CREDENTIALS };
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

  return {
    ok: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      branch: { id: user.branch.id, name: user.branch.name },
    },
  };
}
