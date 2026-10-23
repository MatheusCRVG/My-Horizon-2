import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { useFinance } from "../core/store";
import { rows, money, number } from "../core/model";
import { totals, projectCash } from "../core/finance";
import { Stat, Empty, csvExport } from "../components/ui";
import { saveExport } from "../services/files";
export { Dashboard } from "./DashboardView";
export function Reports({
  month,
  account,
  category,
}: {
  month: string;
  account: string;
  category: string;
}) {
  const { doc } = useFinance();
  const [t, p] = [
    totals(doc!, month, account, category),
    projectCash(doc!, 60, account, category),
  ];
  const monthTx = rows(doc!, "transaction").filter(
    (e) =>
      e.data.date.startsWith(month) &&
      e.data.status === "confirmed" &&
      (!account || e.data.accountId === account) &&
      (!category || e.data.category === category),
  );
  return (
    <>
      <div className="toolbar">
        <p className="muted">
          Relatório do período {month.split("-").reverse().join("/")}
        </p>
        <div className="toolbar-end">
          <button
            className="btn"
            onClick={async () => {
              try {
                const XLSX = await import("xlsx");
                const sheet = XLSX.utils.aoa_to_sheet([
                  ["Data", "Descrição", "Tipo", "Categoria", "Valor (BRL)"],
                  ...monthTx.map((e) => [
                    e.data.date,
                    e.data.description,
                    e.data.type,
                    e.data.category,
                    Number(e.data.amount),
                  ]),
                ]);
                const book = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(book, sheet, "Movimentações");
                await saveExport(
                  new Uint8Array(
                    XLSX.write(book, { bookType: "xlsx", type: "array" }),
                  ),
                  `my-horizon-relatorio-${month}.xlsx`,
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                );
              } catch {
                useFinance
                  .getState()
                  .message(
                    "Não foi possível exportar o Excel. Tente novamente.",
                  );
              }
            }}
          >
            Exportar Excel
          </button>
          <button className="btn" onClick={() => window.print()}>
            Imprimir / salvar PDF
          </button>
          <button
            className="btn primary"
            onClick={() =>
              csvExport(
                ["Data", "Descrição", "Tipo", "Categoria", "Valor"],
                monthTx.map((e) => [
                  e.data.date,
                  e.data.description,
                  e.data.type,
                  e.data.category,
                  e.data.amount,
                ]),
                `relatorio-${month}.csv`,
              )
            }
          >
            Exportar relatório
          </button>
        </div>
      </div>
      <div className="stats-grid">
        <Stat label="Patrimônio líquido" value={t.netWorth} />
        <Stat label="Saldo disponível" value={t.available} />
        <Stat label="Total investido" value={t.invested} />
        <Stat label="Faturas comprometidas" value={t.committed} />
      </div>
      <div className="panel">
        <div className="panel-title">
          <div>
            <h3>Projeção de caixa · 60 meses</h3>
            <p>
              Saldo atual + lançamentos futuros cadastrados + faturas em aberto.
              Transferências próprias não geram renda.
            </p>
          </div>
        </div>
        <div className="chart tall">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={p}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" minTickGap={60} tick={{ fontSize: 11 }} />
              <YAxis
                tickFormatter={(v) => `${number(v / 1000, 0)}k`}
                tick={{ fontSize: 11 }}
              />
              <Tooltip formatter={(v) => money(Number(v))} />
              <Area
                type="monotone"
                dataKey="balance"
                name="Saldo projetado"
                stroke="#2563eb"
                fill="#dbeafe"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="dashboard-middle">
        <div className="panel">
          <h3>Entradas e saídas futuras</h3>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={p.slice(0, 12)}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Legend />
                <Bar
                  dataKey="income"
                  name="Entradas"
                  fill="#20ac87"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="expense"
                  name="Saídas"
                  fill="#7ca4f8"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel">
          <h3>Despesas por categoria</h3>
          {t.byCategory.length ? (
            t.byCategory.map((c) => (
              <div className="report-row" key={c.name}>
                <span>{c.name}</span>
                <strong>{money(c.value)}</strong>
                <span className="muted">
                  {number((c.value / t.expense) * 100)}%
                </span>
              </div>
            ))
          ) : (
            <Empty text="Sem despesas confirmadas no período." />
          )}
          <hr />
          <div className="split">
            <strong>Resultado do período</strong>
            <strong className={t.saving >= 0 ? "positive" : "negative"}>
              {money(t.saving)}
            </strong>
          </div>
        </div>
      </div>
      <div className="panel">
        <h3>Agenda de previsões</h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Entradas</th>
                <th>Saídas</th>
                <th>Saldo projetado</th>
              </tr>
            </thead>
            <tbody>
              {p.slice(0, 24).map((m) => (
                <tr key={m.month}>
                  <td>{m.label}</td>
                  <td>{money(m.income)}</td>
                  <td>{money(m.expense)}</td>
                  <td className={m.balance < 0 ? "negative" : ""}>
                    {money(m.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
