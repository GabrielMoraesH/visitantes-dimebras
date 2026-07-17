import * as userService from "../services/user.service.js";

export async function createUser(req, res, next) {
  try {
    const result = await userService.createUser({ actor: req.user, input: req.body });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

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

    return res.json(result.user);
  } catch (error) {
    return next(error);
  }
}
