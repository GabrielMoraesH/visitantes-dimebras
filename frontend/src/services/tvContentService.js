import api from "./api";

export function getTvContents() {
  return api.get("/tv-content");
}

export function createTvContent(formData) {
  return api.post("/tv-content", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export function updateTvContent(id, data) {
  return api.put(`/tv-content/${id}`, data);
}

export function toggleTvContent(id) {
  return api.patch(`/tv-content/${id}/toggle`);
}

export function deleteTvContent(id) {
  return api.delete(`/tv-content/${id}`);
}

export function getActiveTvContents() {
  return api.get("/tv-content/active");
}

export function getPublicActiveTvContents(branchId) {
  return api.get("/tv-content/public/active", {
    params: { branchId },
  });
}
