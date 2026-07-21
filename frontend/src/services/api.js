import axios from "axios";
import { clearSession, getToken } from "./session";

export const API_BASE_URL = (import.meta.env?.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");

export const api = axios.create({
  baseURL: API_BASE_URL,
});

let isRedirectingToLogin = false;

function getRequestPath(config) {
  try {
    return new URL(config?.url || "", config?.baseURL || API_BASE_URL).pathname.replace(/\/$/, "") || "/";
  } catch {
    return String(config?.url || "").split("?")[0].replace(/\/$/, "") || "/";
  }
}

function isLoginRequest(config) {
  return String(config?.method || "get").toLowerCase() === "post" && getRequestPath(config) === "/auth/login";
}

function isAlreadyOnLogin() {
  if (typeof window === "undefined") return false;

  return window.location.pathname.replace(/\/$/, "") === "/login";
}

function redirectToLogin() {
  if (typeof window === "undefined" || isRedirectingToLogin) return;

  isRedirectingToLogin = true;
  window.location.assign("/login");
}

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
    const token = getToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearSession();

      if (!isLoginRequest(error.config) && !isAlreadyOnLogin()) {
        redirectToLogin();
      }
    }

    return Promise.reject(error);
  }
);

export default api;
