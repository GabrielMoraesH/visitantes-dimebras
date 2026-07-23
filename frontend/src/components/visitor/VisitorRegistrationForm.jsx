export default function VisitorRegistrationForm({
  company,
  cpfDisplay,
  cpfInputRef,
  cpfLookup,
  cpfOk,
  formOk,
  message,
  name,
  onChangeCompany,
  onChangeCpf,
  onChangeName,
  onChangePhone,
  onCpfEnter,
  onSubmit,
  phoneDisplay,
  saving,
}) {
  return (
    <div className="cadastro-fields">
      <div className="cadastro-head">
        <h3 className="cadastro-title">Cadastrar Visitante</h3>

        <div className={`cadastro-cpfBadge ${cpfOk ? "ok" : "bad"}`}>
          <span>CPF</span>
          <input
            ref={cpfInputRef}
            className="cadastro-cpfInput"
            value={cpfDisplay}
            onChange={(event) => onChangeCpf(event.target.value)}
            onKeyDown={onCpfEnter}
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

      {message && <div className="alert">{message}</div>}

      <div className="cadastro-form">
        <div className="cadastro-field">
          <label className="cadastro-label">Nome completo</label>
          <input
            className="input"
            placeholder="Ex: João da Silva"
            value={name}
            onChange={(event) => onChangeName(event.target.value)}
            disabled={saving}
          />
        </div>

        <div className="cadastro-field">
          <label className="cadastro-label">Telefone</label>
          <input
            className="input"
            placeholder="(45) 99999-9999"
            value={phoneDisplay}
            onChange={(event) => onChangePhone(event.target.value)}
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
            onChange={(event) => onChangeCompany(event.target.value)}
            disabled={saving}
          />
        </div>

        <button
          className="btn btn-primary w-full btn-lg"
          onClick={onSubmit}
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
  );
}
