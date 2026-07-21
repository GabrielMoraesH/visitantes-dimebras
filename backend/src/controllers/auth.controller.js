import * as authService from "../services/auth.service.js";
import { logInfo, logWarn } from "../utils/logger.js";

export async function login(req, res, next) {
  try {
    const result = await authService.login({ input: req.body });
    if (!result.ok) {
      logWarn("auth_login_failed", {
        requestId: req.requestId,
        reason: "invalid_credentials",
      });
      return res.status(result.status).json({ message: result.message });
    }

    logInfo("auth_login_success", {
      requestId: req.requestId,
      userId: result.user.id,
      branchId: result.user.branch.id,
    });

    return res.json({ token: result.token, user: result.user });
  } catch (err) {
    return next(err);
  }
}

export function me(req, res) {
  return res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      branch: {
        id: req.user.branchId,
        name: req.user.branchName,
      },
    },
  });
}
