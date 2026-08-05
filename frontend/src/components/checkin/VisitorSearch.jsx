import { uniqueFieldErrorMessages } from "../../utils/checkin";

export default function VisitorSearch({
  alertRef,
  alertTitle = "Corrija os campos:",
  cpf,
  cpfInputRef,
  fieldErrors,
  message,
  onCpfChange,
  onSubmit,
}) {
  const fieldErrorMessages = uniqueFieldErrorMessages(fieldErrors);

  return (
    <section className="card card-search">
      <div className="card-title">Registrar Entrada</div>

      <form
        className="search-row"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input
          ref={cpfInputRef}
          className="input input-lg"
          value={cpf}
          onChange={(event) => onCpfChange(event.target.value)}
          placeholder="Digite o CPF para iniciar..."
          inputMode="numeric"
        />
        <button type="submit" className="btn btn-primary btn-lg">
          BUSCAR
        </button>
      </form>

      {message && <div className="alert">{message}</div>}

      {fieldErrorMessages.length > 0 && (
        <div
          ref={alertRef}
          className="alert alert-list"
          role="alert"
          tabIndex={-1}
          aria-labelledby="checkin-alert-title"
        >
          <div className="alert-title" id="checkin-alert-title">
            {alertTitle}
          </div>
          <ul>
            {fieldErrorMessages.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
