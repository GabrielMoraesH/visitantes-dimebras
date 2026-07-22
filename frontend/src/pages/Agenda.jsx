import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRef } from "react";
import "../styles/agenda.css";
import AgendaCard from "../components/AgendaCard";
import AgendaModal from "../components/AgendaModal";
import { getAgenda } from "../services/agendaService";

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isSameDay(dateA, dateB) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

export default function Agenda() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [calendarDate, setCalendarDate] = useState(
    formatDateForInput(new Date())
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const loadingAgendaRef = useRef(false);
  const pendingAgendaDateRef = useRef(null);
  const nowIntervalRef = useRef(null);

  function handleEdit(event) {
    if (event.status === "CANCELADO") return;

    setSelectedEvent(event);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setSelectedEvent(null);
  }

  function formatDate(date) {
    return date.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).replace(/^./, (c) => c.toUpperCase());
  }

  const loadAgenda = useCallback(async (date = selectedDate) => {
    if (loadingAgendaRef.current) {
      pendingAgendaDateRef.current = date;
      return;
    }

    try {
      loadingAgendaRef.current = true;
      setLoading(true);
      setLoadError("");

      const formattedDate = formatDateForInput(date);
      const data = await getAgenda(formattedDate);

      setEvents(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Erro ao carregar agenda:", error);
      setEvents([]);
      setLoadError(
        error?.response?.data?.message ||
        "N\u00e3o foi poss\u00edvel carregar a agenda."
      );
    } finally {
      loadingAgendaRef.current = false;
      setLoading(false);

      const pendingDate = pendingAgendaDateRef.current;
      pendingAgendaDateRef.current = null;
      if (pendingDate) loadAgenda(pendingDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadAgenda(selectedDate);
  }, [loadAgenda, selectedDate]);

  useEffect(() => {
    function stopInterval() {
      if (!nowIntervalRef.current) return;
      clearInterval(nowIntervalRef.current);
      nowIntervalRef.current = null;
    }

    function startInterval() {
      if (nowIntervalRef.current || document.hidden) return;
      nowIntervalRef.current = setInterval(() => {
        if (!document.hidden) setNow(new Date());
      }, 30000);
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stopInterval();
        return;
      }

      setNow(new Date());
      loadAgenda(selectedDate);
      startInterval();
    }

    startInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadAgenda, selectedDate]);

  const eventsFromSelectedDate = events.filter((event) => (
    formatDateForInput(new Date(event.eventDateTime)) ===
    formatDateForInput(selectedDate)
  ));

  const filteredEvents = eventsFromSelectedDate.filter((event) => {
    const text = search.toLowerCase();

    const matchesSearch =
      event.visitorName.toLowerCase().includes(text) ||
      event.company.toLowerCase().includes(text) ||
      event.eventWith.toLowerCase().includes(text) ||
      event.department.toLowerCase().includes(text);

    const matchesStatus =
      statusFilter === "TODOS" ||
      event.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const sortedEvents = [...filteredEvents].sort((a, b) => {
    const dateDiff =
      new Date(a.eventDateTime) - new Date(b.eventDateTime);

    if (dateDiff !== 0) return dateDiff;

    return Number(a.id) - Number(b.id);
  });

  const eventsForNextCalculation = [...events]
    .filter((event) => event.status === "AGENDADO")
    .sort((a, b) => {
      const dateDiff =
        new Date(a.eventDateTime) - new Date(b.eventDateTime);

      if (dateDiff !== 0) return dateDiff;

      return Number(a.id) - Number(b.id);
    });

  const hasAgendaEvents = eventsFromSelectedDate.length > 0;

  function previousDay() {
    const newDate = new Date(selectedDate);

    newDate.setDate(newDate.getDate() - 1);

    setSelectedDate(newDate);
    setCalendarDate(formatDateForInput(newDate));
  }

  const isViewingToday = isSameDay(selectedDate, now);

  const candidates = isViewingToday ? eventsForNextCalculation.filter((event) => {
    if (event.status !== "AGENDADO") return false;

    const eventDate = new Date(event.eventDateTime);

    return eventDate >= now;
  }) : [];

  const nextEventTime = candidates.length
    ? new Date(candidates[0].eventDateTime).getTime()
    : null;

  function isNextEvent(event) {
    if (!isViewingToday) return false;
    if (event.status !== "AGENDADO") return false;
    if (nextEventTime === null) return false;

    return new Date(event.eventDateTime).getTime() === nextEventTime;
  }

  function nextDay() {
    const newDate = new Date(selectedDate);

    newDate.setDate(newDate.getDate() + 1);

    setSelectedDate(newDate);
    setCalendarDate(formatDateForInput(newDate));
  }

  function goToToday() {
    const today = new Date();

    setSelectedDate(today);
    setCalendarDate(formatDateForInput(today));
  }

  function handleCalendarChange(e) {
    const value = e.target.value;

    setCalendarDate(value);

    const [year, month, day] = value.split("-").map(Number);

    setSelectedDate(new Date(year, month - 1, day));
  }

return (
  <>
    <header className="agenda-topbar">
      <div
        className="agenda-brand"
        onClick={() => navigate("/checkin")}
        role="button"
        tabIndex={0}
      >
        <img
          src="/logo.png"
          alt="Dimebras"
          className="agenda-logo"
        />
      </div>

      <div className="agenda-topbar-actions">
        <button
          className="agenda-topbar-btn"
          onClick={() => navigate("/checkin")}
          type="button"
        >
          VOLTAR
        </button>
      </div>
    </header>

    <div className="agenda-page">
        <div className="agenda-container">
          <div className="agenda-header">
            <div className="agenda-top-row">
              <div className="agenda-heading">
                <h1>Agenda</h1>
                <p className="agenda-heading-subtitle">
                  Gerencie os agendamentos de visitantes
                </p>
              </div>

              <button
                type="button"
                className="new-event-button"
                onClick={() => {
                  setSelectedEvent(null);
                  setModalOpen(true);
                }}
              >
                + Agendar Visita
              </button>
            </div>

            <div className="agenda-date-section">
              <div className="agenda-date-navigation">
                <button
                  type="button"
                  className="agenda-arrow-button"
                  onClick={previousDay}
                  aria-label="Dia anterior"
                >
                  &lsaquo;
                </button>

                <button
                  type="button"
                  className="today-button"
                  onClick={goToToday}
                >
                  Hoje
                </button>

                <input
                  type="date"
                  className="calendar-input"
                  value={calendarDate}
                  onChange={handleCalendarChange}
                />

                <button
                  type="button"
                  className="agenda-arrow-button"
                  onClick={nextDay}
                  aria-label="Próximo dia"
                >
                  &rsaquo;
                </button>
              </div>

              <div className="agenda-date-info">
                <p className="agenda-date">
                  {formatDate(selectedDate)}
                </p>

                <p className="agenda-counter">
                  {filteredEvents.length} visitante
                  {filteredEvents.length !== 1 ? "s" : ""} encontrado
                  {filteredEvents.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <div className="agenda-search-wrapper">
              <input
                type="text"
                className="agenda-search"
                placeholder="Buscar visitante, empresa, responsável ou setor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="agenda-filters">
            <button
              className={statusFilter === "TODOS" ? "active-filter" : ""}
              onClick={() => setStatusFilter("TODOS")}
            >
              Todos
            </button>

            <button
              className={statusFilter === "AGENDADO" ? "active-filter" : ""}
              onClick={() => setStatusFilter("AGENDADO")}
            >
              Agendados
            </button>

            <button
              className={statusFilter === "CANCELADO" ? "active-filter" : ""}
              onClick={() => setStatusFilter("CANCELADO")}
            >
              Cancelados
            </button>
          </div>

          {loading ? (
            <div className="agenda-empty">
              <div className="empty-icon">⏳</div>
              <h2>Carregando agenda...</h2>
            </div>
          ) : loadError ? (
            <div className="agenda-empty agenda-error">
              <div className="agenda-error-icon">!</div>

              <h2 className="agenda-error-title">
                {"Não foi possível carregar a agenda"}
              </h2>

              <p className="agenda-error-text">
                {"Verifique sua conexão ou tente novamente."}
              </p>

              <button
                type="button"
                className="agenda-retry-button"
                onClick={() => loadAgenda(selectedDate)}
              >
                Tentar novamente
              </button>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="agenda-empty">
              <div className="empty-icon">📭</div>

              <h2>
                {hasAgendaEvents
                  ? "Nenhum resultado encontrado"
                  : "Nenhum agendamento"}
              </h2>

              {hasAgendaEvents && (
                <p>
                  {"Não existem agendamentos correspondentes aos filtros atuais."}
                </p>
              )}

              {!hasAgendaEvents && (
              <p>
                Não existem visitantes agendados para esta data.
              </p>
              )}
            </div>
          ) : (
            <div className="agenda-list">
              {sortedEvents.map((event) => (
                <AgendaCard
                  key={event.id}
                  event={event}
                  isNext={isNextEvent(event)}
                  onEdit={handleEdit}
                  onCancel={loadAgenda}
                />
              ))}
            </div>
          )}
        </div>

        {modalOpen && (
          <AgendaModal
            event={selectedEvent}
            onClose={closeModal}
            onSuccess={async () => {
              await loadAgenda(selectedDate);
            }}
          />
        )}
      </div>
    </>
  );
}
