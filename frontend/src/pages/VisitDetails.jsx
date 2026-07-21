import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { openVisitLabel } from "../services/api";
import Header from "../components/Header";
import { clearSession, getToken } from "../services/session";
import "../styles/checkin.css"; // pode reutilizar estilos, ou criar outro depois

function authHeader() {
  const token = getToken();
  return { Authorization: `Bearer ${token}` };
}

function fmt(dt) {
  if (!dt) return "-";
  const d = new Date(dt);
  return d.toLocaleString("pt-BR");
}

function onlyDigits(v = "") {
  return String(v).replace(/\D/g, "");
}

function formatCPF(value) {
  if (!value) return "";
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

async function fetchBlobAsUrl(endpoint) {
  const res = await api.get(endpoint, {
    headers: authHeader(),
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
        const { data } = await api.get(`/visits/${id}`, { headers: authHeader() });
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
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const visitor = visit?.visitor;

  function logout() {
    clearSession();
    navigate("/login");
  }

  return (
    <div className="checkin-page">
      <Header onLogout={logout} />

      <main className="checkin-container">
        <section className="card card-search">
          <div className="card-title">Detalhes da Visita</div>

          <div className="visit-details-actions">
            <button className="btn btn-light" type="button" onClick={() => navigate("/history")}>
              VOLTAR AO HISTÓRICO
            </button>
            {visit?.id && (
              <button
                className="btn btn-light"
                type="button"
                onClick={() => openVisitLabel(visit.id)}
              >
                ABRIR ETIQUETA
              </button>
            )}
          </div>

          {msg && <div className="alert visit-details-alert">{msg}</div>}
          {loading && <div className="alert visit-details-alert">Carregando...</div>}
        </section>

        {visit && visitor && (
          <section className="grid-2">
            <div className="card">
              <div className="photo-box">
                {photoUrl ? (
                  <img className="photo-preview" src={photoUrl} alt="Foto do visitante" />
                ) : (
                  <div className="photo-placeholder">SEM FOTO</div>
                )}
              </div>

              {(docFrontUrl || docBackUrl) && (
                <div className="doc-previews">
                  {docFrontUrl && (
                    <div className="doc-mini">
                      <div className="doc-miniTitle">DOC (FRENTE)</div>
                      <img src={docFrontUrl} alt="Documento frente" />
                    </div>
                  )}
                  {docBackUrl && (
                    <div className="doc-mini">
                      <div className="doc-miniTitle">DOC (VERSO)</div>
                      <img src={docBackUrl} alt="Documento verso" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="card">
              <div className="kv">
                <div className="kv-label">CPF</div>
                <div className="kv-value">{formatCPF(visitor.cpf)}</div>
              </div>

              <div className="kv">
                <div className="kv-label">NOME</div>
                <div className="kv-value">{visitor.name}</div>
              </div>

              <div className="kv-row">
                <div className="kv">
                  <div className="kv-label">EMPRESA</div>
                  <div className="kv-value">
                    <input className="input" value={visitor.company || "-"} disabled />
                  </div>
                </div>

                <div className="kv">
                  <div className="kv-label">TELEFONE</div>
                  <div className="kv-value">
                    <input className="input" value={visitor.phone || "-"} disabled />
                  </div>
                </div>
              </div>

              <div className="visit-box">
                <div className="visit-title">DETALHES DA VISITA</div>

                <div className="visit-grid">
                  <input className="input" value={`Filial: ${visit.branchName || visit.branch?.name || "-"}`} disabled />
                  <input className="input" value={`Setor: ${visit.areaToVisit || "-"}`} disabled />
                  <input className="input" value={visit.attendedBy || "-"} disabled />
                  <input className="input" value={visit.serviceType || "-"} disabled />
                </div>
              </div>

              <div className="extras">
                <div className="extras-card">
                  <div className="extras-title">REGISTROS</div>
                  <div className="visit-record-grid">
                    <div><b>Check-in:</b> {fmt(visit.checkinAt)}</div>
                    <div><b>Check-out:</b> {visit.checkoutAt ? fmt(visit.checkoutAt) : "Aberta"}</div>
                    <div><b>Registrado por (In):</b> {visit.checkinByUser?.username || "-"}</div>
                    <div><b>Registrado por (Out):</b> {visit.checkoutByUser?.username || "-"}</div>
                    <div><b>Código:</b> {visit.visitCode || "-"}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
