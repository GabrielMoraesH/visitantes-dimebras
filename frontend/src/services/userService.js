import api from "./api";

export function getUsers() {
  return api.get("/users");
}

export function createUser(payload) {
  return api.post("/users", payload);
}

export function updateUser(userId, payload) {
  return api.put(`/users/${userId}`, payload);
}

export function disableUser(userId) {
  return api.patch(`/users/${userId}/disable`, null);
}

export function enableUser(userId) {
  return api.patch(`/users/${userId}/enable`, null);
}
