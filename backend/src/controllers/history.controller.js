import * as historyService from "../services/history.service.js";

export async function listHistory(req, res, next) {
  try {
    const result = await historyService.listHistory({
      actor: req.user,
      query: req.query,
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
}
