const TOKEN_KEY = "token";
const USER_KEY = "user";

function hasStorage() {
  return typeof localStorage !== "undefined";
}

function isValidUser(user) {
  return (
    Boolean(user) &&
    typeof user === "object" &&
    !Array.isArray(user) &&
    user.id != null &&
    typeof user.username === "string" &&
    user.username.length > 0 &&
    typeof user.role === "string" &&
    user.role.length > 0
  );
}

function isValidBranch(branch) {
  return Boolean(branch) && typeof branch === "object" && !Array.isArray(branch);
}

function sanitizeBranchForStorage(branch) {
  if (!isValidBranch(branch)) return null;

  const safeBranch = {};

  if (branch.id != null) safeBranch.id = branch.id;
  if (typeof branch.name === "string") safeBranch.name = branch.name;

  return Object.keys(safeBranch).length > 0 ? safeBranch : null;
}

function sanitizeUserForStorage(user) {
  if (!isValidUser(user)) return null;

  const safeUser = {
    id: user.id,
    username: user.username,
    role: user.role,
  };

  const safeBranch = sanitizeBranchForStorage(user.branch);
  if (safeBranch) {
    safeUser.branch = safeBranch;
  }

  return safeUser;
}

export function getToken() {
  if (!hasStorage()) return null;

  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  if (!hasStorage()) return null;

  try {
    const user = JSON.parse(localStorage.getItem(USER_KEY) || "null");
    return isValidUser(user) ? user : null;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(getToken() && getUser());
}

export function setSession(token, user) {
  if (!hasStorage()) return;

  const safeUser = sanitizeUserForStorage(user);

  if (!token || !safeUser) {
    clearSession();
    return;
  }

  try {
    const serializedUser = JSON.stringify(safeUser);

    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, serializedUser);
  } catch {
    clearSession();
  }
}

export function clearSession() {
  if (!hasStorage()) return;

  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
