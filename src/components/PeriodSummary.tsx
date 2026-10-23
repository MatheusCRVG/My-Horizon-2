import { ArrowDownLeft, ArrowUpRight, TrendingUp } from "lucide-react";
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useFinance } from "../core/store";
import { totals } from "../core/finance";
import { money } from "../core/model";
import { monthlySeries, MiniChart } from "./FinanceCharts";
export function PeriodSummary({
  month,
  account,
  category,
}: {
  month: string;
  account: string;
  category: string;
}) {
  const { doc } = useFinance();
  const t = totals(doc!, month, account, category);
  const series = monthlySeries(doc!, month, account, category);
  const prior = series.at(-2)!;
  const trend = (current: number, previous: number) =>
    previous === 0
      ? "Sem base de comparação anterior"
      : `${current >= previous ? "+" : ""}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(((current - previous) / Math.abs(previous)) * 100)}% em relação ao mês anterior`;
  return (
    <div className="transaction-summary">
      <article className="panel period-balance">
        <div>
          <span>Visão financeira do período</span>
          <strong>{money(t.saving)}</strong>
          <p>Saldo do mês</p>
          <small className={t.saving >= prior.saving ? "positive" : "negative"}>
            {trend(t.saving, prior.saving)}
          </small>
        </div>
        <div className="period-balance-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={series}
              margin={{ top: 30, left: 2, right: 8, bottom: 0 }}
            >
              <defs>
                <linearGradient id="periodFlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#1463ff" stopOpacity={0.18} />
                  <stop offset="1" stopColor="#1463ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "#8a96aa" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(v) => money(Number(v))}
                contentStyle={{
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Area
                dataKey="saving"
                name="Saldo do mês"
                type="monotone"
                stroke="#1463ff"
                strokeWidth={2}
                fill="url(#periodFlow)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </article>
      {[
        {
          label: "Receitas confirmadas",
          value: t.income,
          prior: prior.income,
          key: "income" as const,
          tone: "green",
          color: "#a5e8d4",
          icon: ArrowUpRight,
        },
        {
          label: "Despesas confirmadas",
          value: t.expense,
          prior: prior.expense,
          key: "expense" as const,
          tone: "red",
          color: "#f8b8c3",
          icon: ArrowDownLeft,
        },
        {
          label: "Economia no período",
          value: t.saving,
          prior: prior.saving,
          key: "saving" as const,
          tone: "blue",
          color: "#2268ff",
          icon: TrendingUp,
        },
      ].map((s) => (
        <article className={`stat summary-stat ${s.tone}`} key={s.key}>
          <span className="stat-icon">
            <s.icon size={21} />
          </span>
          <span className="summary-label">{s.label}</span>
          <strong>{money(s.value)}</strong>
          <small>{trend(s.value, s.prior)}</small>
          <MiniChart
            data={series}
            dataKey={s.key}
            color={s.color}
            style={s.key === "saving" ? "area" : "bar"}
          />
        </article>
      ))}
    </div>
  );
}
