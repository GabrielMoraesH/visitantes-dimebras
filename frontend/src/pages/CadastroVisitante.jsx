import { useSearchParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState, useRef } from "react";
import api from "../services/api";
import CameraModal from "../components/CameraModal";
import { getToken } from "../services/session";
import "../styles/cadastro.css";


function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

function formatCPF(value = "") {
  const v = onlyDigits(value).slice(0, 11);
  if (v.length <= 3) return v;
  if (v.length <= 6) return v.replace(/(\d{3})(\d+)/, "$1.$2");
  if (v.length <= 9) return v.replace(/(\d{3})(\d{3})(\d+)/, "$1.$2.$3");
  return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatPhone(value = "") {
  const v = onlyDigits(value).slice(0, 11);
  if (v.length <= 2) return v;
  if (v.length <= 6) return v.replace(/(\d{2})(\d+)/, "($1) $2");
  if (v.length <= 10) return v.replace(/(\d{2})(\d{4})(\d+)/, "($1) $2-$3");
  return v.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
}

function isValidCPF(cpfDigits = "") {
  const cpf = onlyDigits(cpfDigits);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcDV = (base) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += Number(base[i]) * (base.length + 1 - i);
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const dv1 = calcDV(cpf.slice(0, 9));
  const dv2 = calcDV(cpf.slice(0, 9) + dv1);

  return cpf === cpf.slice(0, 9) + String(dv1) + String(dv2);
}

function isValidPhone(phoneDigits = "") {
  const p = onlyDigits(phoneDigits);
  return p.length === 10 || p.length === 11;
}

function makeJpgFile(blob, filenameBase) {
  return new File([blob], `${filenameBase}.jpg`, { type: "image/jpeg" });
}

function uploadErrorMessage(err) {
  const status = err?.response?.status;
  const code = err?.response?.data?.code;
  if (status === 413 || code === "UPLOAD_FILE_TOO_LARGE") return "Imagem excede o limite permitido.";
  if (status === 415 || code === "UPLOAD_INVALID_TYPE") return "Imagem em formato nao permitido.";
  const message = err?.response?.data?.message || "Erro ao salvar visitante";
  if (err?.cleanupFailed) {
    return `${message}. O cadastro pode ter ficado incompleto; busque o CPF novamente para continuar.`;
  }
  return message;
}

export default function CadastroVisitante() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const cpfParam = useMemo(() => onlyDigits(searchParams.get("cpf") || ""), [searchParams]);
  const [cpfDigits, setCpfDigits] = useState(cpfParam);

  useEffect(() => {
    setCpfDigits(cpfParam);
  }, [cpfParam]);

  const cpfDisplay = useMemo(() => formatCPF(cpfDigits), [cpfDigits]);

  const [name, setName] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [company, setCompany] = useState("");

  const [photo, setPhoto] = useState(null);
  const [docFront, setDocFront] = useState(null);
  const [docBack, setDocBack] = useState(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const cpfInputRef = useRef(null);

  const [cpfLookup, setCpfLookup] = useState({ status: "idle", message: "" });
  const lookupTimerRef = useRef(null);
  const lastLookupCpfRef = useRef("");
  const submittingRef = useRef(false);

  const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
  const docFrontPreview = useMemo(() => (docFront ? URL.createObjectURL(docFront) : ""), [docFront]);
  const docBackPreview = useMemo(() => (docBack ? URL.createObjectURL(docBack) : ""), [docBack]);

  useEffect(() => {
    return () => {
      for (const url of [photoPreview, docFrontPreview, docBackPreview]) {
        if (!url) continue;
        try {
          URL.revokeObjectURL(url);
        } catch (err) {
          void err;
        }
      }
    };
  }, [photoPreview, docFrontPreview, docBackPreview]);

  useEffect(() => {
    const token = getToken();
    if (!token) navigate("/login");
  }, [navigate]);

  const cpfOk = isValidCPF(cpfDigits);
  const phoneOk = isValidPhone(phoneDisplay);
  const nameOk = name.trim().length >= 3;
  const companyOk = company.trim().length >= 2;
  const photoOk = !!photo;
  const docFrontOk = !!docFront;
  const docBackOk = !!docBack;

  const formOk =
    cpfOk && phoneOk && nameOk && companyOk && photoOk && docFrontOk && docBackOk && !saving;

  function getFirstError() {
    if (!cpfOk) return "CPF inválido.";
    if (!nameOk) return "Nome completo é obrigatório.";
    if (!phoneOk) return "Telefone inválido (mínimo 10 dígitos).";
    if (!companyOk) return "Empresa é obrigatória.";
    if (!photoOk) return "Foto do visitante é obrigatória.";
    if (!docFrontOk) return "Documento (frente) é obrigatório.";
    if (!docBackOk) return "Documento (verso) é obrigatório.";
    return "";
  }

  function openCamera(target) {
    setMsg("");
    setCameraTarget(target);
    setCameraOpen(true);
  }

  function handleCaptureBlob(blob) {
    const base = cpfDigits || "visitante";

    if (cameraTarget === "photo") {
      setPhoto(makeJpgFile(blob, `${base}-foto`));
    } else if (cameraTarget === "docFront") {
      setDocFront(makeJpgFile(blob, `${base}-doc-frente`));
    } else if (cameraTarget === "docBack") {
      setDocBack(makeJpgFile(blob, `${base}-doc-verso`));
    }

    setCameraOpen(false);
    setCameraTarget(null);
  }

  function buildVisitorFilesFormData() {
    const fd = new FormData();
    fd.set("photo", photo);
    fd.set("documentFront", docFront);
    fd.set("documentBack", docBack);
    return fd;
  }

  async function uploadVisitorFiles(visitorId) {
    return api.put(`/visitors/${visitorId}/files`, buildVisitorFilesFormData(), {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }

  async function cleanupIncompleteVisitor(visitorId) {
    try {
      await api.delete(`/visitors/${visitorId}/incomplete-created`);
      return true;
    } catch {
      console.warn("Falha ao executar compensacao de visitante incompleto.");
      return false;
    }
  }

  function onChangeCpfInput(value) {
    setMsg("");
    const digits = onlyDigits(value).slice(0, 11);
    setCpfDigits(digits);

    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (digits) p.set("cpf", digits);
        else p.delete("cpf");
        return p;
      },
      { replace: true }
    );
  }

  async function lookupCpfAndGo(checkCpfDigits) {
    const digits = onlyDigits(checkCpfDigits).slice(0, 11);
    if (!isValidCPF(digits)) return false;

    if (lastLookupCpfRef.current === digits) return false;
    lastLookupCpfRef.current = digits;

    setCpfLookup({ status: "checking", message: "Verificando CPF..." });

    try {
      await api.get(`/visitors/by-cpf/${digits}`);

      setCpfLookup({ status: "exists", message: "CPF já cadastrado. Indo para o check-in..." });

      setTimeout(() => navigate(`/checkin?cpf=${digits}`), 250);
      return true;
    } catch (err) {
      const status = err?.response?.status;

      if (status === 404) {
        setCpfLookup({ status: "notfound", message: "" });
        return false;
      }

      setCpfLookup({
        status: "error",
        message: err?.response?.data?.message || "Erro ao verificar CPF",
      });
      return false;
    }
  }

  useEffect(() => {
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);

    setCpfLookup((prev) => (prev.status === "exists" ? prev : { status: "idle", message: "" }));
    lastLookupCpfRef.current = "";

    if (!cpfOk) return;

    lookupTimerRef.current = setTimeout(() => {
      lookupCpfAndGo(cpfDigits);
    }, 350);

    return () => {
      if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpfDigits, cpfOk]);

  async function cadastrar() {
    if (submittingRef.current) return;

    const err = getFirstError();
    if (err) {
      setMsg(err);
      if (!cpfOk) {
        setTimeout(() => {
          cpfInputRef.current?.focus();
        }, 0);
      }
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setMsg("");

    let createdVisitorId = null;

    try {
      let created;
      try {
        const response = await api.post("/visitors", {
          name: name.trim(),
          cpf: cpfDigits,
          phone: onlyDigits(phoneDisplay),
          company: company.trim(),
        });
        created = response.data;
        createdVisitorId = created.id;
      } catch (createErr) {
        if (createErr?.response?.status !== 409) throw createErr;

        const existing = await api.get(`/visitors/by-cpf/${cpfDigits}`);
        created = existing.data;
      }

      try {
        await uploadVisitorFiles(created.id);
      } catch (uploadErr) {
        if (createdVisitorId) {
          const cleaned = await cleanupIncompleteVisitor(createdVisitorId);
          uploadErr.cleanupFailed = !cleaned;
        }
        throw uploadErr;
      }

      navigate(`/checkin?cpf=${cpfDigits}`);
    } catch (err2) {
      setMsg(uploadErrorMessage(err2));
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="cadastro-page">
      <header className="cadastro-topbar">
        <div
          className="cadastro-brand"
          role="button"
          tabIndex={0}
          onClick={() => navigate("/checkin")}
          onKeyDown={(e) => e.key === "Enter" && navigate("/checkin")}
        >
          <img className="cadastro-logo" src="/logo.png" alt="Dimebras" />
        </div>

        <button className="cadastro-back" onClick={() => navigate(-1)} disabled={saving} type="button">
          VOLTAR
        </button>
      </header>

      <div className="cadastro-wrap">
        <div className="cadastro-card">
          <div className="cadastro-grid">
            <div className="cadastro-media">
              <div className="cadastro-photoBox">
                {photo ? (
                  <img src={photoPreview} alt="Foto do visitante" className="cadastro-photo" />
                ) : (
                  <div className="cadastro-photoPlaceholder">FOTO DO VISITANTE</div>
                )}
              </div>

              <button className="btn btn-primary w-full" onClick={() => openCamera("photo")} disabled={saving} type="button">
                {photo ? "TROCAR FOTO DO VISITANTE" : "TIRAR FOTO DO VISITANTE"}
              </button>

              <div className="cadastro-photoBox cadastro-photoBox--document">
                {docFront ? (
                  <img src={docFrontPreview} alt="Documento frente" className="cadastro-photo" />
                ) : (
                  <div className="cadastro-photoPlaceholder">DOCUMENTO (FRENTE)</div>
                )}
              </div>

              <button className="btn btn-primary w-full" onClick={() => openCamera("docFront")} disabled={saving} type="button">
                {docFront ? "TROCAR DOCUMENTO (FRENTE)" : "FOTOGRAFAR DOCUMENTO (FRENTE)"}
              </button>

              <div className="cadastro-photoBox cadastro-photoBox--document">
                {docBack ? (
                  <img src={docBackPreview} alt="Documento verso" className="cadastro-photo" />
                ) : (
                  <div className="cadastro-photoPlaceholder">DOCUMENTO (VERSO)</div>
                )}
              </div>

              <button className="btn btn-primary w-full" onClick={() => openCamera("docBack")} disabled={saving} type="button">
                {docBack ? "TROCAR DOCUMENTO (VERSO)" : "FOTOGRAFAR DOCUMENTO (VERSO)"}
              </button>

              <div className="cadastro-note">
                * Para melhor leitura do documento, mantenha boa iluminação e aproxime o papel da câmera.
              </div>
            </div>

            <div className="cadastro-fields">
              <div className="cadastro-head">
                <h3 className="cadastro-title">Cadastrar Visitante</h3>

                <div className={`cadastro-cpfBadge ${cpfOk ? "ok" : "bad"}`}>
                  <span>CPF</span>
                  <input
                    ref={cpfInputRef}
                    className="cadastro-cpfInput"
                    value={cpfDisplay}
                    onChange={(e) => onChangeCpfInput(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const redirected = await lookupCpfAndGo(cpfDigits);
                        if (!redirected) cadastrar();
                      }
                    }}
                    inputMode="numeric"
                    disabled={saving}
                    placeholder="Digite o CPF"
                  />
                </div>
              </div>

              {!cpfOk && <div className="cadastro-cpfWarn">CPF inválido</div>}

              {cpfLookup.status === "checking" && <div className="cadastro-info">Verificando CPF...</div>}
              {cpfLookup.status === "exists" && <div className="cadastro-info ok">{cpfLookup.message}</div>}
              {cpfLookup.status === "error" && <div className="cadastro-info bad">{cpfLookup.message}</div>}

              {msg && <div className="alert">{msg}</div>}

              <div className="cadastro-form">
                <div className="cadastro-field">
                  <label className="cadastro-label">Nome completo</label>
                  <input className="input" placeholder="Ex: João da Silva" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
                </div>

                <div className="cadastro-field">
                  <label className="cadastro-label">Telefone</label>
                  <input
                    className="input"
                    placeholder="(45) 99999-9999"
                    value={phoneDisplay}
                    onChange={(e) => setPhoneDisplay(formatPhone(e.target.value))}
                    disabled={saving}
                    inputMode="numeric"
                  />
                </div>

                <div className="cadastro-field">
                  <label className="cadastro-label">Empresa</label>
                  <input className="input" placeholder="Ex: Transportadora X" value={company} onChange={(e) => setCompany(e.target.value)} disabled={saving} />
                </div>

                <button
                  className="btn btn-primary w-full btn-lg"
                  onClick={cadastrar}
                  disabled={!formOk}
                  title={!formOk ? "Preencha todos os campos e tire as fotos obrigatórias" : ""}
                  type="button"
                >
                  {saving ? "SALVANDO..." : "SALVAR"}
                </button>

                <div className="cadastro-note">
                  * Foto do visitante + documento (frente e verso) são obrigatórios para liberar o check-in.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {cameraOpen && (
        <CameraModal
          mode={cameraTarget === "photo" ? "photo" : "document"}
          onClose={() => {
            setCameraOpen(false);
            setCameraTarget(null);
          }}
          onCapture={handleCaptureBlob}
        />
      )}
    </div>
  );
}
