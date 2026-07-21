import { FALLBACK_BRANCHES } from "../constants/branches";

export const ALLOWED_TV_BRANCH_IDS = FALLBACK_BRANCHES.map((branch) => branch.id);

function parseAllowedBranchId(value) {
  const text = String(value ?? "");
  if (!/^(0|[1-9]\d*)$/.test(text)) return undefined;

  const branchId = Number(text);
  if (
    !Number.isInteger(branchId) ||
    String(branchId) !== text ||
    !ALLOWED_TV_BRANCH_IDS.includes(branchId)
  ) {
    return undefined;
  }

  return branchId;
}

function shortRouteSuffix(pathname) {
  if (pathname === "/tv") return undefined;
  if (!pathname.startsWith("/tv")) return undefined;
  return pathname.slice("/tv".length);
}

export function resolveTvBranchId({ pathname = "/tv", search }) {
  const routeBranchId = shortRouteSuffix(pathname);

  if (routeBranchId !== undefined) {
    return {
      branchId: parseAllowedBranchId(routeBranchId),
      source: "route",
    };
  }

  const params = new URLSearchParams(search || "");
  const queryBranchId = params.get("branchId");

  return {
    branchId: queryBranchId == null ? undefined : parseAllowedBranchId(queryBranchId),
    source: queryBranchId == null ? "missing" : "query",
  };
}
