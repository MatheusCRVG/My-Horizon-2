import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useId } from "react";
import { addMonths, money, type Document } from "../core/model";
import { totals } from "../core/finance";
export function monthlySeries(
  doc: Document,
  month: string,
  account = "",
  category = "",
) {
  return Array.from({ length: 6 }, (_, i) => {
    const date = addMonths(month + "-01", i - 5, 1);
    const m = date.slice(0, 7);
    const t = totals(doc, m, account, category);
    return {
      month: m,
      label: new Date(date + "T12:00:00")
        .toLocaleDateString("pt-BR", { month: "short" })
        .replace(".", ""),
      income: t.income,
      expense: t.expense,
      saving: t.saving,
    };
  });
}
export type Series = ReturnType<typeof monthlySeries>;
export function MiniChart({
  data,
  dataKey,
  color,
  style = "area",
}: {
  data: Series;
  dataKey: "income" | "expense" | "saving";
  color: string;
  style?: "area" | "bar";
}) {
  const id = useId().replace(/:/g, "");
  return (
    <div className="mini-finance-chart" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        {style === "bar" ? (
          <BarChart
            data={data}
            margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
          >
            <Bar
              dataKey={dataKey}
              fill={color}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
              maxBarSize={14}
            />
          </BarChart>
        ) : (
          <AreaChart
            data={data}
            margin={{ top: 5, right: 1, left: 1, bottom: 0 }}
          >
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity={0.2} />
                <stop offset="1" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              dataKey={dataKey}
              type="monotone"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${id})`}
              isAnimationActive={false}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
export function FlowChart({
  data,
  hero = false,
}: {
  data: Series;
  hero?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <div className={hero ? "hero-flow-chart" : "income-flow-chart"}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 12, right: 6, bottom: 0, left: hero ? -20 : 0 }}
          barGap={hero ? 0 : 5}
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={hero ? "#eef3ff" : "#739cff"} />
              <stop offset="1" stopColor={hero ? "#97b5f6" : "#4c7ff4"} />
            </linearGradient>
          </defs>
          {!hero && (
            <CartesianGrid
              vertical={false}
              stroke="var(--line)"
              strokeDasharray="3 5"
            />
          )}
          <XAxis
            dataKey="label"
            axisLine={!hero ? false : { stroke: "#ffffff25" }}
            tickLine={false}
            tick={{ fill: hero ? "#acb8c9" : "#8d97a7", fontSize: 12 }}
            dy={8}
          />
          <Tooltip
            formatter={(v) => money(Number(v))}
            cursor={{ fill: hero ? "#ffffff06" : "#f4f7fc" }}
            contentStyle={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              fontSize: 12,
              color: "var(--text)",
            }}
          />
          {hero ? (
            <Bar
              dataKey="saving"
              name="Movimentação líquida"
              fill={`url(#${id})`}
              radius={[5, 5, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
          ) : (
            <>
              <Bar
                dataKey="income"
                name="Receitas"
                fill={`url(#${id})`}
                radius={[5, 5, 0, 0]}
                maxBarSize={24}
                isAnimationActive={false}
              />
              <Bar
                dataKey="expense"
                name="Despesas"
                fill="#dbe3ef"
                radius={[5, 5, 0, 0]}
                maxBarSize={24}
                isAnimationActive={false}
              />
            </>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
