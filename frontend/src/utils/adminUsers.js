export const ADMIN_USER_ID = 1;
export const DEFAULT_BRANCH_ID = 1;
export const DEFAULT_ROLE = "RECEPCAO";
export const USER_ROLES = [
  { value: "RECEPCAO", label: "RECEPÇÃO" },
  { value: "ADMIN", label: "ADMIN" },
];

export const ADMIN_USER_MESSAGES = {
  fieldsTitle: "Corrija os campos:",
  usernameRequired: "Informe o usuário.",
  usernameShort: "Digite um usuário com pelo menos 3 caracteres.",
  passwordRequired: "Informe a senha.",
  passwordShort: "Digite uma senha com pelo menos 6 caracteres.",
  roleRequired: "Selecione o perfil.",
  branchRequired: "Selecione a filial.",
  duplicateUser: "Este usuário já está cadastrado.",
  selfDisable: "Você não pode desativar o próprio usuário.",
  lastActiveAdmin: "Não é possível desativar ou remover o perfil do último administrador ativo.",
  protectedEdit: "Neste usuário, só é permitido alterar a senha.",
  protectedDisable: "Este usuário protegido não pode ser desativado.",
  serializationConflict:
    "Não foi possível concluir a alteração porque os dados foram atualizados ao mesmo tempo. Tente novamente.",
  createSuccess: "Usuário criado com sucesso.",
  editSuccess: "Usuário atualizado com sucesso.",
  activateSuccess: "Usuário ativado com sucesso.",
  deactivateSuccess: "Usuário desativado com sucesso.",
  createUnexpected: "Não foi possível criar o usuário.\n\nTente novamente em alguns instantes.",
  editUnexpected: "Não foi possível atualizar o usuário.\n\nTente novamente em alguns instantes.",
  activateUnexpected: "Não foi possível ativar o usuário.\n\nTente novamente em alguns instantes.",
  deactivateUnexpected: "Não foi possível desativar o usuário.\n\nTente novamente em alguns instantes.",
  loadUnexpected: "Não foi possível carregar os usuários.\n\nTente novamente.",
  network: "Não foi possível conectar ao servidor.\n\nVerifique sua conexão e tente novamente.",
  forbidden: "Você não tem permissão para administrar usuários.",
  notFound: "Usuário não encontrado.",
  empty: "Nenhum usuário encontrado.",
  createLoading: "Criando usuário...",
  createLoadingAccessible: "Criando usuário, aguarde...",
  editLoading: "Salvando alterações...",
  editLoadingAccessible: "Salvando alterações, aguarde...",
  activateLoading: "Ativando...",
  activateLoadingAccessible: "Ativando usuário, aguarde...",
  deactivateLoading: "Desativando...",
  deactivateLoadingAccessible: "Desativando usuário, aguarde...",
  listLoading: "Carregando usuários...",
};

const FIELD_ORDER = ["username", "password", "role", "branchId"];

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

export function orderedFieldMessages(fieldErrors) {
  return FIELD_ORDER.map((field) => fieldErrors?.[field]).filter(Boolean);
}

export function hasFieldErrors(fieldErrors) {
  return orderedFieldMessages(fieldErrors).length > 0;
}

export function validateCreateForm(form) {
  const errors = {};
  const username = form.username.trim();

  if (!username) {
    errors.username = ADMIN_USER_MESSAGES.usernameRequired;
  } else if (username.length < 3) {
    errors.username = ADMIN_USER_MESSAGES.usernameShort;
  }

  if (!form.password) {
    errors.password = ADMIN_USER_MESSAGES.passwordRequired;
  } else if (form.password.length < 6) {
    errors.password = ADMIN_USER_MESSAGES.passwordShort;
  }

  if (!form.role) {
    errors.role = ADMIN_USER_MESSAGES.roleRequired;
  }

  if (!form.branchId) {
    errors.branchId = ADMIN_USER_MESSAGES.branchRequired;
  }

  return errors;
}

export function validateEditForm(form) {
  const errors = {};

  if (isAdminUserId(form.userId)) {
    if (!form.password) {
      errors.password = ADMIN_USER_MESSAGES.passwordRequired;
    } else if (form.password.length < 6) {
      errors.password = ADMIN_USER_MESSAGES.passwordShort;
    }

    return errors;
  }

  const username = form.username.trim();
  if (!username) {
    errors.username = ADMIN_USER_MESSAGES.usernameRequired;
  } else if (username.length < 3) {
    errors.username = ADMIN_USER_MESSAGES.usernameShort;
  }

  if (form.password && form.password.length < 6) {
    errors.password = ADMIN_USER_MESSAGES.passwordShort;
  }

  if (!form.role) {
    errors.role = ADMIN_USER_MESSAGES.roleRequired;
  }

  if (!form.branchId) {
    errors.branchId = ADMIN_USER_MESSAGES.branchRequired;
  }

  return errors;
}

function getErrorCode(error) {
  return error?.response?.data?.code || error?.code || "";
}

function getErrorMessage(error) {
  return String(error?.response?.data?.message || error?.message || "");
}

export function adminUserErrorMessage(error, action) {
  if (!error?.response) return ADMIN_USER_MESSAGES.network;

  const code = getErrorCode(error);
  const message = getErrorMessage(error);
  const status = error.response?.status;

  if (code === "USER_USERNAME_CONFLICT") return ADMIN_USER_MESSAGES.duplicateUser;
  if (code === "LAST_ACTIVE_ADMIN_REQUIRED") return ADMIN_USER_MESSAGES.lastActiveAdmin;
  if (code === "SERIALIZATION_CONFLICT") return ADMIN_USER_MESSAGES.serializationConflict;
  if (code === "INVALID_REFERENCE") return ADMIN_USER_MESSAGES.branchRequired;
  if (code === "UNIQUE_CONSTRAINT_CONFLICT") return ADMIN_USER_MESSAGES.duplicateUser;
  if (/Username j[aá] existe|Usu[aá]rio j[aá] existe|unique|P2002/i.test(message)) {
    return ADMIN_USER_MESSAGES.duplicateUser;
  }
  if (/pr[oó]prio usu[aá]rio/i.test(message)) return ADMIN_USER_MESSAGES.selfDisable;
  if (/ADMIN \(id=1\).*senha|id=1.*senha/i.test(message)) return ADMIN_USER_MESSAGES.protectedEdit;
  if (/desativar.*ADMIN \(id=1\)|ADMIN \(id=1\).*desativar/i.test(message)) {
    return ADMIN_USER_MESSAGES.protectedDisable;
  }
  if (/branchId|filial/i.test(message)) return ADMIN_USER_MESSAGES.branchRequired;
  if (status === 401 || status === 403) return ADMIN_USER_MESSAGES.forbidden;
  if (status === 404) return ADMIN_USER_MESSAGES.notFound;

  if (action === "create") return ADMIN_USER_MESSAGES.createUnexpected;
  if (action === "edit") return ADMIN_USER_MESSAGES.editUnexpected;
  if (action === "activate") return ADMIN_USER_MESSAGES.activateUnexpected;
  if (action === "deactivate") return ADMIN_USER_MESSAGES.deactivateUnexpected;
  return ADMIN_USER_MESSAGES.loadUnexpected;
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
  if (user.isActive) {
    return {
      title: "Desativar usuário",
      message: "Tem certeza de que deseja desativar este usuário?",
      confirmText: "Desativar",
      cancelText: "Cancelar",
      type: "danger",
    };
  }

  return {
    title: "Ativar usuário",
    message: "Tem certeza de que deseja ativar este usuário?",
    confirmText: "Ativar",
    cancelText: "Cancelar",
    type: "default",
  };
}

export function formatUserCreatedAt(createdAt) {
  return createdAt ? new Date(createdAt).toLocaleString("pt-BR") : "-";
}
