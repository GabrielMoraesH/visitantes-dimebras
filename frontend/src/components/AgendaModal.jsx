import { useEffect, useRef, useState } from "react";
import "../styles/agendaModal.css";
import {
    createAgenda,
    updateAgenda,
} from "../services/agendaService";
import { useToast } from "./Feedback/ToastProvider";

const PAST_AGENDA_MESSAGE =
    "N\u00e3o \u00e9 permitido agendar uma visita para uma data ou hor\u00e1rio anterior ao momento atual.";

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
    const [form, setForm] = useState({
        visitorName: "",
        company: "",
        eventWith: "",
        department: "",
        date: "",
        time: "",
        observation: "",
    });

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
    }

    async function handleSubmit(e) {
        e.preventDefault();

        if (loading || submittingRef.current) return;

        if (
            !form.visitorName ||
            !form.company ||
            !form.eventWith ||
            !form.department ||
            !form.date ||
            !form.time
        ) {
            toast.warning("Preencha todos os campos obrigatórios.");
            return;
        }

        const eventDateTime = `${form.date}T${form.time}:00`;
        const selectedDateTime = new Date(eventDateTime);

        if (selectedDateTime < new Date()) {
            toast.error(PAST_AGENDA_MESSAGE);
            return;
        }

        try {
            submittingRef.current = true;
            setLoading(true);

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
                toast.success("Agendamento atualizado com sucesso.");
            } else {
                savedEvent = await createAgenda(payload);
                toast.success("Agendamento criado com sucesso.");
            }

            await onSuccess(savedEvent);

            // Fecha o modal
            onClose();

        } catch (err) {
            console.error(err);
            toast.error(err?.response?.data?.message || "Erro ao salvar agendamento.");
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

    return (
        <div className="agenda-modal-overlay">

            <div className="agenda-modal">

                <h2>
                    {event ? "Editar Agendamento" : "Novo Agendamento"}
                </h2>

                <form onSubmit={handleSubmit} onKeyDown={handleModalKeyDown}>

                    <label>Nome do visitante</label>
                    <input
                        name="visitorName"
                        value={form.visitorName}
                        onChange={handleChange}
                    />

                    <label>Empresa</label>
                    <input
                        name="company"
                        value={form.company}
                        onChange={handleChange}
                    />

                    <label>Com quem será a reunião</label>
                    <input
                        name="eventWith"
                        value={form.eventWith}
                        onChange={handleChange}
                    />

                    <label>Setor</label>
                    <input
                        name="department"
                        value={form.department}
                        onChange={handleChange}
                    />

                    <div className="agenda-modal-row">

                        <div>

                            <label>Data</label>

                            <input
                                type="date"
                                name="date"
                                value={form.date}
                                min={todayInput}
                                onChange={handleChange}
                            />

                        </div>

                        <div>

                            <label>Hora</label>

                            <input
                                type="time"
                                name="time"
                                value={form.time}
                                min={minTime}
                                onChange={handleChange}
                            />

                        </div>

                    </div>

                    <label>Observações</label>

                    <textarea
                        rows="4"
                        name="observation"
                        value={form.observation}
                        onChange={handleChange}
                    />

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
                        >
                            {loading ? "Salvando..." : "Salvar"}
                        </button>

                    </div>

                </form>

            </div>

        </div>
    );
}
