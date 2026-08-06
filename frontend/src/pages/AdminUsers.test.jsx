import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { FALLBACK_BRANCHES } from "../constants/branches";
import { setSession } from "../services/session";
import AdminUsers from "./AdminUsers";

const toast = {
  success: vi.fn(),
  error: vi.fn(),
  show: vi.fn(),
};

const confirm = vi.fn();

vi.mock("../components/Feedback/ToastProvider", () => ({
  useToast: () => toast,
}));

vi.mock("../components/Feedback/ConfirmProvider", () => ({
  useConfirm: () => confirm,
}));

vi.mock("../services/branchService", () => ({
  getBranches: vi.fn(),
}));

vi.mock("../services/userService", () => ({
  createUser: vi.fn(),
  disableUser: vi.fn(),
  enableUser: vi.fn(),
  getUsers: vi.fn(),
  updateUser: vi.fn(),
}));

import { getBranches } from "../services/branchService";
import {
  createUser,
  disableUser,
  enableUser,
  getUsers,
  updateUser,
} from "../services/userService";

function usersList(overrides = []) {
  return [
    {
      id: 1,
      username: "admin",
      role: "ADMIN",
      branchId: 1,
      isActive: true,
      createdAt: "2026-01-01T10:00:00.000Z",
      branch: { name: "Dimebras PR" },
    },
    {
      id: 2,
      username: "recepcao",
      role: "RECEPCAO",
      branchId: 2,
      isActive: true,
      createdAt: "2026-01-02T10:00:00.000Z",
      branch: { name: "Alfamed MS" },
    },
    ...overrides,
  ];
}

function renderAdminUsers(currentUser = { id: 9, username: "supervisor", role: "ADMIN" }) {
  setSession("token-teste", currentUser);

  return render(
    <MemoryRouter initialEntries={["/admin/users"]}>
      <Routes>
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/login" element={<div>Login destino</div>} />
        <Route path="/checkin" element={<div>Checkin destino</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function waitForUsers() {
  expect(await screen.findByText("recepcao")).toBeInTheDocument();
}

describe("AdminUsers", () => {
  beforeEach(() => {
    localStorage.clear();
    getBranches.mockResolvedValue({ data: FALLBACK_BRANCHES });
    getUsers.mockResolvedValue({ data: usersList() });
    createUser.mockResolvedValue({ data: {} });
    updateUser.mockResolvedValue({ data: {} });
    disableUser.mockResolvedValue({ data: { ok: true } });
    enableUser.mockResolvedValue({ data: { ok: true } });
    confirm.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("uses the official branch IDs and leaves ID 4 unused", () => {
    expect(FALLBACK_BRANCHES).toEqual([
      { id: 1, name: "Dimebras PR" },
      { id: 2, name: "Alfamed MS" },
      { id: 3, name: "Dimebras MT" },
      { id: 5, name: "Dimebras MS" },
      { id: 6, name: "Dimebras SC" },
    ]);
    expect(FALLBACK_BRANCHES.some((branch) => branch.id === 4)).toBe(false);
  });

  it("shows list loading, empty state and load failure with standardized messages", async () => {
    const firstLoad = deferred();
    getUsers.mockReturnValueOnce(firstLoad.promise);
    renderAdminUsers();

    expect(await screen.findByText("Carregando usuários...")).toBeInTheDocument();
    firstLoad.resolve({ data: [] });
    expect(await screen.findByText("Nenhum usuário encontrado.")).toBeInTheDocument();

    getUsers.mockRejectedValueOnce({ response: { status: 500, data: { message: "stack" } } });
    await userEvent.click(screen.getByRole("button", { name: /atualizar/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar os usuários.");
    expect(alert).toHaveTextContent("Tente novamente.");
    expect(alert).not.toHaveTextContent("stack");
  });

  it("validates create fields inline and in the consolidated alert without toast", async () => {
    renderAdminUsers();
    await waitForUsers();

    await userEvent.clear(screen.getByLabelText("Usuário"));
    await userEvent.clear(screen.getByLabelText("Senha"));
    await userEvent.click(screen.getByRole("button", { name: "Criar usuário" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Corrija os campos:");
    expect(within(alert).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Informe o usuário.",
      "Informe a senha.",
    ]);
    expect(screen.getByText("Informe o usuário.", { selector: ".au-fieldError" })).toBeInTheDocument();
    expect(screen.getByLabelText("Usuário")).toHaveAttribute("aria-invalid", "true");
    expect(alert).toHaveFocus();
    expect(createUser).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("validates short create values and keeps field order", async () => {
    renderAdminUsers();
    await waitForUsers();

    await userEvent.type(screen.getByLabelText("Usuário"), "ab");
    await userEvent.type(screen.getByLabelText("Senha"), "12345");
    await userEvent.click(screen.getByRole("button", { name: "Criar usuário" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Digite um usuário com pelo menos 3 caracteres.",
      "Digite uma senha com pelo menos 6 caracteres.",
    ]);
  });

  it("creates users with a single success toast and the current payload", async () => {
    renderAdminUsers();
    await waitForUsers();

    await userEvent.type(screen.getByLabelText("Usuário"), "novo");
    await userEvent.type(screen.getByLabelText("Senha"), "123456");
    await userEvent.selectOptions(screen.getByLabelText("Perfil"), "ADMIN");
    await userEvent.selectOptions(screen.getByLabelText("Filial"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Criar usuário" }));

    await waitFor(() => expect(createUser).toHaveBeenCalledWith({
      username: "novo",
      password: "123456",
      role: "ADMIN",
      branchId: 5,
    }));
    expect(toast.success).toHaveBeenCalledWith("Usuário criado com sucesso.");
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("shows duplicate and network create errors as persistent alerts without technical text", async () => {
    createUser
      .mockRejectedValueOnce({ response: { status: 409, data: { code: "USER_USERNAME_CONFLICT", message: "P2002" } } })
      .mockRejectedValueOnce(new Error("Network Error"));
    renderAdminUsers();
    await waitForUsers();

    await userEvent.type(screen.getByLabelText("Usuário"), "novo");
    await userEvent.type(screen.getByLabelText("Senha"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Criar usuário" }));

    let alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Este usuário já está cadastrado.");
    expect(alert).not.toHaveTextContent("P2002");
    expect(toast.error).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Criar usuário" }));
    alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível conectar ao servidor.");
    expect(alert).toHaveTextContent("Verifique sua conexão e tente novamente.");
  });

  it("edits a regular user, keeps empty password optional and shows standardized success", async () => {
    renderAdminUsers();
    await waitForUsers();

    await userEvent.click(screen.getAllByRole("button", { name: "Editar usuário" })[1]);
    const dialog = await screen.findByRole("dialog", { name: "Editar usuário" });
    await userEvent.clear(within(dialog).getByLabelText("Usuário"));
    await userEvent.type(within(dialog).getByLabelText("Usuário"), "recepcao2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(2, {
      username: "recepcao2",
      role: "RECEPCAO",
      branchId: 2,
    }));
    expect(toast.success).toHaveBeenCalledWith("Usuário atualizado com sucesso.");
  });

  it("validates edit fields, last admin and protected user without exposing IDs", async () => {
    updateUser.mockRejectedValueOnce({
      response: { status: 409, data: { code: "LAST_ACTIVE_ADMIN_REQUIRED" } },
    });
    renderAdminUsers();
    await waitForUsers();

    await userEvent.click(screen.getAllByRole("button", { name: "Editar usuário" })[1]);
    let dialog = await screen.findByRole("dialog", { name: "Editar usuário" });
    await userEvent.clear(within(dialog).getByLabelText("Usuário"));
    await userEvent.type(within(dialog).getByLabelText("Usuário"), "ab");
    await userEvent.type(within(dialog).getByLabelText("Nova senha (opcional)"), "12345");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));

    let alert = await within(dialog).findByRole("alert");
    expect(within(alert).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Digite um usuário com pelo menos 3 caracteres.",
      "Digite uma senha com pelo menos 6 caracteres.",
    ]);
    expect(alert).toHaveFocus();

    await userEvent.clear(within(dialog).getByLabelText("Usuário"));
    await userEvent.type(within(dialog).getByLabelText("Usuário"), "admin2");
    await userEvent.clear(within(dialog).getByLabelText("Nova senha (opcional)"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));

    alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(
      "Não é possível desativar ou remover o perfil do último administrador ativo."
    );
    expect(alert).not.toHaveTextContent("LAST_ACTIVE_ADMIN_REQUIRED");

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Editar usuário" })[0]);
    dialog = await screen.findByRole("dialog", { name: "Editar usuário" });
    alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Neste usuário, só é permitido alterar a senha.");
    expect(alert).not.toHaveTextContent("id=1");
  });

  it("activates and deactivates with official confirmation and success messages", async () => {
    getUsers.mockResolvedValue({ data: usersList([{ id: 3, username: "inativo", role: "RECEPCAO", branchId: 1, isActive: false }]) });
    renderAdminUsers();
    await screen.findByText("inativo");

    await userEvent.click(screen.getAllByRole("button", { name: "Desativar usuário" })[1]);
    expect(confirm).toHaveBeenCalledWith({
      title: "Desativar usuário",
      message: "Tem certeza de que deseja desativar este usuário?",
      confirmText: "Desativar",
      cancelText: "Cancelar",
      type: "danger",
    });
    await waitFor(() => expect(disableUser).toHaveBeenCalledWith(2));
    expect(toast.success).toHaveBeenCalledWith("Usuário desativado com sucesso.");

    await userEvent.click(screen.getByRole("button", { name: "Ativar usuário" }));
    await waitFor(() => expect(enableUser).toHaveBeenCalledWith(3));
    expect(toast.success).toHaveBeenCalledWith("Usuário ativado com sucesso.");
  });

  it("keeps self-disable, serialization and protected-user errors persistent without duplicated toast", async () => {
    renderAdminUsers({ id: 2, username: "recepcao", role: "ADMIN" });
    await waitForUsers();

    await userEvent.click(screen.getAllByRole("button", { name: "Desativar usuário" })[1]);
    let alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Você não pode desativar o próprio usuário.");
    expect(confirm).not.toHaveBeenCalled();
    expect(disableUser).not.toHaveBeenCalled();

    cleanup();
    vi.clearAllMocks();
    getBranches.mockResolvedValue({ data: FALLBACK_BRANCHES });
    getUsers.mockResolvedValue({ data: usersList() });
    confirm.mockResolvedValue(true);
    disableUser.mockRejectedValueOnce({
      response: { status: 409, data: { code: "SERIALIZATION_CONFLICT" } },
    });
    renderAdminUsers({ id: 9, username: "supervisor", role: "ADMIN" });
    await screen.findAllByText("recepcao");
    await userEvent.click(screen.getAllByRole("button", { name: "Desativar usuário" })[1]);
    alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Não foi possível concluir a alteração porque os dados foram atualizados ao mesmo tempo. Tente novamente."
    );
    expect(toast.error).not.toHaveBeenCalled();

    expect(screen.getByTitle("Este usuário protegido não pode ser desativado.")).toBeDisabled();
    expect(screen.queryByText(/id=1|ADMIN \(id=1\)|SERIALIZATION_CONFLICT/)).not.toBeInTheDocument();
  });
});
