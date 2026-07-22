import api from "./api";

export function getBranches() {
  return api.get("/branches");
}
