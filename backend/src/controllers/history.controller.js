import * as historyService from "../services/history.service.js";

export async function listHistory(req, res) {
  try {
    const result = await historyService.listHistory({
      actor: req.user,
      query: req.query,
    });

    return res.json(result);
  } catch (error) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ message: "Parametros invalidos", issues: error.issues });
    }
    console.error(error);
    return res.status(500).json({ message: "Erro ao carregar histórico" });
  }
}
