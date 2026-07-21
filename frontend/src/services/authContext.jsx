import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentUser } from "./auth";
import { AuthContext } from "./authState";
import { clearSession, getToken, getUser, isAuthenticated, setSession } from "./session";

function initialAuthState() {
  if (!isAuthenticated()) {
    clearSession();
    return { status: "unauthenticated", user: null };
  }

  return { status: "validating", user: getUser() };
}

export function AuthProvider({ children }) {
  const [state, setState] = useState(initialAuthState);
  const validationPromiseRef = useRef(null);

  const validateSession = useCallback(async () => {
    const token = getToken();
    if (!token || !getUser()) {
      clearSession();
      setState({ status: "unauthenticated", user: null });
      return null;
    }

    if (validationPromiseRef.current) return validationPromiseRef.current;

    setState((current) => ({
      status: current.status === "authenticated" ? "authenticated" : "validating",
      user: current.user || getUser(),
    }));

    validationPromiseRef.current = getCurrentUser()
      .then((user) => {
        if (!user) {
          clearSession();
          setState({ status: "unauthenticated", user: null });
          return null;
        }

        setSession(token, user);
        setState({ status: "authenticated", user });
        return user;
      })
      .catch((error) => {
        if (error?.response?.status === 401) {
          clearSession();
          setState({ status: "unauthenticated", user: null });
          return null;
        }

        setState({ status: "error", user: getUser() });
        return null;
      })
      .finally(() => {
        validationPromiseRef.current = null;
      });

    return validationPromiseRef.current;
  }, []);

  useEffect(() => {
    if (state.status === "validating") {
      queueMicrotask(() => {
        validateSession();
      });
    }
  }, [state.status, validateSession]);

  const acceptSession = useCallback((user) => {
    setState({ status: "authenticated", user });
  }, []);

  const value = useMemo(
    () => ({
      status: state.status,
      user: state.user,
      validateSession,
      acceptSession,
    }),
    [state.status, state.user, validateSession, acceptSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
