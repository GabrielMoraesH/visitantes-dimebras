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

  const session = {
    clearSession: vi.fn(),
    getToken: vi.fn(() => null),
  };

  vi.doMock("./session", () => session);

  const module = await import("./api");

  return {
    module,
    assign,
    create,
    session,
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

  it("adiciona Authorization quando token está presente", async () => {
    const { requestFulfilled, session } = await loadApiHandlers();
    session.getToken.mockReturnValue("token-teste");

    const config = requestFulfilled({ headers: {} });

    expect(session.getToken).toHaveBeenCalledTimes(1);
    expect(config.headers.Authorization).toBe("Bearer token-teste");
  });

  it("não adiciona Authorization inválido quando token está ausente", async () => {
    const { requestFulfilled, session } = await loadApiHandlers();

    const config = requestFulfilled({ headers: {} });

    expect(session.getToken).toHaveBeenCalledTimes(1);
    expect(config.headers.Authorization).toBeUndefined();
  });

  it("limpa sessão, redireciona uma vez e propaga 401 privado", async () => {
    const { assign, responseRejected, session } = await loadApiHandlers({ pathname: "/checkin" });
    const error = {
      response: { status: 401 },
      config: { method: "get", url: "/visits" },
    };

    await expect(responseRejected(error)).rejects.toBe(error);
    await expect(responseRejected(error)).rejects.toBe(error);

    expect(session.clearSession).toHaveBeenCalledTimes(2);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("não faz redirect global adicional para 401 do login", async () => {
    const { assign, responseRejected, session } = await loadApiHandlers({ pathname: "/login" });
    const error = {
      response: { status: 401 },
      config: { method: "post", url: "/auth/login" },
    };

    await expect(responseRejected(error)).rejects.toBe(error);

    expect(session.clearSession).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it("propaga 403 sem limpar sessão nem redirecionar", async () => {
    const { assign, responseRejected, session } = await loadApiHandlers();
    const error = { response: { status: 403 }, config: { url: "/admin/users" } };

    await expect(responseRejected(error)).rejects.toBe(error);

    expect(session.clearSession).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("propaga 500 sem limpar sessão nem redirecionar", async () => {
    const { assign, responseRejected, session } = await loadApiHandlers();
    const error = { response: { status: 500 }, config: { url: "/visits" } };

    await expect(responseRejected(error)).rejects.toBe(error);

    expect(session.clearSession).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("propaga erro de rede sem response sem limpar sessão nem redirecionar", async () => {
    const { assign, responseRejected, session } = await loadApiHandlers();
    const error = { request: {}, config: { url: "/visits" } };

    await expect(responseRejected(error)).rejects.toBe(error);

    expect(session.clearSession).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
