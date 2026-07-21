import { createContext, useContext } from "react";

export const AuthContext = createContext({
  status: "unauthenticated",
  user: null,
  validateSession: async () => {},
  acceptSession: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
