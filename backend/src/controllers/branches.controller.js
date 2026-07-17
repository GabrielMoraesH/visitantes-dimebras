import * as branchService from "../services/branch.service.js";

export async function listBranches(req, res, next) {
  try {
    const items = await branchService.listBranches();
    return res.json(items);
  } catch (err) {
    return next(err);
  }
}
