import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { openVisitLabel } from "../services/api";
import QrModal from "../components/QrModal";
import CameraModal from "../components/CameraModal";
import Header from "../components/Header";
import { useToast } from "../components/Feedback/ToastProvider";
import { clearSession, getToken, getUser } from "../services/session";
import "../styles/checkin.css";


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

function fmt(dt) {
  if (!dt) return "-";
  const d = new Date(dt);
  return d.toLocaleString("pt-BR");
}

function uploadErrorMessage(err, fallback) {
  const status = err?.response?.status;
  const code = err?.response?.data?.code;
  if (status === 413 || code === "UPLOAD_FILE_TOO_LARGE") return "Imagem excede o limite permitido.";
  if (status === 415 || code === "UPLOAD_INVALID_TYPE") return "Imagem em formato nao permitido.";
  return err?.response?.data?.message || fallback;
}

export default function Checkin() {
  const navigate = useNavigate();
  const toast = useToast();

  const user = useMemo(() => getUser(), []);
  const isAdmin = user?.role === "ADMIN";

  const [showQr, setShowQr] = useState(false);
  const [cpf, setCpf] = useState("");
  const [visitor, setVisitor] = useState(null);

  const [msg, setMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState([]);

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

  const [visitStats, setVisitStats] = useState(null);
  const [recentVisits, setRecentVisits] = useState([]);
  const [loadingExtras, setLoadingExtras] = useState(false);

  const [companyEdit, setCompanyEdit] = useState("");
  const [phoneEdit, setPhoneEdit] = useState("");
  const [savingVisitor, setSavingVisitor] = useState(false);

  const [openVisits, setOpenVisits] = useState([]);
  const [loadingOpenVisits, setLoadingOpenVisits] = useState(false);
  const [initialLoadingOpenVisits, setInitialLoadingOpenVisits] = useState(true);
  const [refreshingOpenVisits, setRefreshingOpenVisits] = useState(false);

  const cpfInputRef = useRef(null);
  const loadingOpenVisitsRef = useRef(false);
  const pendingOpenVisitsRef = useRef(null);
  const openVisitsIntervalRef = useRef(null);
  const updatingFilesRef = useRef(false);

  const showToast = useCallback((text, type = "success") => {
    toast[type]?.(text) ?? toast.show(text, type);
  }, [toast]);

  function revokeUrl(url) {
    if (!url) return;
    try {
      URL.revokeObjectURL(url);
    } catch {
      // URL may already have been released by the browser.
    }
  }

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
      setOpenVisits(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      if (!silent) setOpenVisits([]);
      showToast(err?.response?.data?.message || "Erro ao carregar check-ins em aberto", "error");
    } finally {
      if (silent) {
        setRefreshingOpenVisits(false);
      } else {
        setLoadingOpenVisits(false);
        setInitialLoadingOpenVisits(false);
      }
      loadingOpenVisitsRef.current = false;

      const pendingOptions = pendingOpenVisitsRef.current;
      pendingOpenVisitsRef.current = null;
      if (pendingOptions) loadOpenVisits(pendingOptions);
    }
  }, [showToast]);

  async function loadExtrasByCpf(cpfDigits) {
    if (!cpfDigits) return;
    try {
      setLoadingExtras(true);
      const [s, r] = await Promise.all([
        api.get(`/visits/stats-by-cpf/${cpfDigits}`),
        api.get(`/visits/recent-by-cpf/${cpfDigits}?limit=5`),
      ]);

      setVisitStats(s.data);
      setRecentVisits(Array.isArray(r.data?.items) ? r.data.items : []);
    } catch {
      setVisitStats(null);
      setRecentVisits([]);
    } finally {
      setLoadingExtras(false);
    }
  }

  useEffect(() => {
    return () => {
      revokeUrl(photoPreviewUrl);
      revokeUrl(photoDbUrl);
      revokeUrl(docFrontDbUrl);
      revokeUrl(docBackDbUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadOpenVisits({ silent: false });

    const POLL_MS = 5000;

    function stopInterval() {
      if (!openVisitsIntervalRef.current) return;
      clearInterval(openVisitsIntervalRef.current);
      openVisitsIntervalRef.current = null;
    }

    function startInterval() {
      if (openVisitsIntervalRef.current || document.hidden) return;
      openVisitsIntervalRef.current = setInterval(() => {
        if (!document.hidden) loadOpenVisits({ silent: true });
      }, POLL_MS);
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
      stopInterval();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadOpenVisits]);

  useEffect(() => {
    const token = getToken();
    if (!token) navigate("/login");
  }, [navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cpfFromUrl = params.get("cpf");
    if (cpfFromUrl) {
      const digits = onlyDigits(cpfFromUrl);
      setCpf(digits);
      buscarComCpf(digits);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    clearSession();
    navigate("/login");
  }

  function resetTela() {
    window.history.replaceState({}, "", "/checkin");

    setCpf("");
    setVisitor(null);
    setOpenVisitId(null);

    setMsg("");
    setFieldErrors([]);

    setAttendedBy("");
    setServiceType("");
    setAreaToVisit("Logística");

    setVisitStats(null);
    setRecentVisits([]);

    revokeUrl(photoPreviewUrl);
    setPhotoPreviewUrl("");

    setTimeout(() => cpfInputRef.current?.focus(), 0);
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
          // Visitor may not have a photo stored yet.
        }
      }

      if (visitor.documentFrontUpdatedAt) {
        try {
          const url = await fetchBlobAsUrl(`/visitors/${visitor.id}/doc-front`);
          if (!cancelled) setDocFrontDbUrl(url);
          else revokeUrl(url);
        } catch {
          // Visitor may not have a front document stored yet.
        }
      }

      if (visitor.documentBackUpdatedAt) {
        try {
          const url = await fetchBlobAsUrl(`/visitors/${visitor.id}/doc-back`);
          if (!cancelled) setDocBackDbUrl(url);
          else revokeUrl(url);
        } catch {
          // Visitor may not have a back document stored yet.
        }
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
      const { data } = await api.get(`/visits/open-by-cpf/${cpfDigits}`);
      setOpenVisitId(data.id);
      return data;
    } catch {
      setOpenVisitId(null);
      return null;
    }
  }

  async function buscarComCpf(cpfDigits) {
    setMsg("");
    setFieldErrors([]);
    setVisitor(null);
    setOpenVisitId(null);

    setVisitStats(null);
    setRecentVisits([]);

    revokeUrl(photoPreviewUrl);
    setPhotoPreviewUrl("");

    try {
      const { data } = await api.get(`/visitors/by-cpf/${cpfDigits}`);

      setVisitor(data);

      setCompanyEdit(data.company || "");
      setPhoneEdit(data.phone || "");

      await buscarVisitaAberta(cpfDigits);
      await loadExtrasByCpf(cpfDigits);
    } catch (err) {
      if (err?.response?.status === 404) {
        navigate(`/cadastro?cpf=${encodeURIComponent(cpfDigits)}`);
      } else {
        setMsg(err?.response?.data?.message || "Erro ao buscar");
      }
    }
  }

  async function buscar() {
    const cpfDigits = onlyDigits(cpf);
    await buscarComCpf(cpfDigits);
  }

  async function refreshVisitor() {
    if (!visitor?.cpf) return;
    const { data } = await api.get(`/visitors/by-cpf/${onlyDigits(visitor.cpf)}`);
    setVisitor(data);

    setCompanyEdit(data.company || "");
    setPhoneEdit(data.phone || "");
  }

  async function atualizarFoto(blob) {
    if (!visitor?.id) return;
    if (updatingFilesRef.current) return;

    const localUrl = URL.createObjectURL(blob);
    revokeUrl(photoPreviewUrl);
    setPhotoPreviewUrl(localUrl);

    try {
      updatingFilesRef.current = true;
      setUpdatingFiles(true);
      setMsg("");
      setFieldErrors([]);

      const photoFile = new File([blob], `${onlyDigits(visitor.cpf || "visitante")}-foto.jpg`, {
        type: "image/jpeg",
      });

      const fd = new FormData();
      fd.set("photo", photoFile);

      await api.put(`/visitors/${visitor.id}/files`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setCameraOpen(false);
      setCameraTarget(null);
      await refreshVisitor();
      showToast("Foto atualizada!", "success");
    } catch (err) {
      setMsg(uploadErrorMessage(err, "Erro ao atualizar foto"));
      revokeUrl(localUrl);
      setPhotoPreviewUrl("");
      showToast("Erro ao atualizar foto", "error");
    } finally {
      updatingFilesRef.current = false;
      setUpdatingFiles(false);
    }
  }

  async function atualizarDocFrente(blob) {
    if (!visitor?.id) return;
    if (updatingFilesRef.current) return;

    try {
      updatingFilesRef.current = true;
      setUpdatingFiles(true);
      setMsg("");
      setFieldErrors([]);

      const file = new File([blob], `${onlyDigits(visitor.cpf || "visitante")}-doc-frente.jpg`, {
        type: "image/jpeg",
      });

      const fd = new FormData();
      fd.set("documentFront", file);

      await api.put(`/visitors/${visitor.id}/files`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setCameraOpen(false);
      setCameraTarget(null);
      await refreshVisitor();
      showToast("Documento (frente) atualizado!", "success");
    } catch (err) {
      setMsg(uploadErrorMessage(err, "Erro ao atualizar documento (frente)"));
      showToast("Erro ao atualizar documento (frente)", "error");
    } finally {
      updatingFilesRef.current = false;
      setUpdatingFiles(false);
    }
  }

  async function atualizarDocVerso(blob) {
    if (!visitor?.id) return;
    if (updatingFilesRef.current) return;

    try {
      updatingFilesRef.current = true;
      setUpdatingFiles(true);
      setMsg("");
      setFieldErrors([]);

      const file = new File([blob], `${onlyDigits(visitor.cpf || "visitante")}-doc-verso.jpg`, {
        type: "image/jpeg",
      });

      const fd = new FormData();
      fd.set("documentBack", file);

      await api.put(`/visitors/${visitor.id}/files`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setCameraOpen(false);
      setCameraTarget(null);
      await refreshVisitor();
      showToast("Documento (verso) atualizado!", "success");
    } catch (err) {
      setMsg(uploadErrorMessage(err, "Erro ao atualizar documento (verso)"));
      showToast("Erro ao atualizar documento (verso)", "error");
    } finally {
      updatingFilesRef.current = false;
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
    openVisitLabel(openVisitId);
  }

  async function salvarDadosVisitante() {
    if (!visitor?.id) return;

    try {
      setSavingVisitor(true);
      setMsg("");
      setFieldErrors([]);

      await api.put(`/visitors/${visitor.id}`, {
        company: companyEdit?.trim() || "",
        phone: onlyDigits(phoneEdit),
      });

      showToast("Dados atualizados!", "success");
      await refreshVisitor();
    } catch (err) {
      showToast(err?.response?.data?.message || "Erro ao salvar", "error");
    } finally {
      setSavingVisitor(false);
    }
  }

  async function gerarEtiqueta() {
    if (!visitor?.id) return;

    setMsg("");
    setFieldErrors([]);

    try {
      const payload = {
        visitorId: visitor.id,
        areaToVisit: areaToVisit ?? "",
        attendedBy: attendedBy ?? "",
        serviceType: serviceType ?? "",
      };

      const { data } = await api.post("/visits/checkin", payload);

      setOpenVisitId(null);
      showToast("Check-in concluído! Etiqueta gerada.", "success");
      openVisitLabel(data.id);
      await loadOpenVisits({ silent: true });
      resetTela();
    } catch (err) {
      const resp = err?.response?.data;
      const m = resp?.message || "Erro ao gerar etiqueta";

      const details = resp?.details || resp?.issues;

      if (Array.isArray(details) && details.length > 0) {
        setFieldErrors(details.map((item) => ({ path: item.path || item.field, message: item.message })));
        setMsg("");
        showToast("Verifique os campos obrigatórios", "error");
      } else {
        setMsg(m);
      }

      if (
        resp?.code === "VISITOR_OPEN_VISIT_CONFLICT" ||
        String(m).toLowerCase().includes("visita em andamento")
      ) {
        await buscarVisitaAberta(onlyDigits(visitor?.cpf || cpf));
      }
    }
  }

  return (
    <div className="checkin-page">
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
              ref={cpfInputRef}
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

        <section className="card card-search openvisits-card">
          <div className="card-title openvisits-header">
            <span>
              {isAdmin ? "Check-ins em aberto - Todas as filiais" : "Check-ins em aberto (minha filial)"}
            </span>

            <button
              className="btn btn-light"
              type="button"
              onClick={() => loadOpenVisits({ silent: true })}
              disabled={loadingOpenVisits || refreshingOpenVisits}
            >
              {loadingOpenVisits ? "CARREGANDO..." : refreshingOpenVisits ? "ATUALIZANDO..." : "ATUALIZAR"}
            </button>
          </div>

          {refreshingOpenVisits && openVisits.length > 0 && (
            <div className="openvisits-refreshing">Atualizando...</div>
          )}

          {initialLoadingOpenVisits && openVisits.length === 0 ? (
            <div className="openvisits-empty">Carregando...</div>
          ) : openVisits.length === 0 ? (
            <div className="openvisits-empty">{isAdmin ? "Nenhum check-in em aberto em todas as filiais." : "Nenhum check-in em aberto nesta filial."}</div>
          ) : (
            <div className="openvisits-tableWrapper">
              <table className="openvisits-table">
                <thead>
                  <tr>
                    <th>Entrada</th>
                    <th>Visitante</th>
                    <th>CPF</th>
                    <th>Empresa</th>
                    {isAdmin && <th>Unidade</th>}
                    <th>Setor</th>
                    <th>Falar com</th>
                    <th className="actions-col">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {openVisits.map((v) => (
                    <tr key={v.id}>
                      <td>{fmt(v.checkinAt)}</td>
                      <td>{v.visitor?.name || "-"}</td>
                      <td>{v.visitor?.cpf || "-"}</td>
                      <td>{v.visitor?.company || "-"}</td>
                      {isAdmin && <td>{v.branchName || "-"}</td>}
                      <td>{v.areaToVisit || "-"}</td>
                      <td>{v.attendedBy || "-"}</td>
                      <td className="actions-col">
                        <button
                          className="btn btn-light btn-small"
                          type="button"
                          onClick={() => openVisitLabel(v.id)}
                        >
                          ETIQUETA
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                  <div className="kv-value">
                    <input
                      className="input"
                      value={companyEdit}
                      onChange={(e) => setCompanyEdit(e.target.value)}
                      placeholder="Empresa..."
                    />
                  </div>
                </div>

                <div className="kv">
                  <div className="kv-label">TELEFONE</div>
                  <div className="kv-value">
                    <input
                      className="input"
                      value={formatPhone(phoneEdit)}
                      onChange={(e) => setPhoneEdit(onlyDigits(e.target.value))}
                      placeholder="Telefone..."
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>

              <div className="visitor-save-actions">
                <button
                  className="btn btn-light"
                  type="button"
                  onClick={salvarDadosVisitante}
                  disabled={savingVisitor}
                >
                  {savingVisitor ? "SALVANDO..." : "SALVAR DADOS"}
                </button>
              </div>

              <div className="visit-box">
                <div className="visit-title">DETALHES DA VISITA</div>

                <div className="visit-grid">
                  <input
                    className="input"
                    value={`Filial: ${user?.role === "ADMIN" ? "TODAS" : user?.branch?.name || "-"}`}
                    readOnly
                  />

                  <select className="input" value={areaToVisit} onChange={(e) => setAreaToVisit(e.target.value)}>
                    <option value="Logística">Setor: Logística</option>
                    <option value="Comercial">Setor: Comercial</option>
                    <option value="Financeiro">Setor: Financeiro</option>
                    <option value="Recepção">Setor: Recepção</option>
                    <option value="Diretoria">Setor: Diretoria</option>
                    <option value="Compras">Setor: Compras</option>
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
                    placeholder="Motivo da visita?"
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

                      setVisitStats(null);
                      setRecentVisits([]);

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

              <div className="extras">
                <div className="extras-top">
                  <div className="extras-card">
                    <div className="extras-title">VISITAS</div>

                    {loadingExtras ? (
                      <div className="cpf-status">Carregando...</div>
                    ) : (
                      <div className="cpf-statTitle">
                        <div className="cpf-statSingle">
                          <div className="cpf-statLabel">Total</div>
                          <div className="cpf-statValue">{visitStats?.total ?? 0}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="extras-card">
                  <div className="extras-title">ÚLTIMAS VISITAS</div>

                  {loadingExtras ? (
                    <div className="extras-muted">Carregando...</div>
                  ) : recentVisits.length === 0 ? (
                    <div className="extras-muted">Nenhuma visita anterior.</div>
                  ) : (
                    <div className="mini-list">
                      {recentVisits.map((v) => (
                        <div key={v.id} className="mini-row">
                          <div className="mini-left">
                            <div className="mini-main">{fmt(v.checkinAt)}</div>
                            <div className="mini-sub">
                              {(v.branchName || "-") + " • " + (v.checkoutAt ? "Finalizada" : "Aberta")}
                            </div>
                          </div>
                          <div className="mini-right">
                            <div className="mini-code">{v.visitCode}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {showQr && (
        <QrModal
          onClose={() => setShowQr(false)}
          onToast={(text, type) => showToast(text, type)}
          onCheckoutDone={() => loadOpenVisits({ silent: true })}
        />
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
