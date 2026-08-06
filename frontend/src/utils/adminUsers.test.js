import { describe, expect, it } from "vitest";
import {
  ADMIN_USER_MESSAGES,
  adminUserErrorMessage,
  buildCreateUserPayload,
  buildEditUserPayload,
  editFormFromUser,
  orderedFieldMessages,
  toggleConfirmationForUser,
  validateCreateForm,
  validateEditForm,
} from "./adminUsers";

describe("adminUsers utils", () => {
  it("validates and builds the create payload without changing the API contract", () => {
    const form = {
      username: "  recepcao2  ",
      password: "123456",
      role: "RECEPCAO",
      branchId: "5",
    };

    expect(validateCreateForm(form)).toEqual({});
    expect(buildCreateUserPayload(form)).toEqual({
      username: "recepcao2",
      password: "123456",
      role: "RECEPCAO",
      branchId: 5,
    });
  });

  it("uses the official field messages in the expected order", () => {
    const errors = validateCreateForm({
      username: "",
      password: "",
      role: "",
      branchId: "",
    });

    expect(orderedFieldMessages(errors)).toEqual([
      "Informe o usuário.",
      "Informe a senha.",
      "Selecione o perfil.",
      "Selecione a filial.",
    ]);
  });

  it("keeps password optional when editing regular users", () => {
    const form = {
      userId: 2,
      username: " recepcao3 ",
      password: "",
      role: "ADMIN",
      branchId: "2",
    };

    expect(validateEditForm(form)).toEqual({});
    expect(buildEditUserPayload(form)).toEqual({
      username: "recepcao3",
      role: "ADMIN",
      branchId: 2,
    });
  });

  it("requires only password fields for the protected user edit payload", () => {
    const form = {
      userId: 1,
      username: "admin",
      password: "nova123",
      role: "RECEPCAO",
      branchId: "6",
    };

    expect(validateEditForm(form)).toEqual({});
    expect(buildEditUserPayload(form)).toEqual({ password: "nova123" });
  });

  it("maps a user into edit form state preserving branch and role values", () => {
    expect(
      editFormFromUser(
        { id: 7, username: "operador", role: "ADMIN", branchId: 3 },
        [{ id: 1, name: "Dimebras PR" }]
      )
    ).toEqual({
      userId: 7,
      username: "operador",
      password: "",
      role: "ADMIN",
      branchId: "3",
    });
  });

  it("does not expose technical IDs in the status confirmation copy", () => {
    expect(toggleConfirmationForUser({ id: 8, username: "teste", isActive: true })).toEqual({
      title: "Desativar usuário",
      message: "Tem certeza de que deseja desativar este usuário?",
      confirmText: "Desativar",
      cancelText: "Cancelar",
      type: "danger",
    });
  });

  it("maps structured user errors to friendly messages", () => {
    expect(
      adminUserErrorMessage(
        { response: { status: 409, data: { code: "USER_USERNAME_CONFLICT" } } },
        "create"
      )
    ).toBe(ADMIN_USER_MESSAGES.duplicateUser);
    expect(
      adminUserErrorMessage(
        { response: { status: 409, data: { code: "LAST_ACTIVE_ADMIN_REQUIRED" } } },
        "edit"
      )
    ).toBe(ADMIN_USER_MESSAGES.lastActiveAdmin);
    expect(
      adminUserErrorMessage(
        { response: { status: 409, data: { code: "SERIALIZATION_CONFLICT" } } },
        "deactivate"
      )
    ).toBe(ADMIN_USER_MESSAGES.serializationConflict);
  });

  it("normalizes network and unexpected errors without exposing technical messages", () => {
    expect(adminUserErrorMessage(new Error("Network Error"), "create")).toBe(
      ADMIN_USER_MESSAGES.network
    );
    expect(
      adminUserErrorMessage(
        { response: { status: 500, data: { message: "select passwordHash stack" } } },
        "edit"
      )
    ).toBe(ADMIN_USER_MESSAGES.editUnexpected);
  });
});
