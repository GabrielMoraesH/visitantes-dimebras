import { createContext, useContext } from "react";

export const AuthContext = createContext({
  status: "unauthenticated",
  user: null,
  validateSession: async () => {},
  acceptSession: () => {},
  endSession: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
