import * as authService from "../services/auth.service.js";

export async function login(req, res, next) {
  try {
    const result = await authService.login({ input: req.body });
    if (!result.ok) return res.status(result.status).json({ message: result.message });

    return res.json({ token: result.token, user: result.user });
  } catch (err) {
    return next(err);
  }
}
