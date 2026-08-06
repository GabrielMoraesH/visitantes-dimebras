import { useState } from "react";
import "../styles/agendaCard.css";
import { cancelAgenda } from "../services/agendaService";
import { useConfirm } from "./Feedback/ConfirmProvider";
import { useToast } from "./Feedback/ToastProvider";

const AGENDA_CARD_MESSAGES = {
  cancelConfirmMessage: "Tem certeza de que deseja cancelar este agendamento?",
  cancelConfirmTitle: "Cancelar agendamento",
  cancelError: "Não foi possível cancelar o agendamento. Tente novamente em alguns instantes.",
  cancelLoading: "Cancelando...",
  cancelLoadingAccessible: "Cancelando agendamento, aguarde...",
  cancelSuccess: "Agendamento cancelado com sucesso.",
};

export default function AgendaCard({
  event,
  isNext,
  onEdit,
  onCancel,
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [canceling, setCanceling] = useState(false);
  const eventTime = new Date(event.eventDateTime).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const isCanceled = event.status === "CANCELADO";

  function handleEdit() {
    if (isCanceled) return;

    onEdit(event);
  }

  async function handleCancel() {
    if (isCanceled || canceling) return;

    const confirmCancel = await confirm({
      title: AGENDA_CARD_MESSAGES.cancelConfirmTitle,
      message: AGENDA_CARD_MESSAGES.cancelConfirmMessage,
      confirmText: "Cancelar agendamento",
      cancelText: "Voltar",
      type: "danger",
    });

    if (!confirmCancel) return;

    try {
      setCanceling(true);
      await cancelAgenda(event.id);

      await onCancel();
      toast.success(AGENDA_CARD_MESSAGES.cancelSuccess);

    } catch (err) {
      console.error(err);
      toast.error(AGENDA_CARD_MESSAGES.cancelError);
    } finally {
      setCanceling(false);
    }
  }

  function getStatus(status) {
    switch (status) {
      case "AGENDADO":
        return {
          label: "Agendado",
          className: "status-agendado",
        };

      case "CANCELADO":
        return {
          label: "Cancelado",
          className: "status-cancelado",
        };

      case "FINALIZADO":
        return {
          label: "Finalizado",
          className: "status-finalizado",
        };

      default:
        return {
          label: status,
          className: "",
        };
    }
  }

  const status = getStatus(event.status);

  return (
    <div className={`agenda-card ${isNext ? "next-event" : ""}`}>
      <div className="agenda-card-header">

        {isNext && (
          <div className="next-badge">
            PRÓXIMO VISITANTE
          </div>
        )}

        <span className="agenda-time">
          {eventTime}
        </span>

        <span className={`agenda-status ${status.className}`}>
          {status.label}
        </span>

      </div>

      <div className="agenda-card-body">
        <h3>{event.visitorName}</h3>

        <p>
          <strong>Empresa:</strong> {event.company}
        </p>

        <p>
          <strong>Com quem:</strong> {event.eventWith}
        </p>

        <p>
          <strong>Setor:</strong> {event.department}
        </p>

        {event.notes && (
          <p>
            <strong>Observações:</strong> {event.notes}
          </p>
        )}
      </div>

      {!isCanceled && (
        <div className="agenda-card-footer">
          <button
            className="edit-button"
            onClick={handleEdit}
          >
            Editar
          </button>

          <button
            className="agenda-cancel-button"
            onClick={handleCancel}
            disabled={canceling}
            aria-live="polite"
          >
            {canceling ? AGENDA_CARD_MESSAGES.cancelLoading : "Cancelar"}
          </button>
          <span className="agenda-card-loading-status" role="status" aria-live="polite">
            {canceling ? AGENDA_CARD_MESSAGES.cancelLoadingAccessible : ""}
          </span>
        </div>
      )}
    </div>
  );
}
