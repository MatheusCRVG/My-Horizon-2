import { useState } from "react";
import {
  ArrowDownUp,
  Pencil,
  Trash2,
  Repeat,
  CheckCircle2,
  Building2,
} from "lucide-react";
import { rows, dateLabel, today, categories, type Entity } from "../core/model";
import { scheduleTransaction, cardOutstanding } from "../core/finance";
import { PeriodSummary } from "../components/PeriodSummary";
import { useFinance } from "../core/store";
import {
  DataForm,
  Modal,
  Toolbar,
  Empty,
  Amount,
  TypeIcon,
  csvExport,
  type Field,
} from "../components/ui";
import { DeleteModal } from "./Records";
export function TransactionForm({
  entity,
  initialType = "expense",
  onClose,
}: {
  entity?: Entity;
  initialType?: "income" | "expense";
  onClose: () => void;
}) {
  const { doc, edit } = useFinance();
  const [type, setType] = useState(entity?.data.type ?? initialType),
    [payment, setPayment] = useState(entity?.data.payment ?? "pix"),
    [recurring, setRecurring] = useState(false);
  const accounts = rows(doc!, "account");
  const cards = rows(doc!, "card");
  const fields: Field[] = [
    { key: "description", label: "Descrição", required: true },
    {
      key: "amount",
      label:
        payment === "credit" && !entity
          ? "Valor total da compra (R$)"
          : "Valor (R$)",
      type: "number",
      min: 0.01,
      max: 1000000000,
      required: true,
    },
    {
      key: "date",
      label: entity?.data.installment
        ? "Vencimento da parcela"
        : "Data da movimentação",
      type: "date",
      required: true,
      default: today(),
    },
    {
      key: "accountId",
      label: "Conta bancária",
      type: "select",
      required: true,
      options: accounts.map((a) => ({ value: a.id, label: a.data.name })),
      default: accounts[0]?.id ?? "",
    },
    ...(type === "transfer" && !entity?.data.cardPayment
      ? [
          {
            key: "targetAccountId",
            label: "Conta de destino",
            type: "select" as const,
            required: true,
            options: accounts.map((a) => ({ value: a.id, label: a.data.name })),
            default: accounts[1]?.id ?? "",
          },
        ]
      : []),
    ...(type !== "transfer"
      ? [
          {
            key: "category",
            label: "Categoria",
            type: "select" as const,
            required: true,
            options: categories.map((c) => ({ value: c, label: c })),
            default: "Outros",
          },
          { key: "subcategory", label: "Subcategoria", required: false },
        ]
      : []),
    {
      key: "status",
      label: "Situação",
      type: "select",
      required: true,
      options: [
        { value: "confirmed", label: "Confirmado" },
        { value: "planned", label: "Previsto" },
        { value: "cancelled", label: "Cancelado" },
      ],
      default: "confirmed",
    },
    ...(payment === "credit" && type === "expense"
      ? [
          {
            key: "cardId",
            label: "Cartão",
            type: "select" as const,
            required: true,
            options: cards.map((c) => ({ value: c.id, label: c.data.name })),
            default: cards[0]?.id ?? "",
          },
          ...(!entity
            ? [
                {
                  key: "installments",
                  label: "Número de parcelas",
                  type: "number" as const,
                  min: 1,
                  max: 120,
                  step: "1",
                  default: 1,
                  required: true,
                },
              ]
            : []),
        ]
      : []),
    ...(recurring && !entity
      ? [
          {
            key: "occurrences",
            label: "Quantidade de meses",
            type: "number" as const,
            min: 2,
            max: 120,
            step: "1",
            default: 12,
            required: true,
          },
        ]
      : []),
    {
      key: "tags",
      label: "Marcadores (separados por vírgula)",
      required: false,
    },
    { key: "notes", label: "Observações", type: "textarea", required: false },
  ];
  return (
    <Modal
      title={entity ? "Editar lançamento" : "Novo lançamento"}
      onClose={onClose}
    >
      <div className="segmented">
        {[
          ["expense", "Despesa"],
          ["income", "Receita"],
          ["transfer", "Transferência"],
        ].map(([v, label]) => (
          <button
            disabled={!!entity?.data.cardPayment || !!entity?.data.installment}
            className={type === v ? "active" : ""}
            key={v}
            onClick={() => {
              setType(v);
              if (v !== "expense") setPayment("pix");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {!accounts.length ? (
        <div className="error-box">
          Cadastre uma conta em Contas e saldos antes de criar lançamentos.
        </div>
      ) : (
        <>
          <div className="form-grid form-options">
            <label>
              <span>Forma de pagamento</span>
              <select
                value={payment}
                disabled={
                  !!entity?.data.installment || !!entity?.data.cardPayment
                }
                onChange={(e) => {
                  setPayment(e.target.value);
                  setRecurring(false);
                }}
              >
                {[
                  ["pix", "Pix"],
                  ["debit", "Débito"],
                  ["cash", "Dinheiro"],
                  ["boleto", "Boleto"],
                  ...(type === "expense"
                    ? [["credit", "Cartão de crédito"]]
                    : []),
                ].map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {!entity && payment !== "credit" && type !== "transfer" && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                />
                <Repeat size={15} />
                Repetir mensalmente
              </label>
            )}
          </div>
          <DataForm
            key={`${type}-${payment}-${recurring}`}
            fields={fields}
            initial={entity?.data}
            onSubmit={async (d) => {
              if (
                entity?.data.cardPayment &&
                (d.status !== "confirmed" || d.date > today())
              )
                throw Error(
                  "Pagamentos de fatura devem ser confirmados com data até hoje. Para desfazer, exclua o pagamento.",
                );
              if (
                type === "transfer" &&
                !entity?.data.cardPayment &&
                d.accountId === d.targetAccountId
              )
                throw Error("Escolha contas diferentes para a transferência.");
              if (
                (d.installments || d.occurrences) &&
                !Number.isInteger(Number(d.installments || d.occurrences))
              )
                throw Error(
                  "A quantidade de parcelas ou meses deve ser inteira.",
                );
              if (entity) {
                await edit([
                  { ...entity, data: { ...entity.data, ...d, type, payment } },
                ]);
              } else {
                const data = { ...d, type, payment };
                const changes = scheduleTransaction(data, cards);
                if (payment === "credit" && d.status === "confirmed") {
                  const c = cards.find((c) => c.id === d.cardId)!;
                  if (
                    cardOutstanding(doc!, c.id) + Number(d.amount) >
                    Number(c.data.limit)
                  )
                    throw Error(
                      "Esta compra ultrapassa o limite disponível do cartão. Ajuste o limite ou o valor.",
                    );
                }
                await edit(changes);
              }
              onClose();
            }}
          />
          {recurring && (
            <p className="muted">
              As próximas ocorrências serão previstas. Confirme cada recebimento
              ou pagamento quando acontecer.
            </p>
          )}
          {entity?.data.installment && (
            <p className="muted">
              Esta edição afeta somente a parcela selecionada. As demais
              parcelas continuam independentes.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
export function Transactions({
  month,
  account,
  category,
  setAccount,
  setCategory,
  initialMode = "all",
}: {
  month: string;
  account: string;
  category: string;
  setAccount: (value: string) => void;
  setCategory: (value: string) => void;
  initialMode?: string;
}) {
  const { doc, edit } = useFinance();
  const [search, setSearch] = useState(""),
    [type, setType] = useState(""),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("desc"),
    [editing, setEditing] = useState<Entity | true | null>(null),
    [deleting, setDeleting] = useState<Entity | null>(null);
  const [allMonths, setAllMonths] = useState(initialMode === "recurring");
  const list = rows(doc!, "transaction")
    .filter((e) => {
      const d = e.data;
      return (
        (allMonths || d.date.startsWith(month)) &&
        (!account ||
          d.accountId === account ||
          d.targetAccountId === account) &&
        (!category || d.category === category) &&
        (!type || d.type === type) &&
        (!status || d.status === status) &&
        (initialMode !== "recurring" ||
          d.frequency === "monthly" ||
          (d.group && !d.installment)) &&
        `${d.description} ${d.tags ?? ""} ${d.notes ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    })
    .sort((a, b) =>
      sort === "amount"
        ? b.data.amount - a.data.amount
        : sort === "asc"
          ? a.data.date.localeCompare(b.data.date)
          : b.data.date.localeCompare(a.data.date),
    );
  return (
    <>
      <PeriodSummary month={month} account={account} category={category} />
      <div className="panel transaction-panel">
        <div className="transaction-title">
          <h3>Todos os lançamentos</h3>
          <p>Gerencie, filtre e acompanhe suas movimentações financeiras.</p>
        </div>
        <Toolbar
          search={search}
          setSearch={setSearch}
          onAdd={() => setEditing(true)}
          onExport={() =>
            csvExport(
              [
                "Data",
                "Descrição",
                "Tipo",
                "Categoria",
                "Valor",
                "Situação",
                "Conta",
                "Forma de pagamento",
                "Subcategoria",
                "Marcadores",
                "Observações",
              ],
              list.map((e) => {
                const d = e.data;
                return [
                  d.date,
                  d.description,
                  d.type,
                  d.category,
                  d.amount,
                  d.status,
                  rows(doc!, "account").find((a) => a.id === d.accountId)?.data
                    .name,
                  d.payment,
                  d.subcategory,
                  d.tags,
                  d.notes,
                ];
              }),
              "my-horizon-lancamentos.csv",
            )
          }
        />
        <div className="table-filters">
          <select
            aria-label="Filtrar categoria"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {Array.from(
              new Set([
                ...categories,
                ...rows(doc!, "transaction")
                  .map((t) => t.data.category)
                  .filter(Boolean),
              ]),
            ).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar conta"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          >
            <option value="">Todas as contas</option>
            {rows(doc!, "account").map((a) => (
              <option value={a.id} key={a.id}>
                {a.data.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar tipo"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">Todos os tipos</option>
            <option value="income">Receitas</option>
            <option value="expense">Despesas</option>
            <option value="transfer">Transferências</option>
          </select>
          <select
            aria-label="Filtrar situação"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todas as situações</option>
            <option value="confirmed">Confirmados</option>
            <option value="planned">Previstos</option>
            <option value="cancelled">Cancelados</option>
          </select>
          <select
            aria-label="Ordenação"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="desc">Mais recentes</option>
            <option value="asc">Mais antigos</option>
            <option value="amount">Maior valor</option>
          </select>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={allMonths}
              onChange={(e) => setAllMonths(e.target.checked)}
            />
            Todos os meses
          </label>
          <button
            className="text-btn clear-filters"
            onClick={() => {
              setSearch("");
              setType("");
              setStatus("");
              setSort("desc");
              setAllMonths(initialMode === "recurring");
              setAccount("");
              setCategory("");
            }}
          >
            Limpar filtros
          </button>
        </div>
        {!list.length ? (
          <Empty
            title="Tudo começa com um lançamento"
            text="Registre suas entradas e saídas para dar clareza ao seu mês."
            action={() => setEditing(true)}
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Conta</th>
                  <th>Data</th>
                  <th>Situação</th>
                  <th className="align-right">Valor</th>
                  <th>
                    <ArrowDownUp size={14} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => {
                  const d = e.data;
                  return (
                    <tr key={e.id}>
                      <td>
                        <div className="transaction-name">
                          <TypeIcon type={d.type} category={d.category} />
                          <div>
                            <strong>{d.description}</strong>
                            <small>
                              {d.installment
                                ? `Parcela ${d.installment}`
                                : d.cardPayment
                                  ? "Pagamento de fatura"
                                  : d.type === "transfer"
                                    ? "Transferência entre contas"
                                    : d.subcategory ||
                                      (
                                        {
                                          pix: "Pix",
                                          debit: "Débito",
                                          cash: "Dinheiro",
                                          boleto: "Boleto",
                                          credit: "Crédito",
                                        } as Record<string, string>
                                      )[d.payment] ||
                                      "Movimentação"}{" "}
                              {d.tags ? `· ${d.tags}` : ""}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="category-cell">
                          {d.category ?? "Transferência"}
                        </span>
                      </td>
                      <td>
                        <span className="account-cell">
                          <Building2 size={14} />
                          {rows(doc!, "account").find(
                            (a) => a.id === d.accountId,
                          )?.data.name ?? "—"}
                        </span>
                      </td>
                      <td>{dateLabel(d.date)}</td>
                      <td>
                        <span className={`status ${d.status}`}>
                          {d.status === "confirmed"
                            ? "Confirmado"
                            : d.status === "planned"
                              ? "Previsto"
                              : "Cancelado"}
                        </span>
                      </td>
                      <td className="align-right">
                        <Amount value={d.amount} type={d.type} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {d.status === "planned" && (
                            <button
                              className="icon-btn"
                              aria-label={`Confirmar ${d.description}`}
                              onClick={async () => {
                                try {
                                  await edit([
                                    {
                                      ...e,
                                      data: { ...d, status: "confirmed" },
                                    },
                                  ]);
                                } catch (err) {
                                  useFinance
                                    .getState()
                                    .message((err as Error).message);
                                }
                              }}
                            >
                              <CheckCircle2 size={16} />
                            </button>
                          )}
                          <button
                            className="icon-btn"
                            aria-label={`Editar ${d.description}`}
                            onClick={() => setEditing(e)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="icon-btn"
                            aria-label={`Excluir ${d.description}`}
                            onClick={() => setDeleting(e)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          {list.length} lançamento(s) · Valores em reais
        </div>
      </div>
      {editing && (
        <TransactionForm
          entity={editing === true ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}{" "}
      {deleting && (
        <DeleteModal entity={deleting} onClose={() => setDeleting(null)} />
      )}
    </>
  );
}
