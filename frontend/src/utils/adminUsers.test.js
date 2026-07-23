import { describe, expect, it } from "vitest";
import {
  buildCreateUserPayload,
  buildEditUserPayload,
  editFormFromUser,
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

    expect(validateCreateForm(form)).toBe("");
    expect(buildCreateUserPayload(form)).toEqual({
      username: "recepcao2",
      password: "123456",
      role: "RECEPCAO",
      branchId: 5,
    });
  });

  it("keeps password optional when editing regular users", () => {
    const form = {
      userId: 2,
      username: " recepcao3 ",
      password: "",
      role: "ADMIN",
      branchId: "2",
    };

    expect(validateEditForm(form)).toBe("");
    expect(buildEditUserPayload(form)).toEqual({
      username: "recepcao3",
      role: "ADMIN",
      branchId: 2,
    });
  });

  it("allows only the password payload for ADMIN id 1", () => {
    const form = {
      userId: 1,
      username: "admin",
      password: "nova123",
      role: "RECEPCAO",
      branchId: "6",
    };

    expect(validateEditForm(form)).toBe("");
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

  it("keeps the existing toggle confirmation copy and action type", () => {
    expect(
      toggleConfirmationForUser({ id: 8, username: "teste", isActive: false })
    ).toEqual({
      title: "Reativar usuário",
      message: 'Tem certeza que deseja reativar o usuário "teste" (ID 8)?',
      confirmText: "Reativar",
      cancelText: "Cancelar",
      type: "default",
    });
  });
});
