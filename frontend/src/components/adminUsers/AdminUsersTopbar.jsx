export default function AdminUsersTopbar({ onBack, onRefresh }) {
  return (
    <header className="adminUsers-topbar">
      <div
        className="adminUsers-brand"
        onClick={onBack}
        role="button"
        tabIndex={0}
      >
        <img src="/logo.png" alt="Dimebras" className="adminUsers-logo" />
      </div>

      <div className="adminUsers-actions">
        <button className="au-btn au-btn-ghost" onClick={onRefresh} type="button">
          ATUALIZAR
        </button>

        <button className="au-btn au-btn-ghost" onClick={onBack} type="button">
          VOLTAR
        </button>
      </div>
    </header>
  );
}
