import { describe, expect, it, vi } from "vitest";

async function loadApiHandlers({ pathname = "/checkin" } = {}) {
  vi.resetModules();
  window.history.pushState({}, "", pathname);

  const assign = vi.fn();
  vi.stubGlobal("location", {
    pathname,
    assign,
  });

  const requestUse = vi.fn();
  const responseUse = vi.fn();
  const create = vi.fn(() => ({
    interceptors: {
      request: { use: requestUse },
      response: { use: responseUse },
    },
    post: vi.fn(),
  }));

  vi.doMock("axios", () => ({
    default: { create },
  }));

  const module = await import("./api");

  return {
    module,
    assign,
    create,
    requestFulfilled: requestUse.mock.calls[0][0],
    responseRejected: responseUse.mock.calls[0][1],
  };
}

describe("api interceptors", () => {
  it("configura baseURL na instancia Axios", async () => {
    const { create, module } = await loadApiHandlers();

    expect(module.API_BASE_URL).toBe("http://localhost:3001");
    expect(create).toHaveBeenCalledWith({ baseURL: "http://localhost:3001" });
  });

  it("adiciona Authorization quando token esta presente", async () => {
    localStorage.setItem("token", "token-teste");
    const { requestFulfilled } = await loadApiHandlers();

    const config = requestFulfilled({ headers: {} });

    expect(config.headers.Authorization).toBe("Bearer token-teste");
  });

  it("nao adiciona Authorization invalido quando token esta ausente", async () => {
    const { requestFulfilled } = await loadApiHandlers();

    const config = requestFulfilled({ headers: {} });

    expect(config.headers.Authorization).toBeUndefined();
  });

  it("limpa sessao, redireciona uma vez e propaga 401 privado", async () => {
    localStorage.setItem("token", "token-teste");
    localStorage.setItem("user", JSON.stringify({ role: "ADMIN" }));
    const { assign, responseRejected } = await loadApiHandlers({ pathname: "/checkin" });
    const error = {
      response: { status: 401 },
      config: { method: "get", url: "/visits" },
    };

    await expect(responseRejected(error)).rejects.toBe(error);
    await expect(responseRejected(error)).rejects.toBe(error);

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("nao faz redirect global adicional para 401 do login", async () => {
    localStorage.setItem("token", "token-teste");
    localStorage.setItem("user", JSON.stringify({ role: "RECEPCAO" }));
    const { assign, responseRejected } = await loadApiHandlers({ pathname: "/login" });
    const error = {
      response: { status: 401 },
      config: { method: "post", url: "/auth/login" },
    };

    await expect(responseRejected(error)).rejects.toBe(error);

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it("propaga 403 sem limpar sessao nem redirecionar", async () => {
    localStorage.setItem("token", "token-teste");
    localStorage.setItem("user", JSON.stringify({ role: "RECEPCAO" }));
    const { assign, responseRejected } = await loadApiHandlers();
    const error = { response: { status: 403 }, config: { url: "/admin/users" } };

    await expect(responseRejected(error)).rejects.toBe(error);

    expect(localStorage.getItem("token")).toBe("token-teste");
    expect(JSON.parse(localStorage.getItem("user"))).toEqual({ role: "RECEPCAO" });
    expect(assign).not.toHaveBeenCalled();
  });

  it("propaga 500 sem limpar sessao nem redirecionar", async () => {
    localStorage.setItem("token", "token-teste");
    localStorage.setItem("user", JSON.stringify({ role: "ADMIN" }));
    const { assign, responseRejected } = await loadApiHandlers();
    const error = { response: { status: 500 }, config: { url: "/visits" } };

    await expect(responseRejected(error)).rejects.toBe(error);

    expect(localStorage.getItem("token")).toBe("token-teste");
    expect(localStorage.getItem("user")).toBe(JSON.stringify({ role: "ADMIN" }));
    expect(assign).not.toHaveBeenCalled();
  });

  it("propaga erro de rede sem response sem limpar sessao nem redirecionar", async () => {
    localStorage.setItem("token", "token-teste");
    localStorage.setItem("user", JSON.stringify({ role: "ADMIN" }));
    const { assign, responseRejected } = await loadApiHandlers();
    const error = { request: {}, config: { url: "/visits" } };

    await expect(responseRejected(error)).rejects.toBe(error);

    expect(localStorage.getItem("token")).toBe("token-teste");
    expect(localStorage.getItem("user")).toBe(JSON.stringify({ role: "ADMIN" }));
    expect(assign).not.toHaveBeenCalled();
  });
});
