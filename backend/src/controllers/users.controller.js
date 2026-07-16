import * as userService from "../services/user.service.js";

function zodIssues(err) {
  return err?.issues?.map((i) => ({
    path: i.path?.join(".") || "",
    message: i.message,
  })) || [];
}

export async function createUser(req, res) {
  try {
    const result = await userService.createUser({ actor: req.user, input: req.body });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    return res.status(201).json(result.user);
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
    const users = await userService.listUsers();

    return res.json(users);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro interno" });
  }
}

export async function disableUser(req, res) {
  try {
    const result = await userService.disableUser({ actor: req.user, userId: req.params });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

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
    const result = await userService.enableUser({ actor: req.user, userId: req.params });
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

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
    const result = await userService.updateUser({
      actor: req.user,
      userId: req.params,
      input: req.body,
    });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    return res.json(result.user);
  } catch (err) {
    console.error(err);
    if (err?.name === "ZodError") {
      return res.status(400).json({ message: "Dados inválidos", issues: zodIssues(err) });
    }
    return res.status(500).json({ message: "Erro interno" });
  }
}
