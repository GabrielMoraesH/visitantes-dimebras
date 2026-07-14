import axios from "axios";

export const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");

export const api = axios.create({
  baseURL: API_BASE_URL,
});

export function visitLabelUrl(visitId) {
  return `${API_BASE_URL}/visits/${visitId}/label`;
}

export function openVisitLabel(visitId) {
  const popup = window.open("about:blank", "_blank");
  if (popup) {
    popup.opener = null;
    popup.document.write("<p>Carregando etiqueta...</p>");
  }

  api
    .post(`/visits/${visitId}/label-token`)
    .then(({ data }) => {
      const token = encodeURIComponent(data?.token || "");
      const url = `${visitLabelUrl(visitId)}?token=${token}`;

      if (popup && !popup.closed) {
        popup.location.replace(url);
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
    })
    .catch(() => {
      if (popup && !popup.closed) {
        popup.document.body.innerHTML = "<p>Acesso negado ao gerar etiqueta.</p>";
      }
    });
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
