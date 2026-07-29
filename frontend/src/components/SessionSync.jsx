import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../services/authState";

function isSessionRemovalEvent(event) {
  if (event.storageArea !== localStorage) return false;
  if (event.key === null) return true;

  return (event.key === "token" || event.key === "user") && event.newValue === null;
}

export default function SessionSync() {
  const { endSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    function handleStorage(event) {
      if (!isSessionRemovalEvent(event)) return;

      endSession();

      if (pathnameRef.current !== "/login") {
        navigate("/login", { replace: true });
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [endSession, navigate]);

  return null;
}
