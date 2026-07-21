import api from "./api";

export async function getCurrentUser() {
  const { data } = await api.get("/auth/me");
  return data?.user || null;
}
