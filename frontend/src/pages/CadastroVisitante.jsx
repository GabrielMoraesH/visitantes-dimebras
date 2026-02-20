import { useSearchParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import CameraModal from "../components/CameraModal";
import "../styles/cadastro.css";

function authHeader() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

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

export default function CadastroVisitante() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const cpfParam = useMemo(() => onlyDigits(searchParams.get("cpf") || ""), [searchParams]);
  const [cpfDigits] = useState(cpfParam);
  const cpfDisplay = useMemo(() => formatCPF(cpfDigits), [cpfDigits]);

  const [name, setName] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [company, setCompany] = useState("");

  // arquivos (todos por câmera)
  const [photo, setPhoto] = useState(null); // visitante
  const [docFront, setDocFront] = useState(null); // documento frente
  const [docBack, setDocBack] = useState(null); // documento verso

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null); // "photo" | "docFront" | "docBack"
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // previews (sem vazamento)
  const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : ""), [photo]);
  const docFrontPreview = useMemo(() => (docFront ? URL.createObjectURL(docFront) : ""), [docFront]);
  const docBackPreview = useMemo(() => (docBack ? URL.createObjectURL(docBack) : ""), [docBack]);

  useEffect(() => {
    return () => {
      for (const url of [photoPreview, docFrontPreview, docBackPreview]) {
        if (!url) continue;
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }
    };
  }, [photoPreview, docFrontPreview, docBackPreview]);

  useEffect(() => {
    const token = localStorage.getItem("token");
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

  async function cadastrar() {
    const err = getFirstError();
    if (err) {
      setMsg(err);
      return;
    }

    setSaving(true);
    setMsg("");

    try {
      const { data: created } = await api.post(
        "/visitors",
        {
          name: name.trim(),
          cpf: cpfDigits,
          phone: onlyDigits(phoneDisplay),
          company: company.trim(),
        },
        { headers: authHeader() }
      );

      const fd = new FormData();
      fd.append("photo", photo);
      fd.append("documentFront", docFront);
      fd.append("documentBack", docBack);

      await api.put(`/visitors/${created.id}/files`, fd, {
        headers: { ...authHeader(), "Content-Type": "multipart/form-data" },
      });

      navigate(`/checkin?cpf=${cpfDigits}`);
    } catch (err2) {
      setMsg(err2?.response?.data?.message || "Erro ao salvar visitante");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cadastro-page">
      <header className="cadastro-topbar">
        {/* LOGO (clicável) */}
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
            {/* COLUNA ESQUERDA */}
            <div className="cadastro-media">
              {/* FOTO VISITANTE */}
              <div className="cadastro-photoBox">
                {photo ? (
                  <img src={photoPreview} alt="Foto do visitante" className="cadastro-photo" />
                ) : (
                  <div className="cadastro-photoPlaceholder">FOTO DO VISITANTE</div>
                )}
              </div>

              <button
                className="btn btn-primary w-full"
                onClick={() => openCamera("photo")}
                disabled={saving}
                type="button"
              >
                {photo ? "TROCAR FOTO DO VISITANTE" : "TIRAR FOTO DO VISITANTE"}
              </button>

              {/* DOCUMENTO FRENTE */}
              <div className="cadastro-photoBox" style={{ height: 180 }}>
                {docFront ? (
                  <img src={docFrontPreview} alt="Documento frente" className="cadastro-photo" />
                ) : (
                  <div className="cadastro-photoPlaceholder">DOCUMENTO (FRENTE)</div>
                )}
              </div>

              <button
                className="btn btn-primary w-full"
                onClick={() => openCamera("docFront")}
                disabled={saving}
                type="button"
              >
                {docFront ? "TROCAR DOCUMENTO (FRENTE)" : "FOTOGRAFAR DOCUMENTO (FRENTE)"}
              </button>

              {/* DOCUMENTO VERSO */}
              <div className="cadastro-photoBox" style={{ height: 180 }}>
                {docBack ? (
                  <img src={docBackPreview} alt="Documento verso" className="cadastro-photo" />
                ) : (
                  <div className="cadastro-photoPlaceholder">DOCUMENTO (VERSO)</div>
                )}
              </div>

              <button
                className="btn btn-primary w-full"
                onClick={() => openCamera("docBack")}
                disabled={saving}
                type="button"
              >
                {docBack ? "TROCAR DOCUMENTO (VERSO)" : "FOTOGRAFAR DOCUMENTO (VERSO)"}
              </button>

              <div className="cadastro-note">
                * Para melhor leitura do documento, mantenha boa iluminação e aproxime o papel da câmera.
              </div>
            </div>

            {/* COLUNA DIREITA */}
            <div className="cadastro-fields">
              <div className="cadastro-head">
                <h3 className="cadastro-title">Cadastrar Visitante</h3>

                <div className={`cadastro-cpfBadge ${cpfOk ? "ok" : "bad"}`}>
                  <span>CPF</span>
                  <strong>{cpfDisplay || "-"}</strong>
                </div>
              </div>

              {!cpfOk && <div className="cadastro-cpfWarn">CPF inválido</div>}

              {msg && <div className="alert">{msg}</div>}

              <div className="cadastro-form">
                <div className="cadastro-field">
                  <label className="cadastro-label">Nome completo</label>
                  <input
                    className="input"
                    placeholder="Ex: João da Silva"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={saving}
                  />
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
                  <input
                    className="input"
                    placeholder="Ex: Transportadora X"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    disabled={saving}
                  />
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