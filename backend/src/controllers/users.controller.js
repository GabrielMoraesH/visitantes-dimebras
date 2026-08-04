import * as userService from "../services/user.service.js";
import { auditRequestContext, safeAuditLog } from "../utils/audit.js";

export async function createUser(req, res, next) {
  try {
    const result = await userService.createUser({ actor: req.user, input: req.body });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    await safeAuditLog({
      ...auditRequestContext(req),
      action: "USER_CREATE",
      entity: "USER",
      entityId: String(result.user.id),
      description: "Usuário criado",
      metadata: result.audit,
    });

    return res.status(201).json(result.user);
  } catch (error) {
    return next(error);
  }
}

export async function listUsers(req, res, next) {
  try {
    const users = await userService.listUsers();

    return res.json(users);
  } catch (error) {
    return next(error);
  }
}

export async function disableUser(req, res, next) {
  try {
    const result = await userService.disableUser({ actor: req.user, userId: req.params });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    if (result.auditShouldLog) {
      await safeAuditLog({
        ...auditRequestContext(req),
        action: "USER_DEACTIVATE",
        entity: "USER",
        entityId: String(result.user.id),
        description: "Usuário desativado",
        metadata: result.audit,
      });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

export async function enableUser(req, res, next) {
  try {
    const result = await userService.enableUser({ actor: req.user, userId: req.params });
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    if (result.auditShouldLog) {
      await safeAuditLog({
        ...auditRequestContext(req),
        action: "USER_ACTIVATE",
        entity: "USER",
        entityId: String(result.user.id),
        description: "Usuário ativado",
        metadata: result.audit,
      });
    }

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

export async function updateUser(req, res, next) {
  try {
    const result = await userService.updateUser({
      actor: req.user,
      userId: req.params,
      input: req.body,
    });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    if (result.auditShouldLog) {
      await safeAuditLog({
        ...auditRequestContext(req),
        action: "USER_UPDATE",
        entity: "USER",
        entityId: String(result.user.id),
        description: "Usuário atualizado",
        metadata: result.audit,
      });
    }

    return res.json(result.user);
  } catch (error) {
    return next(error);
  }
}
