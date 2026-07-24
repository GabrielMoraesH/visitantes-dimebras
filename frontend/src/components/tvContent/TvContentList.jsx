import {
  formatBytes,
  formatTvContentDate,
  mediaUrl,
  tvContentTypeLabel,
} from "../../utils/tvContent";
import TvBranchList from "./TvBranchList";
import TvContentActions from "./TvContentActions";

export default function TvContentList({
  allBranches,
  items,
  loading,
  onEdit,
  onRemove,
  onToggle,
}) {
  return (
    <section className="tc-card">
      <div className="tc-cardHeader">
        <div className="tc-cardTitle">Conteudos cadastrados</div>
        <div className="tc-pill">{items.length} total</div>
      </div>

      <div className="tc-tableWrap">
        <table className="tc-table">
          <thead>
            <tr>
              <th>Preview</th>
              <th>Tí­tulo</th>
              <th>Tipo</th>
              <th>Tamanho</th>
              <th>Filiais</th>
              <th>Ordem</th>
              <th>Status</th>
              <th>Criado em</th>
              <th className="tc-actions-col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="9" className="tc-empty">Carregando...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan="9" className="tc-empty">Nenhum conteúdo cadastrado.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className={item.isActive ? undefined : "tc-row-disabled"}>
                  <td>
                    <div className="tc-preview">
                      {item.type === "IMAGE" ? (
                        <img src={mediaUrl(item.fileUrl)} alt={item.title} />
                      ) : (
                        <video src={mediaUrl(item.fileUrl)} muted controls preload="metadata" />
                      )}
                    </div>
                  </td>
                  <td className="tc-titleCell">{item.title}</td>
                  <td>{tvContentTypeLabel(item.type)}</td>
                  <td>{formatBytes(item.fileSize)}</td>
                  <td className="tc-branchCell">
                    <TvBranchList branches={item.branches} allBranches={allBranches} />
                  </td>
                  <td>{item.order ?? 0}</td>
                  <td>
                    <span className={`tc-status ${item.isActive ? "is-on" : "is-off"}`}>
                      {item.isActive ? "ATIVO" : "INATIVO"}
                    </span>
                  </td>
                  <td>{formatTvContentDate(item.createdAt)}</td>
                  <td>
                    <TvContentActions
                      item={item}
                      onEdit={onEdit}
                      onRemove={onRemove}
                      onToggle={onToggle}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
