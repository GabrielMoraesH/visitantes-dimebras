import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { API_BASE_URL } from "../services/api";
import { getTvWelcomeVisitors } from "../services/agendaService";
import { getPublicActiveTvContents } from "../services/tvContentService";
import { resolveTvBranchId } from "../utils/tvBranchRoute";
import "../styles/tvDisplay.css";

const IMAGE_DURATION_MS = 10000;
const PLAYLIST_REFRESH_MS = 60000;
const WELCOME_REFRESH_MS = 30000;
const DISPLAY_TICK_MS = 1000;
const AUTOPLAY_FALLBACK_MS = 5000;

function mediaUrl(fileUrl) {
  if (!fileUrl) return "";
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  return `${API_BASE_URL}${fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`}`;
}

function playlistSignature(items) {
  return JSON.stringify(
    items.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      fileUrl: item.fileUrl,
      order: item.order,
      createdAt: item.createdAt,
    }))
  );
}

function welcomeSignature(items) {
  return JSON.stringify(
    items.map((item) => ({
      id: item.id,
      visitorName: item.visitorName,
      company: item.company,
      eventWith: item.eventWith,
      department: item.department,
      eventDateTime: item.eventDateTime,
      branchId: item.branchId,
      status: item.status,
    }))
  );
}

function formatClock(date) {
  return date.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TvDisplay() {
  const location = useLocation();
  const videoRef = useRef(null);
  const itemsRef = useRef([]);
  const welcomeVisitorsRef = useRef([]);
  const currentIndexRef = useRef(0);
  const pollingIntervalRef = useRef(null);
  const playlistLoadingRef = useRef(false);
  const welcomeLoadingRef = useRef(false);
  const branchIdRef = useRef(undefined);
  const playlistLastRefreshRef = useRef(0);
  const welcomeLastRefreshRef = useRef(0);
  const initialPlaylistLoadedRef = useRef(false);
  const [items, setItems] = useState([]);
  const [welcomeVisitors, setWelcomeVisitors] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackCycle, setPlaybackCycle] = useState(0);
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState("");
  const [welcomeError, setWelcomeError] = useState("");
  const [now, setNow] = useState(() => new Date());

  const tvBranch = useMemo(
    () =>
      resolveTvBranchId({
        pathname: location.pathname,
        search: location.search,
      }),
    [location.pathname, location.search]
  );
  const branchId = tvBranch.branchId;
  branchIdRef.current = branchId;
  const currentItem = items[currentIndex] || null;
  const currentMediaUrl = useMemo(() => mediaUrl(currentItem?.fileUrl), [currentItem]);
  const hasWelcomeVisitors = welcomeVisitors.length > 0;
  const hasMultipleWelcomeVisitors = welcomeVisitors.length > 1;
  const visibleWelcomeVisitors = welcomeVisitors.slice(0, 6);
  const welcomeCountClass = `tvDisplay-welcome-count-${Math.min(
    visibleWelcomeVisitors.length,
    6
  )}`;

  useLayoutEffect(() => {
    itemsRef.current = [];
    welcomeVisitorsRef.current = [];
    currentIndexRef.current = 0;
    playlistLoadingRef.current = false;
    welcomeLoadingRef.current = false;
    playlistLastRefreshRef.current = 0;
    welcomeLastRefreshRef.current = 0;
    initialPlaylistLoadedRef.current = false;

    setItems([]);
    setWelcomeVisitors([]);
    setCurrentIndex(0);
    setPlaybackCycle((cycle) => cycle + 1);
    setInitialError("");
    setWelcomeError("");
    setLoading(Boolean(branchId));
  }, [branchId]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    welcomeVisitorsRef.current = welcomeVisitors;
  }, [welcomeVisitors]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const advance = useCallback(() => {
    setPlaybackCycle((cycle) => cycle + 1);
    setCurrentIndex((index) => {
      if (items.length === 0) return 0;
      return (index + 1) % items.length;
    });
  }, [items.length]);

  const loadPlaylist = useCallback(async ({ initial = false } = {}) => {
    if (!branchId) return;
    if (playlistLoadingRef.current) return;

    const requestBranchId = branchId;
    try {
      playlistLoadingRef.current = true;
      const { data } = await getPublicActiveTvContents(requestBranchId);
      if (branchIdRef.current !== requestBranchId) return;

      const nextItems = Array.isArray(data) ? data : [];
      const previousItems = itemsRef.current;

      setInitialError("");
      if (playlistSignature(previousItems) === playlistSignature(nextItems)) {
        return;
      }

      const currentId = previousItems[currentIndexRef.current]?.id;
      const nextIndex = nextItems.findIndex((item) => item.id === currentId);
      setCurrentIndex(nextIndex >= 0 ? nextIndex : 0);
      setPlaybackCycle((cycle) => cycle + 1);
      setItems(nextItems);
    } catch {
      if (branchIdRef.current !== requestBranchId) return;
      if (initial || itemsRef.current.length === 0) {
        setInitialError("Erro ao carregar conteúdo da TV");
      }
    } finally {
      if (branchIdRef.current === requestBranchId) {
        playlistLoadingRef.current = false;
        if (initial) initialPlaylistLoadedRef.current = true;
        if (initial) setLoading(false);
      }
    }
  }, [branchId]);

  const loadWelcomeVisitors = useCallback(async () => {
    if (!branchId) return;
    if (welcomeLoadingRef.current) return;

    const requestBranchId = branchId;
    try {
      welcomeLoadingRef.current = true;
      const data = await getTvWelcomeVisitors(requestBranchId);
      if (branchIdRef.current !== requestBranchId) return;

      const nextVisitors = Array.isArray(data) ? data : [];
      const previousVisitors = welcomeVisitorsRef.current;

      setWelcomeError("");
      if (welcomeSignature(previousVisitors) === welcomeSignature(nextVisitors)) {
        return;
      }

      setWelcomeVisitors(nextVisitors);
    } catch {
      if (branchIdRef.current !== requestBranchId) return;
      setWelcomeVisitors([]);
      if (itemsRef.current.length === 0) {
        setWelcomeError("Não foi possível consultar visitantes agendados.");
      }
    } finally {
      if (branchIdRef.current === requestBranchId) {
        welcomeLoadingRef.current = false;
      }
    }
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return undefined;

    function stopInterval() {
      if (!pollingIntervalRef.current) return;
      window.clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    function refreshNow() {
      const timestamp = Date.now();

      setNow(new Date(timestamp));

      if (document.hidden) return;

      playlistLastRefreshRef.current = timestamp;
      welcomeLastRefreshRef.current = timestamp;
      loadPlaylist({ initial: !initialPlaylistLoadedRef.current });
      loadWelcomeVisitors();
    }

    function tick() {
      const timestamp = Date.now();

      setNow(new Date(timestamp));

      if (document.hidden) return;

      if (timestamp - welcomeLastRefreshRef.current >= WELCOME_REFRESH_MS) {
        welcomeLastRefreshRef.current = timestamp;
        loadWelcomeVisitors();
      }

      if (timestamp - playlistLastRefreshRef.current >= PLAYLIST_REFRESH_MS) {
        playlistLastRefreshRef.current = timestamp;
        loadPlaylist();
      }
    }

    function startInterval() {
      if (pollingIntervalRef.current || document.hidden) return;
      pollingIntervalRef.current = window.setInterval(tick, DISPLAY_TICK_MS);
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stopInterval();
        return;
      }

      refreshNow();
      startInterval();
    }

    refreshNow();
    startInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [branchId, loadPlaylist, loadWelcomeVisitors]);

  useEffect(() => {
    if (!currentItem || currentItem.type !== "IMAGE") return undefined;

    const timeoutId = window.setTimeout(advance, IMAGE_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [advance, currentItem, playbackCycle]);

  useEffect(() => {
    if (!currentItem || currentItem.type !== "VIDEO") return undefined;

    let fallbackId;
    const video = videoRef.current;
    const playPromise = video?.play?.();

    if (playPromise?.catch) {
      playPromise.catch(() => {
        fallbackId = window.setTimeout(advance, AUTOPLAY_FALLBACK_MS);
      });
    }

    return () => {
      if (fallbackId) window.clearTimeout(fallbackId);
    };
  }, [advance, currentItem, playbackCycle]);

  if (!branchId) {
    return (
      <main className="tvDisplay-page">
        <section className="tvDisplay-status" aria-live="polite">
          <h1>{tvBranch.source === "missing" ? "Filial não informada" : "Filial não encontrada"}</h1>
          <p>Use um endereço no formato: /tv1 ou /tv?branchId=1</p>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="tvDisplay-page">
        <section className="tvDisplay-status" aria-live="polite">
          <h1>Carregando conteúdo</h1>
        </section>
      </main>
    );
  }

  if (initialError && items.length === 0 && !hasWelcomeVisitors) {
    return (
      <main className="tvDisplay-page">
        <section className="tvDisplay-status" aria-live="polite">
          <h1>{initialError}</h1>
          {welcomeError && <p>{welcomeError}</p>}
        </section>
      </main>
    );
  }

  if (items.length === 0 && !hasWelcomeVisitors) {
    return (
      <main className="tvDisplay-page">
        <section className="tvDisplay-status" aria-live="polite">
          <h1>Nenhum conteúdo disponível</h1>
          {welcomeError && <p>{welcomeError}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="tvDisplay-page">
      {currentItem && (
        <section className="tvDisplay-stage" aria-label="Conteúdo TV">
          {currentItem.type === "VIDEO" ? (
          <video
            key={`${currentItem.id}-${playbackCycle}`}
            ref={videoRef}
            className="tvDisplay-media tvDisplay-video"
            src={currentMediaUrl}
            autoPlay
            muted
            playsInline
            preload="auto"
            onEnded={advance}
            onError={advance}
          />
          ) : (
          <img
            key={`${currentItem.id}-${playbackCycle}`}
            className="tvDisplay-media tvDisplay-image"
            src={currentMediaUrl}
            alt="Conteúdo TV"
            onError={advance}
          />
          )}
        </section>
      )}

      {hasWelcomeVisitors && (
        <section className="tvDisplay-welcome" aria-live="polite">
          <div
            className={`tvDisplay-welcome-card${
              hasMultipleWelcomeVisitors ? " tvDisplay-welcome-cardMultiple" : ""
            } ${welcomeCountClass}`}
          >
            <div className="tvDisplay-welcome-title">
              {hasMultipleWelcomeVisitors ? "BEM-VINDOS À DIMEBRAS" : "BEM-VINDO À DIMEBRAS"}
            </div>

            <div className="tvDisplay-welcome-list">
              {visibleWelcomeVisitors.map((visitor) => (
                <article className="tvDisplay-welcome-visitor" key={visitor.id}>
                  <h1 className="tvDisplay-welcome-name">{visitor.visitorName}</h1>
                </article>
              ))}
            </div>

            {welcomeVisitors.length > 6 && (
              <div className="tvDisplay-welcome-extra">
                +{welcomeVisitors.length - 6} visitantes aguardados
              </div>
            )}

            <p className="tvDisplay-welcome-message">
              {hasMultipleWelcomeVisitors
                ? "Dirijam-se à recepção para realizar o check-in"
                : "Dirija-se à recepção para realizar seu check-in"}
            </p>
          </div>
        </section>
      )}

      <div className="tvDisplay-clockWrap">
        <time className="tvDisplay-clock" dateTime={now.toISOString()}>
          {formatClock(now)}
        </time>
      </div>
    </main>
  );
}
