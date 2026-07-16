import * as branchService from "../services/branch.service.js";

export async function listBranches(req, res) {
  try {
    const items = await branchService.listBranches();
    return res.json(items);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Erro ao carregar filiais" });
  }
}
