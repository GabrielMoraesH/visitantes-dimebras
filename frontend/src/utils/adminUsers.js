export const ADMIN_USER_ID = 1;
export const DEFAULT_BRANCH_ID = 1;
export const DEFAULT_ROLE = "RECEPCAO";
export const USER_ROLES = [
  { value: "RECEPCAO", label: "RECEPÇÃO" },
  { value: "ADMIN", label: "ADMIN" },
];

export function isAdminUserId(userId) {
  return Number(userId) === ADMIN_USER_ID;
}

export function firstBranchId(branches, fallback = DEFAULT_BRANCH_ID) {
  return String(branches?.[0]?.id ?? fallback);
}

export function initialCreateForm(branches) {
  return {
    username: "",
    password: "",
    role: DEFAULT_ROLE,
    branchId: firstBranchId(branches),
  };
}

export function editFormFromUser(user, branches) {
  return {
    userId: user.id,
    username: user.username || "",
    password: "",
    role: user.role || DEFAULT_ROLE,
    branchId: String(user.branchId ?? branches?.[0]?.id ?? DEFAULT_BRANCH_ID),
  };
}

export function validateCreateForm(form) {
  const username = form.username.trim();

  if (username.length < 3) {
    return "Username precisa ter pelo menos 3 letras";
  }

  if (form.password.length < 6) {
    return "Senha precisa ter pelo menos 6 caracteres";
  }

  if (!form.branchId) {
    return "Selecione a filial";
  }

  return "";
}

export function validateEditForm(form) {
  if (isAdminUserId(form.userId)) {
    if (!form.password) {
      return "Para o ADMIN, preencha a nova senha.";
    }

    if (form.password.length < 6) {
      return "Senha precisa ter no mínimo 6 caracteres";
    }

    return "";
  }

  if (form.username.trim().length < 3) {
    return "Username precisa ter pelo menos 3 letras";
  }

  if (form.password && form.password.length < 6) {
    return "Se preencher senha, precisa ter no mínimo 6 caracteres";
  }

  return "";
}

export function buildCreateUserPayload(form) {
  return {
    username: form.username.trim(),
    password: form.password,
    role: form.role,
    branchId: Number(form.branchId),
  };
}

export function buildEditUserPayload(form) {
  if (isAdminUserId(form.userId)) {
    return { password: form.password };
  }

  const payload = {
    username: form.username.trim(),
    role: form.role,
    branchId: Number(form.branchId),
  };

  if (form.password) {
    payload.password = form.password;
  }

  return payload;
}

export function toggleConfirmationForUser(user) {
  return {
    title: user.isActive ? "Desativar usuário" : "Reativar usuário",
    message: `Tem certeza que deseja ${
      user.isActive ? "desativar" : "reativar"
    } o usuário "${user.username}" (ID ${user.id})?`,
    confirmText: user.isActive ? "Desativar" : "Reativar",
    cancelText: "Cancelar",
    type: user.isActive ? "danger" : "default",
  };
}

export function formatUserCreatedAt(createdAt) {
  return createdAt ? new Date(createdAt).toLocaleString("pt-BR") : "-";
}
