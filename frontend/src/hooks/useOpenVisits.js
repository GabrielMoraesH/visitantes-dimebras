import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";

const OPEN_VISITS_POLL_MS = 5000;

export default function useOpenVisits({ onError }) {
  const [openVisits, setOpenVisits] = useState([]);
  const [loadingOpenVisits, setLoadingOpenVisits] = useState(false);
  const [initialLoadingOpenVisits, setInitialLoadingOpenVisits] = useState(true);
  const [refreshingOpenVisits, setRefreshingOpenVisits] = useState(false);

  const loadingOpenVisitsRef = useRef(false);
  const mountedRef = useRef(false);
  const pendingOpenVisitsRef = useRef(null);
  const openVisitsIntervalRef = useRef(null);

  const loadOpenVisits = useCallback(async ({ silent = false } = {}) => {
    if (loadingOpenVisitsRef.current) {
      pendingOpenVisitsRef.current = { silent };
      return;
    }

    try {
      loadingOpenVisitsRef.current = true;
      if (silent) {
        setRefreshingOpenVisits(true);
      } else {
        setLoadingOpenVisits(true);
      }

      const { data } = await api.get("/visits/open");
      if (!mountedRef.current) return;
      setOpenVisits(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      if (!mountedRef.current) return;
      if (!silent) setOpenVisits([]);
      onError?.(err?.response?.data?.message || "Erro ao carregar check-ins em aberto");
    } finally {
      if (mountedRef.current) {
        if (silent) {
          setRefreshingOpenVisits(false);
        } else {
          setLoadingOpenVisits(false);
          setInitialLoadingOpenVisits(false);
        }
      }

      loadingOpenVisitsRef.current = false;

      const pendingOptions = pendingOpenVisitsRef.current;
      pendingOpenVisitsRef.current = null;
      if (pendingOptions && mountedRef.current) loadOpenVisits(pendingOptions);
    }
  }, [onError]);

  useEffect(() => {
    mountedRef.current = true;
    loadOpenVisits({ silent: false });

    function stopInterval() {
      if (!openVisitsIntervalRef.current) return;
      clearInterval(openVisitsIntervalRef.current);
      openVisitsIntervalRef.current = null;
    }

    function startInterval() {
      if (openVisitsIntervalRef.current || document.hidden) return;
      openVisitsIntervalRef.current = setInterval(() => {
        if (!document.hidden) loadOpenVisits({ silent: true });
      }, OPEN_VISITS_POLL_MS);
    }

    const onFocus = () => {
      if (document.hidden) return;
      loadOpenVisits({ silent: true });
      startInterval();
    };

    const onVisibility = () => {
      if (document.hidden) {
        stopInterval();
        return;
      }

      loadOpenVisits({ silent: true });
      startInterval();
    };

    startInterval();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mountedRef.current = false;
      pendingOpenVisitsRef.current = null;
      stopInterval();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadOpenVisits]);

  return {
    initialLoadingOpenVisits,
    loadOpenVisits,
    loadingOpenVisits,
    openVisits,
    refreshingOpenVisits,
  };
}
