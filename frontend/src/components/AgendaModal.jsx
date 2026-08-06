import { useEffect, useRef, useState } from "react";
import "../styles/agendaModal.css";
import {
    createAgenda,
    updateAgenda,
} from "../services/agendaService";
import {
    AGENDA_MODAL_MESSAGES,
    FIELD_ERROR_IDS,
    agendaOperationErrorMessage,
    buildAgendaValidationErrors,
    orderedAgendaValidationMessages,
} from "../utils/agendaMessages";
import { useToast } from "./Feedback/ToastProvider";

function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatTimeForInput(date) {
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");

    return `${hour}:${minute}`;
}

export default function AgendaModal({
    event,
    onClose,
    onSuccess,
}) {
    const toast = useToast();
    const submittingRef = useRef(false);
    const alertRef = useRef(null);
    const closeButtonRef = useRef(null);
    const previouslyFocusedElementRef = useRef(null);
    const [form, setForm] = useState({
        visitorName: "",
        company: "",
        eventWith: "",
        department: "",
        date: "",
        time: "",
        observation: "",
    });
    const [fieldErrors, setFieldErrors] = useState({});
    const [formAlert, setFormAlert] = useState("");

    useEffect(() => {
        previouslyFocusedElementRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;

        document.body.style.overflow = "hidden";
        closeButtonRef.current?.focus();

        function handleDocumentKeyDown(e) {
            if (e.key === "Escape") {
                onClose();
            }
        }

        document.addEventListener("keydown", handleDocumentKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            previouslyFocusedElementRef.current?.focus?.();
            document.removeEventListener("keydown", handleDocumentKeyDown);
        };
    }, [onClose]);

    useEffect(() => {
        if (!event) return;

        const date = new Date(event.eventDateTime);

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        const hour = String(date.getHours()).padStart(2, "0");
        const minute = String(date.getMinutes()).padStart(2, "0");

        setForm({
            visitorName: event.visitorName,
            company: event.company,
            eventWith: event.eventWith,
            department: event.department,
            date: `${year}-${month}-${day}`,
            time: `${hour}:${minute}`,
            observation: event.observation || "",
        });

    }, [event]);

    const [loading, setLoading] = useState(false);
    const todayInput = formatDateForInput(new Date());
    const minTime = form.date === todayInput
        ? formatTimeForInput(new Date())
        : undefined;

    function handleChange(e) {
        const { name, value } = e.target;

        setForm((old) => ({
            ...old,
            [name]: value,
        }));

        setFormAlert("");
        setFieldErrors((old) => {
            const next = { ...old };

            if (name === "date" || name === "time") {
                delete next.dateTime;
            } else {
                delete next[name];
            }

            return next;
        });
    }

    async function handleSubmit(e) {
        e.preventDefault();

        if (loading || submittingRef.current) return;

        const validationErrors = buildAgendaValidationErrors(form);

        if (orderedAgendaValidationMessages(validationErrors).length > 0) {
            setFormAlert("");
            setFieldErrors(validationErrors);

            window.setTimeout(() => {
                const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
                alertRef.current?.scrollIntoView({
                    block: "nearest",
                    behavior: prefersReducedMotion ? "auto" : "smooth",
                });
                alertRef.current?.focus();
            }, 0);
            return;
        }

        const eventDateTime = `${form.date}T${form.time}:00`;

        try {
            submittingRef.current = true;
            setLoading(true);
            setFormAlert("");
            setFieldErrors({});

            const payload = {
                visitorName: form.visitorName,
                company: form.company,
                eventWith: form.eventWith,
                department: form.department,
                eventDateTime,
                observation: form.observation,
            };

            let savedEvent;

            if (event) {
                savedEvent = await updateAgenda(event.id, payload);
                toast.success(AGENDA_MODAL_MESSAGES.editSuccess);
            } else {
                savedEvent = await createAgenda(payload);
                toast.success(AGENDA_MODAL_MESSAGES.createSuccess);
            }

            await onSuccess(savedEvent);
            onClose();

        } catch (err) {
            console.error(err);
            setFormAlert(agendaOperationErrorMessage(err, Boolean(event)));

            window.setTimeout(() => {
                const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
                alertRef.current?.scrollIntoView({
                    block: "nearest",
                    behavior: prefersReducedMotion ? "auto" : "smooth",
                });
                alertRef.current?.focus();
            }, 0);
        } finally {
            submittingRef.current = false;
            setLoading(false);
        }
    }

    function handleModalKeyDown(e) {
        if (e.key !== "Enter" || loading || submittingRef.current) return;
        if (e.target.tagName === "TEXTAREA" && e.shiftKey) return;

        e.preventDefault();
        handleSubmit(e);
    }

    const validationMessages = orderedAgendaValidationMessages(fieldErrors);
    const hasAlert = validationMessages.length > 0 || Boolean(formAlert);
    const dateTimeErrorId = fieldErrors.dateTime ? FIELD_ERROR_IDS.date : undefined;
    const timeErrorId = fieldErrors.dateTime ? FIELD_ERROR_IDS.time : undefined;
    const savingText = event
        ? AGENDA_MODAL_MESSAGES.editLoading
        : AGENDA_MODAL_MESSAGES.createLoading;
    const savingAccessibleText = event
        ? AGENDA_MODAL_MESSAGES.editLoadingAccessible
        : AGENDA_MODAL_MESSAGES.createLoadingAccessible;

    return (
        <div className="agenda-modal-overlay">

            <div
                className="agenda-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="agenda-modal-title"
            >

                <div className="agenda-modal-header">
                    <h2 id="agenda-modal-title">
                        {event ? "Editar Agendamento" : "Novo Agendamento"}
                    </h2>

                    <button
                        type="button"
                        className="agenda-modal-close"
                        onClick={onClose}
                        disabled={loading}
                        aria-label="Fechar modal"
                        ref={closeButtonRef}
                    >
                        <span aria-hidden="true">x</span>
                    </button>
                </div>

                <form className="agenda-modal-form" onSubmit={handleSubmit} onKeyDown={handleModalKeyDown}>

                    <div className="agenda-modal-content" tabIndex={-1}>

                        {hasAlert && (
                            <div
                                className="agenda-modal-alert"
                                ref={alertRef}
                                role="alert"
                                tabIndex={-1}
                            >
                                {validationMessages.length > 0 ? (
                                    <>
                                        <div className="agenda-modal-alert-title">
                                            {AGENDA_MODAL_MESSAGES.alertTitle}
                                        </div>

                                        <ul>
                                            {validationMessages.map((message) => (
                                                <li key={message}>{message}</li>
                                            ))}
                                        </ul>
                                    </>
                                ) : (
                                    formAlert
                                )}
                            </div>
                        )}

                        <label htmlFor="agenda-visitorName">Nome do visitante</label>
                        <input
                            id="agenda-visitorName"
                            name="visitorName"
                            value={form.visitorName}
                            onChange={handleChange}
                            aria-invalid={fieldErrors.visitorName ? "true" : "false"}
                            aria-describedby={fieldErrors.visitorName ? FIELD_ERROR_IDS.visitorName : undefined}
                        />
                        {fieldErrors.visitorName && (
                            <div className="agenda-modal-field-error" id={FIELD_ERROR_IDS.visitorName}>
                                {fieldErrors.visitorName}
                            </div>
                        )}

                        <label htmlFor="agenda-company">Empresa</label>
                        <input
                            id="agenda-company"
                            name="company"
                            value={form.company}
                            onChange={handleChange}
                            aria-invalid={fieldErrors.company ? "true" : "false"}
                            aria-describedby={fieldErrors.company ? FIELD_ERROR_IDS.company : undefined}
                        />
                        {fieldErrors.company && (
                            <div className="agenda-modal-field-error" id={FIELD_ERROR_IDS.company}>
                                {fieldErrors.company}
                            </div>
                        )}

                        <label htmlFor="agenda-eventWith">Com quem será a reunião</label>
                        <input
                            id="agenda-eventWith"
                            name="eventWith"
                            value={form.eventWith}
                            onChange={handleChange}
                            aria-invalid={fieldErrors.eventWith ? "true" : "false"}
                            aria-describedby={fieldErrors.eventWith ? FIELD_ERROR_IDS.eventWith : undefined}
                        />
                        {fieldErrors.eventWith && (
                            <div className="agenda-modal-field-error" id={FIELD_ERROR_IDS.eventWith}>
                                {fieldErrors.eventWith}
                            </div>
                        )}

                        <label htmlFor="agenda-department">Setor</label>
                        <input
                            id="agenda-department"
                            name="department"
                            value={form.department}
                            onChange={handleChange}
                            aria-invalid={fieldErrors.department ? "true" : "false"}
                            aria-describedby={fieldErrors.department ? FIELD_ERROR_IDS.department : undefined}
                        />
                        {fieldErrors.department && (
                            <div className="agenda-modal-field-error" id={FIELD_ERROR_IDS.department}>
                                {fieldErrors.department}
                            </div>
                        )}

                        <div className="agenda-modal-row">

                            <div>

                                <label htmlFor="agenda-date">Data</label>

                                <input
                                    id="agenda-date"
                                    type="date"
                                    name="date"
                                    value={form.date}
                                    min={todayInput}
                                    onChange={handleChange}
                                    aria-invalid={fieldErrors.dateTime ? "true" : "false"}
                                    aria-describedby={dateTimeErrorId}
                                />
                                {fieldErrors.dateTime && (
                                    <div className="agenda-modal-field-error" id={FIELD_ERROR_IDS.date}>
                                        {fieldErrors.dateTime}
                                    </div>
                                )}

                            </div>

                            <div>

                                <label htmlFor="agenda-time">Hora</label>

                                <input
                                    id="agenda-time"
                                    type="time"
                                    name="time"
                                    value={form.time}
                                    min={minTime}
                                    onChange={handleChange}
                                    aria-invalid={fieldErrors.dateTime ? "true" : "false"}
                                    aria-describedby={timeErrorId}
                                />

                            </div>

                        </div>

                        <label htmlFor="agenda-observation">Observações</label>

                        <textarea
                            id="agenda-observation"
                            rows="4"
                            name="observation"
                            value={form.observation}
                            onChange={handleChange}
                        />

                    </div>

                    <div className="agenda-modal-actions">

                        <button
                            type="button"
                            className="agenda-modal-cancel"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Fechar
                        </button>

                        <button
                            type="submit"
                            className="agenda-modal-save"
                            disabled={loading}
                            aria-live="polite"
                        >
                            {loading ? savingText : "Salvar"}
                        </button>

                    </div>

                    <div className="agenda-modal-loading-status" role="status" aria-live="polite">
                        {loading ? savingAccessibleText : ""}
                    </div>

                </form>

            </div>

        </div>
    );
}
