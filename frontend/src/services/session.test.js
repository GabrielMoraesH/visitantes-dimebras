import { describe, expect, it } from "vitest";
import { clearSession, getToken, getUser, isAuthenticated, setSession } from "./session";

describe("session service", () => {
  it("setSession salva somente campos permitidos de usuario e branch", () => {
    setSession("token-teste", {
      id: 1,
      username: "admin",
      role: "ADMIN",
      accessToken: "token-interno",
      refreshToken: "refresh",
      secret: "segredo",
      internalMetadata: {},
      permissions: [],
      password: "segredo",
      profile: {
        password: "segredo-aninhado",
      },
      branch: {
        id: 10,
        name: "Matriz",
        password: "segredo-filial",
        secret: "interno",
      },
    });

    expect(getToken()).toBe("token-teste");
    expect(getUser()).toEqual({
      id: 1,
      username: "admin",
      role: "ADMIN",
      branch: {
        id: 10,
        name: "Matriz",
      },
    });
    expect(isAuthenticated()).toBe(true);
  });

  it("setSession nao modifica usuario ou branch originais", () => {
    const user = {
      id: 1,
      username: "admin",
      role: "ADMIN",
      password: "segredo",
      branch: {
        id: 10,
        name: "Matriz",
        password: "segredo-filial",
      },
    };
    const original = structuredClone(user);

    setSession("token-teste", user);

    expect(user).toEqual(original);
  });

  it("clearSession remove token e user", () => {
    setSession("token-teste", { id: 2, username: "recepcao", role: "RECEPCAO" });

    clearSession();

    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  it("getUser retorna null para JSON invalido sem lancar excecao", () => {
    localStorage.setItem("user", "{");

    expect(() => getUser()).not.toThrow();
    expect(getUser()).toBeNull();
  });

  it("getUser retorna null para valor que nao e objeto de usuario", () => {
    localStorage.setItem("user", JSON.stringify(["ADMIN"]));

    expect(getUser()).toBeNull();
  });

  it("getUser retorna null para objeto sem contrato minimo de usuario", () => {
    localStorage.setItem("user", JSON.stringify({ role: "ADMIN" }));

    expect(getUser()).toBeNull();
  });

  it("isAuthenticated retorna false quando ha token sem user valido", () => {
    localStorage.setItem("token", "token-teste");

    expect(isAuthenticated()).toBe(false);
  });

  it("isAuthenticated retorna false quando ha user sem token", () => {
    localStorage.setItem("user", JSON.stringify({ id: 1, username: "admin", role: "ADMIN" }));

    expect(isAuthenticated()).toBe(false);
  });

  it("setSession limpa sessao quando token ou user sao invalidos", () => {
    setSession("token-teste", { id: 1, username: "admin", role: "ADMIN" });

    setSession("", { id: 1, username: "admin", role: "ADMIN" });

    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });

  it("setSession recusa tipos invalidos de usuario sem deixar sessao parcial", () => {
    for (const invalidUser of [null, [], "admin", 123]) {
      setSession("token-valido", { id: 1, username: "admin", role: "ADMIN" });

      setSession("token-invalido", invalidUser);

      expect(getToken()).toBeNull();
      expect(getUser()).toBeNull();
    }
  });

  it("setSession limpa sessao se a serializacao do usuario falhar", () => {
    setSession("token-teste", { id: 1, username: "admin", role: "ADMIN" });

    setSession("token-com-bigint", { id: 1n, username: "admin", role: "ADMIN" });

    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });
});
