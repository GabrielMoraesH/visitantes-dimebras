import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import "../styles/history.css";

function authHeader() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

function onlyDigits(v = "") {
  return String(v).replace(/\D/g, "");
}

function fmt(dt) {
  if (!dt) return "-";

  const d = new Date(dt);

  return d.toLocaleString("pt-BR");
}

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];

    const base64 = base64Url
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map(
          (c) =>
            "%" +
            ("00" + c.charCodeAt(0).toString(16)).slice(-2)
        )
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

  return parseJwt(token);
}

const BRANCHES = [
  "all",
  "Dimebras PR",
  "Dimebras MT",
  "Dimebras MS",
  "Dimebras SC",
  "Alfamed MS",
];

export default function History() {
  const navigate = useNavigate();

  const user = useMemo(() => getUserFromToken(), []);

  const isAdmin =
    String(user?.role || "").toUpperCase() === "ADMIN";

  const [items, setItems] = useState([]);
  const [msg, setMsg] = useState("");

  // FILTROS
  const [cpf, setCpf] = useState("");
  const [status, setStatus] = useState("all");
  const [branchName, setBranchName] = useState("all");
  const [date, setDate] = useState("");

  // PAGINAÇÃO
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!isAdmin) {
      navigate("/checkin");
    }
  }, [isAdmin, navigate]);

  async function carregar(p = page, l = limit) {
    setMsg("");

    try {
      const params = new URLSearchParams();

      if (cpf) {
        params.set("cpf", onlyDigits(cpf));
      }

      if (status !== "all") {
        params.set("status", status);
      }

      if (branchName !== "all") {
        params.set("branchName", branchName);
      }

      if (date) {
        params.set("date", date);
      }

      params.set("page", String(p));
      params.set("limit", String(l));

      const url = `/history?${params.toString()}`;

      const { data } = await api.get(url, {
        headers: authHeader(),
      });

      setItems(
        Array.isArray(data?.items)
          ? data.items
          : []
      );

      setPage(Number(data?.page || p));
      setTotal(Number(data?.total || 0));
      setTotalPages(Number(data?.totalPages || 1));
    } catch (err) {
      setMsg(
        err?.response?.data?.message ||
        "Erro ao carregar histórico"
      );
    }
  }

  useEffect(() => {
    if (isAdmin) {
      carregar(1, limit);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  function abrirDetalhesDaVisita(visitId) {
    const id = Number(visitId);

    if (!id) return;

    navigate(`/visit/${id}`);
  }

  if (!isAdmin) return null;

  return (
    <div className="history-page">

      {/* TOPBAR */}
      <header className="history-topbar">

        <div
          className="history-brand"
          onClick={() => navigate("/checkin")}
          role="button"
          tabIndex={0}
          title="Voltar para Check-in"
        >
          <img
            src="/logo.png"
            alt="Dimebras"
            className="history-logo"
          />
        </div>

        <div className="history-topbar-actions">

          <button
            className="history-topbar-btn"
            onClick={() => navigate("/checkin")}
            type="button"
          >
            VOLTAR
          </button>

        </div>

      </header>


      {/* CONTEÚDO */}
      <div className="history-container">

        <div className="history-header">

          <div>
            <h2 className="history-title">
              Histórico
            </h2>

            <p className="history-subtitle">
              Entradas e saídas registradas
            </p>
          </div>

        </div>


        {/* FILTROS */}
        <form
          className="history-filters"
          onSubmit={(e) => {
            e.preventDefault();

            setPage(1);

            carregar(1, limit);
          }}
        >

          <input
            className="h-input"
            placeholder="Filtrar por CPF..."
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            inputMode="numeric"
          />


          <select
            className="h-input"
            value={branchName}
            onChange={(e) =>
              setBranchName(e.target.value)
            }
          >

            <option value="all">
              Filial: Todas
            </option>

            {BRANCHES
              .filter((b) => b !== "all")
              .map((b) => (
                <option key={b} value={b}>
                  Filial: {b}
                </option>
              ))}

          </select>


          <select
            className="h-input"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value)
            }
          >

            <option value="all">
              Status: Todos
            </option>

            <option value="open">
              Status: Abertos
            </option>

            <option value="closed">
              Status: Finalizados
            </option>

          </select>


          <input
            className="h-input"
            type="date"
            value={date}
            onChange={(e) =>
              setDate(e.target.value)
            }
            title="Filtrar por dia (check-in)"
          />


          <select
            className="h-input"
            value={limit}
            onChange={(e) => {
              const newLimit = Number(e.target.value);

              setLimit(newLimit);
              setPage(1);

              carregar(1, newLimit);
            }}
            title="Itens por página"
          >

            <option value={10}>
              Mostrar 10
            </option>

            <option value={25}>
              Mostrar 25
            </option>

            <option value={50}>
              Mostrar 50
            </option>

            <option value={100}>
              Mostrar 100
            </option>

          </select>


          <button
            type="submit"
            className="h-btn h-btn-primary"
          >
            Filtrar
          </button>

        </form>


        {msg && (
          <div className="history-alert">
            {msg}
          </div>
        )}


        {/* TABELA */}
        <div className="history-card">

          <div className="history-tableWrap">

            <table className="history-table">

              <thead>
                <tr>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Nome do Visitante</th>
                  <th>Documento</th>
                  <th>Empresa</th>
                  <th>Anfitrião</th>
                  <th>Registrado por(In)</th>
                  <th>Registrado por(Out)</th>
                  <th>Filial</th>
                </tr>
              </thead>


              <tbody>

                {items.length === 0 ? (

                  <tr>
                    <td
                      colSpan="9"
                      className="history-empty"
                    >
                      Nenhum registro encontrado.
                    </td>
                  </tr>

                ) : (

                  items.map((v) => {
                    const clickable = !!Number(v?.id);

                    return (
                      <tr key={v.id}>

                        <td>
                          {fmt(v.checkinAt)}
                        </td>

                        <td>
                          {v.checkoutAt ? (
                            fmt(v.checkoutAt)
                          ) : (
                            <span className="pill pill-open">
                              Aberto
                            </span>
                          )}
                        </td>

                        <td>
                          <span
                            className={clickable ? "history-linkCell" : ""}
                            role={clickable ? "button" : undefined}
                            tabIndex={clickable ? 0 : undefined}
                            onClick={() =>
                              clickable &&
                              abrirDetalhesDaVisita(v.id)
                            }
                            onKeyDown={(e) => {
                              if (!clickable) return;

                              if (e.key === "Enter") {
                                abrirDetalhesDaVisita(v.id);
                              }
                            }}
                            title={
                              clickable
                                ? "Ver detalhes da visita"
                                : ""
                            }
                          >
                            {v.visitor?.name || "-"}
                          </span>
                        </td>

                        <td>
                          {v.visitor?.cpf || "-"}
                        </td>

                        <td>
                          {v.visitor?.company || "-"}
                        </td>

                        <td>
                          {v.attendedBy || "-"}
                        </td>

                        <td>
                          {v.checkinByUser?.username || "-"}
                        </td>

                        <td>
                          {v.checkoutByUser?.username || "-"}
                        </td>

                        <td>
                          {v.branchName ||
                            v.branch?.name ||
                            "-"}
                        </td>

                      </tr>
                    );
                  })

                )}

              </tbody>

            </table>

          </div>


          {/* PAGINAÇÃO */}
          <div className="history-pagination">

            <div className="history-pagination-info">
              Total: {total} • Página {page} de {totalPages}
            </div>


            <div className="history-pagination-actions">

              <button
                className="h-btn h-btn-ghost"
                onClick={() =>
                  carregar(page - 1, limit)
                }
                disabled={page <= 1}
                type="button"
              >
                ◀ Anterior
              </button>


              <button
                className="h-btn h-btn-ghost"
                onClick={() =>
                  carregar(page + 1, limit)
                }
                disabled={page >= totalPages}
                type="button"
              >
                Próxima ▶
              </button>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
