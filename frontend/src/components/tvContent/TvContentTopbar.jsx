export default function TvContentTopbar({ onBack, onRefresh }) {
  return (
    <header className="tvContent-topbar">
      <div
        className="tvContent-brand"
        onClick={onBack}
        role="button"
        tabIndex={0}
      >
        <img src="/logo.png" alt="Dimebras" className="tvContent-logo" />
      </div>

      <div className="tvContent-actions">
        <button className="tc-btn tc-btn-ghost" onClick={onRefresh} type="button">
          ATUALIZAR
        </button>
        <button className="tc-btn tc-btn-ghost" onClick={onBack} type="button">
          VOLTAR
        </button>
      </div>
    </header>
  );
}
