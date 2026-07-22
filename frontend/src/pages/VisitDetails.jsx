import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { openVisitLabel } from "../services/api";
import { getToken } from "../services/session";
import "../styles/visitDetails.css";

const EMPTY_TEXT = "Não informado";

function Icon({ name }) {
  const icons = {
    arrowLeft: "M19 12H5m0 0 6-6m-6 6 6 6",
    tag: "M20 13.5 13.5 20 4 10.5V4h6.5L20 13.5ZM7.5 7.5h.01",
    camera: "M4 8h3l1.5-2h7L17 8h3v11H4V8Zm8 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
    document: "M7 3h7l5 5v13H7V3Zm7 0v5h5M10 13h6M10 17h6",
    user: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
    id: "M4 5h16v14H4V5Zm3 4h4M7 13h5M15 10h2M15 14h2",
    building: "M4 21V5h10v16M14 9h6v12M8 9h2M8 13h2M8 17h2M17 13h1M17 17h1",
    phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.7.6 2.5a2 2 0 0 1-.5 2.1L8 9.5a16 16 0 0 0 6.5 6.5l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.6.5 2.5.6a2 2 0 0 1 1.7 2Z",
    branch: "M3 21h18M5 21V7l8-4v18M13 8h6v13M8 9h1M8 13h1M8 17h1M16 12h1M16 16h1",
    sector: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
    message: "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z",
    clipboard: "M9 4h6l1 2h3v15H5V6h3l1-2Zm0 6h6M9 14h6M9 18h4",
    calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z",
    clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v6l4 2",
    qr: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h2v2h-2v-2Zm4 0h2v6h-4v-2h2v-4Zm-4 4h2v2h-2v-2Z",
  };

  return (
    <svg className="vd-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  );
}

function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

function valueOrFallback(value, fallback = EMPTY_TEXT) {
  const normalized = value === null || value === undefined ? "" : String(value).trim();
  return normalized || fallback;
}

function formatCPF(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (!digits) return EMPTY_TEXT;
  if (digits.length !== 11) return digits;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (!digits) return EMPTY_TEXT;
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return valueOrFallback(value);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, fallback = EMPTY_TEXT) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString("pt-BR") : fallback;
}

function formatTime(value, fallback = EMPTY_TEXT) {
  const date = parseDate(value);
  return date ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : fallback;
}

async function fetchBlobAsUrl(endpoint) {
  const res = await api.get(endpoint, {
    responseType: "blob",
  });
  return URL.createObjectURL(res.data);
}

function revokeUrl(url) {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch (err) {
    void err;
  }
}

function ImageBlock({ url, alt, emptyText, className = "" }) {
  if (!url) {
    return (
      <div className={`vd-imageEmpty ${className}`}>
        {emptyText}
      </div>
    );
  }

  return <img className={`vd-image ${className}`} src={url} alt={alt} />;
}

function InfoItem({ icon, label, value, accent = false }) {
  return (
    <div className={`vd-infoItem ${accent ? "vd-infoItemAccent" : ""}`}>
      <div className="vd-infoIcon">
        <Icon name={icon} />
      </div>
      <div>
        <div className="vd-infoLabel">{label}</div>
        <div className="vd-infoValue">{valueOrFallback(value)}</div>
      </div>
    </div>
  );
}

function DateTimeItem({ label, value, open = false }) {
  return (
    <div className="vd-summaryItem">
      <div className="vd-summaryLabel">{label}</div>
      <div className="vd-dateTime">
        <span>
          <Icon name="calendar" />
          {open ? "Em aberto" : formatDate(value)}
        </span>
        <span>
          <Icon name="clock" />
          {open ? "—" : formatTime(value)}
        </span>
      </div>
    </div>
  );
}

export default function VisitDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [visit, setVisit] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [photoUrl, setPhotoUrl] = useState("");
  const [docFrontUrl, setDocFrontUrl] = useState("");
  const [docBackUrl, setDocBackUrl] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) navigate("/login");
  }, [navigate]);

  useEffect(() => {
    return () => {
      revokeUrl(photoUrl);
      revokeUrl(docFrontUrl);
      revokeUrl(docBackUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setMsg("");
      setLoading(true);

      revokeUrl(photoUrl);
      revokeUrl(docFrontUrl);
      revokeUrl(docBackUrl);
      setPhotoUrl("");
      setDocFrontUrl("");
      setDocBackUrl("");

      try {
        const { data } = await api.get(`/visits/${id}`);
        if (cancelled) return;

        setVisit(data);

        const visitorId = data?.visitor?.id;

        if (visitorId && data?.visitor?.photoUpdatedAt) {
          try {
            const url = await fetchBlobAsUrl(`/visitors/${visitorId}/photo`);
            if (!cancelled) setPhotoUrl(url);
            else revokeUrl(url);
          } catch (err) {
            void err;
          }
        }

        if (visitorId && data?.visitor?.documentFrontUpdatedAt) {
          try {
            const url = await fetchBlobAsUrl(`/visitors/${visitorId}/doc-front`);
            if (!cancelled) setDocFrontUrl(url);
            else revokeUrl(url);
          } catch (err) {
            void err;
          }
        }

        if (visitorId && data?.visitor?.documentBackUpdatedAt) {
          try {
            const url = await fetchBlobAsUrl(`/visitors/${visitorId}/doc-back`);
            if (!cancelled) setDocBackUrl(url);
            else revokeUrl(url);
          } catch (err) {
            void err;
          }
        }
      } catch (err) {
        setMsg(err?.response?.data?.message || "Erro ao carregar detalhes da visita");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const visitor = visit?.visitor;
  const checkoutOpen = !visit?.checkoutAt;

  return (
    <div className="vd-page">
      <header className="vd-topbar">
        <button
          className="vd-brand"
          onClick={() => navigate("/checkin")}
          type="button"
          title="Voltar para Check-in"
        >
          <img src="/logo.png" alt="Dimebras" className="vd-logo" />
        </button>

        <div className="vd-topbarActions">
          <button className="vd-action vd-actionSecondary" type="button" onClick={() => navigate("/history")}>
            <Icon name="arrowLeft" />
            VOLTAR AO HISTÓRICO
          </button>
          {visit?.id && (
            <button className="vd-action vd-actionPrimary" type="button" onClick={() => openVisitLabel(visit.id)}>
              <Icon name="tag" />
              ABRIR ETIQUETA
            </button>
          )}
        </div>
      </header>

      <main className="vd-container">
        {(msg || loading) && (
          <div className="vd-alert" role={msg ? "alert" : "status"}>
            {msg || "Carregando..."}
          </div>
        )}

        {visit && visitor && (
          <>
            <section className="vd-mainGrid" aria-label="Detalhes da visita">
              <aside className="vd-card vd-mediaCard">
                <div className="vd-sectionTitle">
                  <Icon name="camera" />
                  FOTO DO VISITANTE
                </div>
                <ImageBlock
                  url={photoUrl}
                  alt="Foto do visitante"
                  emptyText="Foto não disponível"
                  className="vd-photo"
                />

                <div className="vd-sectionTitle vd-docTitle">
                  <Icon name="document" />
                  DOCUMENTOS
                </div>
                <div className="vd-docGrid">
                  <div className="vd-docCard">
                    <div className="vd-docLabel">FRENTE</div>
                    <ImageBlock
                      url={docFrontUrl}
                      alt="Documento frente"
                      emptyText="Documento não disponível"
                      className="vd-docImage"
                    />
                  </div>
                  <div className="vd-docCard">
                    <div className="vd-docLabel">VERSO</div>
                    <ImageBlock
                      url={docBackUrl}
                      alt="Documento verso"
                      emptyText="Documento não disponível"
                      className="vd-docImage"
                    />
                  </div>
                </div>
              </aside>

              <section className="vd-card vd-detailsCard">
                <div className="vd-section">
                  <h2 className="vd-sectionHeading">INFORMAÇÕES PESSOAIS</h2>
                  <div className="vd-infoGrid">
                    <InfoItem icon="user" label="NOME COMPLETO" value={visitor.name} />
                    <InfoItem icon="id" label="CPF" value={formatCPF(visitor.cpf)} />
                    <InfoItem icon="building" label="EMPRESA" value={visitor.company} />
                    <InfoItem icon="phone" label="TELEFONE" value={formatPhone(visitor.phone)} />
                  </div>
                </div>

                <div className="vd-section vd-sectionDivider">
                  <h2 className="vd-sectionHeading">DETALHES DA VISITA</h2>
                  <div className="vd-infoGrid">
                    <InfoItem icon="branch" label="FILIAL" value={visit.branchName || visit.branch?.name} />
                    <InfoItem icon="sector" label="SETOR" value={visit.areaToVisit} />
                    <InfoItem icon="message" label="FALAR COM QUEM" value={visit.attendedBy} />
                    <InfoItem icon="clipboard" label="MOTIVO DA VISITA" value={visit.serviceType} />
                  </div>
                </div>
              </section>
            </section>

            <section className="vd-card vd-summaryCard" aria-label="Registros da visita">
              <DateTimeItem label="DATA E HORA DE ENTRADA" value={visit.checkinAt} />
              <DateTimeItem label="DATA E HORA DE SAÍDA" value={visit.checkoutAt} open={checkoutOpen} />
              <InfoItem
                icon="user"
                label="REGISTRADO POR (IN)"
                value={visit.checkinByUser?.username}
              />
              <InfoItem
                icon="user"
                label="REGISTRADO POR (OUT)"
                value={checkoutOpen ? "Em aberto" : visit.checkoutByUser?.username}
              />
              <InfoItem icon="qr" label="CÓDIGO QR CODE" value={visit.visitCode} accent />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
