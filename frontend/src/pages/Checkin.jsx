import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import QrModal from "../components/QrModal";
import CameraModal from "../components/CameraModal";
import Header from "../components/Header";
import "../styles/checkin.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function authHeader() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function getUserFromToken() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  const u = parseJwt(token);
  const id = Number(u?.id ?? u?.sub);
  return { ...u, id };
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

function formatPhone(value) {
  if (!value) return "";
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function isOlderThan6Months(dateValue) {
  if (!dateValue) return true;
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return true;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return d < sixMonthsAgo;
}

export default function Checkin() {
  const navigate = useNavigate();

  const BRANCHES = ["Dimebras PR", "Dimebras MT", "Dimebras MS", "Dimebras SC", "Alfamed MS"];

  const user = useMemo(() => getUserFromToken(), []);
  const isAdmin = Number(user?.id) === 1;

  const [showQr, setShowQr] = useState(false);
  const [cpf, setCpf] = useState("");
  const [visitor, setVisitor] = useState(null);

  const [msg, setMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState([]);

  const [branchName, setBranchName] = useState(BRANCHES[0]);
  const [areaToVisit, setAreaToVisit] = useState("Logística");
  const [attendedBy, setAttendedBy] = useState("");
  const [serviceType, setServiceType] = useState("");

  const [openVisitId, setOpenVisitId] = useState(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [updatingFiles, setUpdatingFiles] = useState(false);

  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");

  const [photoDbUrl, setPhotoDbUrl] = useState("");
  const [docFrontDbUrl, setDocFrontDbUrl] = useState("");
  const [docBackDbUrl, setDocBackDbUrl] = useState("");

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  function showToast(text, type = "success") {
    setToast({ text, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  function revokeUrl(url) {
    if (!url) return;
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      revokeUrl(photoPreviewUrl);
      revokeUrl(photoDbUrl);
      revokeUrl(docFrontDbUrl);
      revokeUrl(docBackDbUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) navigate("/login");
  }, [navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cpfFromUrl = params.get("cpf");
    if (cpfFromUrl) setCpf(cpfFromUrl);
  }, []);

  function logout() {
    localStorage.removeItem("token");
    navigate("/login");
  }

  const photoExpired = useMemo(() => {
    if (!visitor) return false;
    return !visitor.photoUpdatedAt || isOlderThan6Months(visitor.photoUpdatedAt);
  }, [visitor]);

  const docExpired = useMemo(() => {
    if (!visitor) return false;

    const frontMissing = !visitor.documentFrontUpdatedAt;
    const backMissing = !visitor.documentBackUpdatedAt;

    const frontExpired = isOlderThan6Months(visitor.documentFrontUpdatedAt);
    const backExpired = isOlderThan6Months(visitor.documentBackUpdatedAt);

    return frontMissing || backMissing || frontExpired || backExpired;
  }, [visitor]);

  const noPendingUpdates = useMemo(() => {
    if (!visitor) return false;
    return !photoExpired && !docExpired;
  }, [visitor, photoExpired, docExpired]);

  async function fetchBlobAsUrl(endpoint) {
    const res = await api.get(endpoint, {
      headers: authHeader(),
      responseType: "blob",
    });
    return URL.createObjectURL(res.data);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      revokeUrl(photoDbUrl);
      revokeUrl(docFrontDbUrl);
      revokeUrl(docBackDbUrl);
      setPhotoDbUrl("");
      setDocFrontDbUrl("");
      setDocBackDbUrl("");

      if (!visitor?.id) return;

      if (visitor.photoUpdatedAt) {
        try {
          const url = await fetchBlobAsUrl(`/visitors/${visitor.id}/photo`);
          if (!cancelled) setPhotoDbUrl(url);
          else revokeUrl(url);
        } catch {
          // sem foto ainda -> ok
        }
      }

      if (visitor.documentFrontUpdatedAt) {
        try {
          const url = await fetchBlobAsUrl(`/visitors/${visitor.id}/doc-front`);
          if (!cancelled) setDocFrontDbUrl(url);
          else revokeUrl(url);
        } catch {}
      }

      if (visitor.documentBackUpdatedAt) {
        try {
          const url = await fetchBlobAsUrl(`/visitors/${visitor.id}/doc-back`);
          if (!cancelled) setDocBackDbUrl(url);
          else revokeUrl(url);
        } catch {}
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visitor?.id,
    visitor?.photoUpdatedAt,
    visitor?.documentFrontUpdatedAt,
    visitor?.documentBackUpdatedAt,
  ]);

  const photoSrc = useMemo(() => {
    if (photoPreviewUrl) return photoPreviewUrl;
    return photoDbUrl || "";
  }, [photoPreviewUrl, photoDbUrl]);

  useEffect(() => {
    if (!photoPreviewUrl) return;
    if (!visitor?.photoUpdatedAt) return;
    revokeUrl(photoPreviewUrl);
    setPhotoPreviewUrl("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitor?.photoUpdatedAt]);

  async function buscarVisitaAberta(cpfDigits) {
    try {
      const { data } = await api.get(`/visits/open-by-cpf/${cpfDigits}`, {
        headers: authHeader(),
      });
      setOpenVisitId(data.id);
      return data;
    } catch {
      setOpenVisitId(null);
      return null;
    }
  }

  async function buscar() {
    setMsg("");
    setFieldErrors([]);
    setVisitor(null);
    setOpenVisitId(null);

    revokeUrl(photoPreviewUrl);
    setPhotoPreviewUrl("");

    try {
      const cpfDigits = onlyDigits(cpf);
      const { data } = await api.get(`/visitors/by-cpf/${cpfDigits}`, {
        headers: authHeader(),
      });
      setVisitor(data);
      await buscarVisitaAberta(cpfDigits);
    } catch (err) {
      if (err?.response?.status === 404) {
        navigate(`/cadastro?cpf=${encodeURIComponent(onlyDigits(cpf))}`);
      } else {
        setMsg(err?.response?.data?.message || "Erro ao buscar");
      }
    }
  }

  async function refreshVisitor() {
    if (!visitor?.cpf) return;
    const { data } = await api.get(`/visitors/by-cpf/${onlyDigits(visitor.cpf)}`, {
      headers: authHeader(),
    });
    setVisitor(data);
  }

  async function atualizarFoto(blob) {
    if (!visitor?.id) return;

    const localUrl = URL.createObjectURL(blob);
    revokeUrl(photoPreviewUrl);
    setPhotoPreviewUrl(localUrl);

    try {
      setUpdatingFiles(true);
      setMsg("");
      setFieldErrors([]);

      const photoFile = new File([blob], `${onlyDigits(visitor.cpf || "visitante")}-foto.jpg`, {
        type: "image/jpeg",
      });

      const fd = new FormData();
      fd.append("photo", photoFile);

      await api.put(`/visitors/${visitor.id}/files`, fd, {
        headers: { ...authHeader(), "Content-Type": "multipart/form-data" },
      });

      setCameraOpen(false);
      setCameraTarget(null);
      await refreshVisitor();
      showToast("Foto atualizada!", "success");
    } catch (err) {
      setMsg(err?.response?.data?.message || "Erro ao atualizar foto");
      revokeUrl(localUrl);
      setPhotoPreviewUrl("");
      showToast("Erro ao atualizar foto", "error");
    } finally {
      setUpdatingFiles(false);
    }
  }

  async function atualizarDocFrente(blob) {
    if (!visitor?.id) return;

    try {
      setUpdatingFiles(true);
      setMsg("");
      setFieldErrors([]);

      const file = new File([blob], `${onlyDigits(visitor.cpf || "visitante")}-doc-frente.jpg`, {
        type: "image/jpeg",
      });

      const fd = new FormData();
      fd.append("documentFront", file);

      await api.put(`/visitors/${visitor.id}/files`, fd, {
        headers: { ...authHeader(), "Content-Type": "multipart/form-data" },
      });

      setCameraOpen(false);
      setCameraTarget(null);
      await refreshVisitor();
      showToast("Documento (frente) atualizado!", "success");
    } catch (err) {
      setMsg(err?.response?.data?.message || "Erro ao atualizar documento (frente)");
      showToast("Erro ao atualizar documento (frente)", "error");
    } finally {
      setUpdatingFiles(false);
    }
  }

  async function atualizarDocVerso(blob) {
    if (!visitor?.id) return;

    try {
      setUpdatingFiles(true);
      setMsg("");
      setFieldErrors([]);

      const file = new File([blob], `${onlyDigits(visitor.cpf || "visitante")}-doc-verso.jpg`, {
        type: "image/jpeg",
      });

      const fd = new FormData();
      fd.append("documentBack", file);

      await api.put(`/visitors/${visitor.id}/files`, fd, {
        headers: { ...authHeader(), "Content-Type": "multipart/form-data" },
      });

      setCameraOpen(false);
      setCameraTarget(null);
      await refreshVisitor();
      showToast("Documento (verso) atualizado!", "success");
    } catch (err) {
      setMsg(err?.response?.data?.message || "Erro ao atualizar documento (verso)");
      showToast("Erro ao atualizar documento (verso)", "error");
    } finally {
      setUpdatingFiles(false);
    }
  }

  function openCamera(target) {
    setMsg("");
    setFieldErrors([]);
    setCameraTarget(target);
    setCameraOpen(true);
  }

  function handleCapture(blob) {
    if (cameraTarget === "photo") return atualizarFoto(blob);
    if (cameraTarget === "docFront") return atualizarDocFrente(blob);
    if (cameraTarget === "docBack") return atualizarDocVerso(blob);
  }

  function reimprimirEtiqueta() {
    if (!openVisitId) return;
    window.open(`${API_URL}/visits/${openVisitId}/label`, "_blank");
  }

  async function gerarEtiqueta() {
    if (!visitor?.id) return;

    setMsg("");
    setFieldErrors([]);

    try {
      const payload = {
        visitorId: visitor.id,
        branchName,
        areaToVisit: areaToVisit ?? "",
        attendedBy: attendedBy ?? "",
        serviceType: serviceType ?? "",
      };

      const { data } = await api.post("/visits/checkin", payload, {
        headers: authHeader(),
      });

      setOpenVisitId(null);
      showToast("Check-in concluído! Etiqueta gerada.", "success");
      window.open(`${API_URL}/visits/${data.id}/label`, "_blank");
    } catch (err) {
      const resp = err?.response?.data;
      const m = resp?.message || "Erro ao gerar etiqueta";

      if (Array.isArray(resp?.issues) && resp.issues.length > 0) {
        setFieldErrors(resp.issues);
        setMsg("");
        showToast("Verifique os campos obrigatórios", "error");
      } else {
        setMsg(m);
      }

      if (String(m).toLowerCase().includes("visita em andamento")) {
        await buscarVisitaAberta(onlyDigits(visitor?.cpf || cpf));
      }
    }
  }

  return (
    <div className="checkin-page">
      {toast && (
        <div className={`checkin-toast ${toast.type === "error" ? "is-error" : "is-success"}`}>
          {toast.text}
        </div>
      )}

      <Header showQr onQrClick={() => setShowQr(true)} onLogout={logout} />

      <main className="checkin-container">
        <section className="card card-search">
          <div className="card-title">Registrar Entrada</div>

          <form
            className="search-row"
            onSubmit={(e) => {
              e.preventDefault();
              buscar();
            }}
          >
            <input
              className="input input-lg"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="Digite o CPF para iniciar..."
              inputMode="numeric"
            />
            <button type="submit" className="btn btn-primary btn-lg">
              BUSCAR
            </button>
          </form>

          {msg && <div className="alert">{msg}</div>}

          {fieldErrors.length > 0 && (
            <div className="alert alert-list">
              <div className="alert-title">Corrija os campos:</div>
              <ul>
                {[...new Set(fieldErrors.map((i) => i?.message).filter(Boolean))].map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {visitor && (
          <section className="grid-2">
            <div className={`card ${noPendingUpdates ? "card-photoLarge" : ""}`}>
              <div className="photo-box">
                {photoSrc ? (
                  <img className="photo-preview" src={photoSrc} alt="Foto" />
                ) : (
                  <div className="photo-placeholder">FOTO OBRIGATÓRIA</div>
                )}
              </div>

              <div className="file-actions">
                <button
                  className={`btn w-full ${photoExpired ? "btn-primary" : "btn-light"}`}
                  onClick={() => openCamera("photo")}
                  disabled={updatingFiles}
                  type="button"
                >
                  {updatingFiles ? "ATUALIZANDO..." : photoExpired ? "ATUALIZAR FOTO" : "TROCAR FOTO"}
                </button>

                {docExpired && (
                  <>
                    <button
                      className="btn btn-primary w-full"
                      onClick={() => openCamera("docFront")}
                      disabled={updatingFiles}
                      type="button"
                    >
                      {updatingFiles ? "ATUALIZANDO..." : "ATUALIZAR DOC (FRENTE)"}
                    </button>

                    <button
                      className="btn btn-primary w-full"
                      onClick={() => openCamera("docBack")}
                      disabled={updatingFiles}
                      type="button"
                    >
                      {updatingFiles ? "ATUALIZANDO..." : "ATUALIZAR DOC (VERSO)"}
                    </button>
                  </>
                )}

                {noPendingUpdates && (docFrontDbUrl || docBackDbUrl) && (
                  <div className="doc-previews">
                    {docFrontDbUrl && (
                      <div className="doc-mini">
                        <div className="doc-miniTitle">DOC (FRENTE)</div>
                        <img src={docFrontDbUrl} alt="Documento frente" />
                      </div>
                    )}
                    {docBackDbUrl && (
                      <div className="doc-mini">
                        <div className="doc-miniTitle">DOC (VERSO)</div>
                        <img src={docBackDbUrl} alt="Documento verso" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="kv">
                <div className="kv-label">CPF</div>
                <div className="kv-value">{formatCPF(visitor.cpf)}</div>
              </div>

              <div className="kv">
                <div className="kv-label">NOME COMPLETO</div>
                <div className="kv-value">{visitor.name}</div>
              </div>

              <div className="kv-row">
                <div className="kv">
                  <div className="kv-label">EMPRESA</div>
                  <div className="kv-value">{visitor.company || "-"}</div>
                </div>
                <div className="kv">
                  <div className="kv-label">TELEFONE</div>
                  <div className="kv-value">{visitor.phone ? formatPhone(visitor.phone) : "-"}</div>
                </div>
              </div>

              <div className="visit-box">
                <div className="visit-title">DETALHES DA VISITA</div>

                <div className="visit-grid">
                  <select className="input" value={branchName} onChange={(e) => setBranchName(e.target.value)}>
                    {BRANCHES.map((b) => (
                      <option key={b} value={b}>
                        Filial: {b}
                      </option>
                    ))}
                  </select>

                  <select className="input" value={areaToVisit} onChange={(e) => setAreaToVisit(e.target.value)}>
                    <option value="Logística">Setor: Logística</option>
                    <option value="Comercial">Setor: Comercial</option>
                    <option value="Financeiro">Setor: Financeiro</option>
                    <option value="Recepção">Setor: Recepção</option>
                    <option value="TI">Setor: TI</option>
                  </select>

                  <input
                    className="input"
                    placeholder="Falar com quem?"
                    value={attendedBy}
                    onChange={(e) => setAttendedBy(e.target.value)}
                  />

                  <input
                    className="input"
                    placeholder="O que veio fazer na empresa?"
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                  />
                </div>

                <div className="visit-actions">
                  <button
                    className="btn btn-link"
                    onClick={() => {
                      setVisitor(null);
                      setOpenVisitId(null);
                      setMsg("");
                      setFieldErrors([]);
                      setAttendedBy("");
                      setServiceType("");
                      setAreaToVisit("Logística");
                      setBranchName(BRANCHES[0]);

                      revokeUrl(photoPreviewUrl);
                      setPhotoPreviewUrl("");
                    }}
                    type="button"
                  >
                    CANCELAR
                  </button>

                  {openVisitId ? (
                    <button className="btn btn-light" onClick={reimprimirEtiqueta} type="button">
                      REIMPRIMIR ETIQUETA
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={gerarEtiqueta} type="button">
                      GERAR ETIQUETA
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {showQr && (
        <QrModal onClose={() => setShowQr(false)} onToast={(text, type) => showToast(text, type)} />
      )}

      {cameraOpen && (
        <CameraModal
          onClose={() => {
            setCameraOpen(false);
            setCameraTarget(null);
          }}
          onCapture={handleCapture}
        />
      )}
    </div>
  );
}