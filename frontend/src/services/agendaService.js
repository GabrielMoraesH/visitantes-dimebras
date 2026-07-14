import { api } from "./api";

export async function getAgenda(date) {
  const response = await api.get("/agenda", {
    params: { date },
  });

  return response.data;
}

export async function createAgenda(data) {
  const response = await api.post("/agenda", data);

  return response.data;
}

export async function updateAgenda(id, data) {
  const response = await api.put(`/agenda/${id}`, data);

  return response.data;
}

export async function cancelAgenda(id) {
  const response = await api.patch(`/agenda/${id}/cancel`);

  return response.data;
}

export async function getTvWelcomeVisitors(branchId) {
  const response = await api.get("/agenda/public/tv-now", {
    params: { branchId },
  });

  return response.data;
}

export const getPublicTvNowAgenda = getTvWelcomeVisitors;
