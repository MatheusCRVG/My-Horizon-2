import { useState } from "react";
import { FileUp, Check, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { useFinance } from "../core/store";
import { rows, money, categories } from "../core/model";
import {
  importFile,
  validateCandidates,
  type ImportResult,
} from "../core/import";
export function ImportPage() {
  const { doc, edit } = useFinance();
  const [account, setAccount] = useState(rows(doc!, "account")[0]?.id ?? ""),
    [result, setResult] = useState<ImportResult | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState("");
  const accounts = rows(doc!, "account");
  const kinds: Record<string, string> = {
    transaction: "Lançamento",
    account: "Conta",
    goal: "Meta",
    asset: "Patrimônio",
    card: "Cartão",
    budget: "Orçamento",
    trip: "Viagem",
    simulation: "Simulação",
    rule: "Regra",
  };
  const update = (index: number, data: Record<string, any>) =>
    setResult((r) =>
      r
        ? {
            ...r,
            candidates: r.candidates.map((c, i) =>
              i === index ? { ...c, data: { ...c.data, ...data } } : c,
            ),
          }
        : null,
    );
  return (
    <>
      <div className="panel import-hero">
        <span className="tile-icon">
          <FileSpreadsheet size={25} />
        </span>
        <h2>Traga sua história com você.</h2>
        <p className="muted">
          Importe sua planilha anterior ou extratos CSV e OFX. Revise tudo
          antes de salvar.
        </p>
        <label className="inline-field">
          Conta padrão para extratos
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Selecione uma conta</option>
            {accounts.map((a) => (
              <option value={a.id} key={a.id}>
                {a.data.name}
              </option>
            ))}
          </select>
        </label>
        <label className={`upload-zone ${busy ? "disabled" : ""}`}>
          <FileUp size={28} />
          <strong>
            {busy ? "Analisando arquivo…" : "Escolher planilha ou extrato"}
          </strong>
          <span>
            XLSX, CSV ou OFX · até 20 MB · processado neste dispositivo
          </span>
          <input
            disabled={busy}
            type="file"
            accept=".xlsx,.xls,.csv,.ofx"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              setError("");
              setDone("");
              try {
                setResult(await importFile(file, doc!, account));
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </label>
        <p className="muted">
          CSV: Data;Descrição;Valor. Valores negativos são despesas. Aceita o
          CSV exportado pelo aplicativo. Campos extras de conta devem ser
          conferidos na revisão.
        </p>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="success-box">
          <Check size={18} />
          {done}
        </p>
      )}
      {result && (
        <>
          <div className="panel">
            <div className="panel-title">
              <div>
                <h3>Revisar importação</h3>
                <p>
                  {result.candidates.length} registro(s) ·{" "}
                  {result.candidates.filter((c) => c.duplicate).length}{" "}
                  possível(is) duplicado(s)
                </p>
              </div>
              <button
                className="btn primary"
                disabled={busy || !result.candidates.some((c) => c.selected)}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const selected = validateCandidates(
                      result.candidates,
                      doc!,
                    );
                    await edit(selected);
                    setDone(
                      `${selected.length} registro(s) importado(s) para o cofre.`,
                    );
                    setResult(null);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Check size={16} />
                Confirmar importação
              </button>
            </div>
            {result.warnings.length > 0 && (
              <details open>
                <summary>
                  <AlertTriangle size={16} />
                  Avisos e linhas ignoradas ({result.warnings.length})
                </summary>
                {result.warnings.map((w, i) => (
                  <p className="muted" key={i}>
                    {w}
                  </p>
                ))}
              </details>
            )}
            <p className="muted">
              Duplicados ficam desmarcados. Não confirme transferências nem
              compras de cartão sem conferir os vínculos. Corrija valores e
              datas no arquivo antes de importar.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Importar</th>
                    <th>Registro / origem</th>
                    <th>Tipo / conta</th>
                    <th>Categoria</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {result.candidates.map((c, i) => (
                    <tr key={c.id + ":" + i}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Importar ${c.data.description ?? c.data.name ?? c.data.keyword ?? c.data.category}`}
                          checked={c.selected}
                          disabled={c.duplicate}
                          onChange={(e) =>
                            setResult({
                              ...result,
                              candidates: result.candidates.map((x, j) =>
                                j === i
                                  ? { ...x, selected: e.target.checked }
                                  : x,
                              ),
                            })
                          }
                        />
                      </td>
                      <td>
                        <strong>
                          {c.data.description ??
                            c.data.name ??
                            c.data.keyword ??
                            c.data.category}
                        </strong>
                        <small>
                          {c.source} {c.data.date ?? ""}
                        </small>
                        {c.duplicate && (
                          <span className="pill">Duplicado · ignorado</span>
                        )}
                      </td>
                      <td>
                        {c.kind === "transaction" ? (
                          <>
                            <select
                              aria-label="Tipo importado"
                              value={c.data.type}
                              onChange={(e) =>
                                update(i, { type: e.target.value })
                              }
                            >
                              <option value="expense">Despesa</option>
                              <option value="income">Receita</option>
                              <option value="transfer">Transferência</option>
                            </select>
                            <select
                              aria-label="Conta importada"
                              value={c.data.accountId}
                              onChange={(e) =>
                                update(i, { accountId: e.target.value })
                              }
                            >
                              <option value="">Selecione conta</option>
                              {[
                                ...accounts,
                                ...result.candidates.filter(
                                  (c) => c.kind === "account",
                                ),
                              ].map((a) => (
                                <option value={a.id} key={a.id}>
                                  {a.data.name}
                                </option>
                              ))}
                            </select>
                            {c.data.type === "transfer" && (
                              <select
                                aria-label="Conta destino importada"
                                value={c.data.targetAccountId ?? ""}
                                onChange={(e) =>
                                  update(i, { targetAccountId: e.target.value })
                                }
                              >
                                <option value="">Conta de destino</option>
                                {[
                                  ...accounts,
                                  ...result.candidates.filter(
                                    (c) => c.kind === "account",
                                  ),
                                ].map((a) => (
                                  <option value={a.id} key={a.id}>
                                    {a.data.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            {c.data.payment === "credit" && (
                              <select
                                aria-label="Cartão importado"
                                value={c.data.cardId ?? ""}
                                onChange={(e) =>
                                  update(i, { cardId: e.target.value })
                                }
                              >
                                <option value="">Vincular cartão</option>
                                {[
                                  ...rows(doc!, "card"),
                                  ...result.candidates.filter(
                                    (c) => c.kind === "card",
                                  ),
                                ].map((a) => (
                                  <option value={a.id} key={a.id}>
                                    {a.data.name}
                                  </option>
                                ))}
                              </select>
                            )}
                          </>
                        ) : (
                          kinds[c.kind]
                        )}
                      </td>
                      <td>
                        {c.kind === "transaction" ? (
                          <select
                            aria-label="Categoria importada"
                            value={c.data.category}
                            onChange={(e) =>
                              update(i, { category: e.target.value })
                            }
                          >
                            {Array.from(
                              new Set([...categories, c.data.category]),
                            ).map((k) => (
                              <option key={k}>{k}</option>
                            ))}
                          </select>
                        ) : (
                          (c.data.category ?? "—")
                        )}
                      </td>
                      <td>
                        {money(
                          c.data.amount ??
                            c.data.target ??
                            c.data.balance ??
                            c.data.limit ??
                            0,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!result.candidates.length && (
              <p className="muted calm">
                Nenhum registro preenchido encontrado nas tabelas compatíveis.
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}
