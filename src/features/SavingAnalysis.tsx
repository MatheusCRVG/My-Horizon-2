import { useState } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Target,
  Plane,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  Pencil,
  Trash2,
  CalendarDays,
} from "lucide-react";
import { Modal, Progress, Stat } from "../components/ui";
import { useFinance } from "../core/store";
import {
  addMonths,
  dateLabel,
  money,
  number,
  rows,
  today,
  type Entity,
} from "../core/model";
import {
  contributionSeries,
  confirmedMovements,
  monthEnd,
  objectives,
  totalReserved,
  type ProjectionRow,
} from "../core/contributions";
import {
  savingSummary,
  targetValue,
  tripScenarios,
} from "../core/saving-targets";
import { ContributionForm, saveContribution } from "./ContributionForm";
import { PlanEditor, dateConvention } from "./SavingPlanner";
import { WithdrawalForm } from "./WithdrawalForm";

const monthLabel = (v: string) =>
  new Date(v + "-01T12:00:00").toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
const axisValue = (v: number) =>
  Math.abs(v) < 1000 ? number(v, 0) : `${number(v / 1000, 1)}k`;
export function SavingChart({
  data,
  mode = "line",
}: {
  data: ReturnType<typeof contributionSeries>;
  mode?: "line" | "bar";
}) {
  return (
    <div
      className="saving-chart"
      role="img"
      aria-label={
        mode === "bar"
          ? "Aportes planejados e realizados por mês"
          : "Evolução acumulada dos aportes planejados e realizados"
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        {mode === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="month"
              tickFormatter={monthLabel}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={axisValue}
              tick={{ fontSize: 12 }}
              width={48}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              labelFormatter={(v) => monthLabel(String(v))}
              formatter={(v) => money(Number(v))}
            />
            <Legend />
            <Bar
              isAnimationActive={false}
              dataKey="planned"
              name="Planejado"
              fill="#d9e3f2"
              radius={[5, 5, 0, 0]}
            />
            <Bar
              isAnimationActive={false}
              dataKey="actual"
              name="Realizado"
              fill="#1764ff"
              radius={[5, 5, 0, 0]}
            />
          </BarChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="month"
              tickFormatter={monthLabel}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={axisValue}
              tick={{ fontSize: 12 }}
              width={48}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              labelFormatter={(v) => monthLabel(String(v))}
              formatter={(v) => money(Number(v))}
            />
            <Legend />
            <Line
              isAnimationActive={false}
              dataKey="accumulatedPlanned"
              name="Planejado acumulado"
              stroke="#a5b6d0"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
            />
            <Line
              isAnimationActive={false}
              dataKey="accumulatedActual"
              name="Realizado acumulado"
              stroke="#1764ff"
              strokeWidth={3}
              dot={{ r: 3 }}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
export function ProjectionChart({ data }: { data: ProjectionRow[] }) {
  return (
    <div
      className="saving-chart projection-chart"
      role="img"
      aria-label="Projeção mensal: saldo inicial, aportes acumulados e rendimentos estimados"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="month"
            tickFormatter={monthLabel}
            tick={{ fontSize: 12 }}
            minTickGap={30}
          />
          <YAxis tickFormatter={axisValue} tick={{ fontSize: 12 }} width={48} />
          <Tooltip
            labelFormatter={(v) => monthLabel(String(v))}
            formatter={(v) => money(Number(v))}
          />
          <Legend />
          <Area
            isAnimationActive={false}
            stackId="s"
            dataKey="initial"
            name="Saldo inicial simulado"
            stroke="#a9b8cd"
            fill="#e5ebf3"
          />
          <Area
            isAnimationActive={false}
            stackId="s"
            dataKey="contributions"
            name="Aportes acumulados"
            stroke="#1764ff"
            fill="#abc6ff"
          />
          <Area
            isAnimationActive={false}
            stackId="s"
            dataKey="interest"
            name="Rendimentos hipotéticos"
            stroke="#18aa88"
            fill="#b7e8dc"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function SavingCard({
  goal,
  onPlan,
  onRegister,
  onAnalysis,
  controls,
}: {
  goal: Entity;
  onPlan: () => void;
  onRegister: () => void;
  onAnalysis: () => void;
  controls?: React.ReactNode;
}) {
  const { doc, edit, message } = useFinance();
  const s = savingSummary(doc!, goal),
    isTrip = goal.kind === "trip";
  return (
    <article className="panel record-card saving-card">
      <div className="card-top">
        <span className="tile-icon">
          {isTrip ? <Plane size={21} /> : <Target size={21} />}
        </span>
        {controls}
      </div>
      <div className="saving-card-heading">
        <div>
          {isTrip && (
            <span className="eyebrow">
              {goal.data.country} · {dateLabel(goal.data.start)}
            </span>
          )}
          <h3>{goal.data.name}</h3>
        </div>
        <span className={`pill ${s.remaining === 0 ? "positive" : ""}`}>
          {s.remaining === 0 ? "Concluída" : `${number(s.percent)}% concluído`}
        </span>
      </div>
      {isTrip && (
        <label className="trip-scenario-label">
          Cenário da viagem
          <select
            aria-label={`Cenário de ${goal.data.name}`}
            value={goal.data.scenario ?? "standard"}
            onChange={async (e) => {
              try {
                await edit([
                  { ...goal, data: { ...goal.data, scenario: e.target.value } },
                ]);
              } catch (err) {
                message((err as Error).message);
              }
            }}
          >
            {tripScenarios.map((o) => (
              <option value={o.value} key={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="goal-values">
        <strong>{money(s.saved)}</strong>
        <span>
          guardados de {money(s.target)}
          {isTrip ? " estimados" : ""}
        </span>
      </div>
      <Progress value={s.percent} />
      <p className="saving-remaining">
        Faltam <strong>{money(s.remaining)}</strong>
      </p>
      <div className="saving-card-metrics">
        <div>
          <span>Aporte mensal planejado</span>
          <strong>
            {s.configured ? money(s.monthlyPlanned) : "Definir plano"}
          </strong>
        </div>
        <div>
          <span>Aporte mensal necessário</span>
          <strong>
            {s.required === null ? "Revise o prazo" : money(s.required)}
          </strong>
        </div>
        <div>
          <span>Conclusão estimada</span>
          <strong>
            {s.completion ? dateLabel(s.completion) : "Sem previsão"}
          </strong>
        </div>
        <div>
          <span>{isTrip ? "Data da viagem" : "Data desejada"}</span>
          <strong>{dateLabel(s.desired)}</strong>
        </div>
      </div>
      <p
        className={`saving-date-state ${s.remaining === 0 || s.meetsDate ? "positive" : "muted"}`}
      >
        <CalendarDays size={15} />
        {s.remaining === 0
          ? "Objetivo atingido. Seu histórico está preservado."
          : !s.configured
            ? "Defina os aportes para conferir seu prazo."
            : s.desired && s.desired < today()
              ? "O prazo venceu. Atualize seu planejamento."
              : s.meetsDate
                ? "O plano atende à data desejada, pela estimativa atual."
                : "O plano precisa de ajuste para atender à data desejada."}
      </p>
      <div className="saving-card-actions">
        <button className="btn" onClick={onPlan}>
          Planejar aportes
        </button>
        <button className="btn primary" onClick={onRegister}>
          <Plus size={16} />
          Registrar aporte
        </button>
        <button className="text-btn" onClick={onAnalysis}>
          Ver evolução
          <ArrowUpRight size={15} />
        </button>
      </div>
    </article>
  );
}
export function SavingAnalysis({
  goal: original,
  onBack,
  fixedGoal = false,
}: {
  goal?: Entity;
  onBack?: () => void;
  fixedGoal?: boolean;
}) {
  const { doc } = useFinance();
  const goals = objectives(doc!);
  const [selected, setSelected] = useState(original?.id ?? "");
  const [from, setFrom] = useState(addMonths(today(), -5, 1));
  const [to, setTo] = useState(today());
  const [plan, setPlan] = useState<Entity | null>(null),
    [entry, setEntry] = useState<Entity | true | null>(null),
    [deleting, setDeleting] = useState<Entity | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const goal = goals.find((g) => g.id === selected);
  const filtered = goal ? [goal] : goals;
  const data = contributionSeries(doc!, filtered, from, to);
  const elapsed = data.filter((e) => e.month <= today().slice(0, 7));
  const total = data.reduce((s, e) => s + e.deposits, 0);
  const due = contributionSeries(
    doc!,
    filtered,
    from,
    to < today() ? to : today(),
  ).at(-1);
  const delta = (due?.accumulatedActual ?? 0) - (due?.accumulatedPlanned ?? 0);
  const thisMonth = contributionSeries(
    doc!,
    filtered,
    today().slice(0, 7) + "-01",
    monthEnd(today().slice(0, 7)),
  )[0];
  const missingMonth = Math.max(
    0,
    (thisMonth?.planned ?? 0) - (thisMonth?.actual ?? 0),
  );
  const history = rows(doc!, "contribution")
    .filter(
      (e) =>
        filtered.some((g) => g.id === e.data.goalId) &&
        e.data.date >= from &&
        e.data.date <= to,
    )
    .sort((a, b) => b.data.date.localeCompare(a.data.date));
  const summary = goal ? savingSummary(doc!, goal) : null;
  return (
    <div className="saving-analysis">
      <div className="panel-title">
        <div>
          {onBack && (
            <button className="text-btn" onClick={onBack}>
              <ArrowLeft size={16} />
              Voltar aos objetivos
            </button>
          )}
          <span className="eyebrow">SEU PLANO, NA PRÁTICA</span>
          <h2>Evolução dos aportes</h2>
          <p>
            {goal?.data.name ?? "Todas as metas e viagens"} · acompanhe o que
            foi planejado e o que já aconteceu.
          </p>
        </div>
        <div className="button-row">
          {goal && !fixedGoal && (
            <button className="btn" onClick={() => setPlan(goal)}>
              Planejar aportes
            </button>
          )}
          <button
            className="btn primary"
            disabled={!goals.length}
            onClick={() => setEntry(true)}
          >
            <Plus size={16} />
            Registrar aporte
          </button>
        </div>
      </div>
      <div className="saving-analysis-filters">
        <label>
          Filtrar por meta
          <select
            disabled={fixedGoal}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Todas as metas e viagens</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.data.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {from > to && (
        <p className="error-box">
          A data inicial deve ser anterior à data final.
        </p>
      )}
      <div className="stats-grid three">
        <Stat
          label="Aportado no período"
          value={total}
          tone="blue"
          detail="Somente aportes confirmados"
        />
        <Stat
          label="Média mensal no período"
          value={elapsed.length ? total / elapsed.length : 0}
          detail={`${elapsed.length} mês(es) até hoje, incluindo meses sem aporte`}
        />
        <Stat
          label="Valor restante"
          value={filtered.reduce(
            (s, g) => s + savingSummary(doc!, g).remaining,
            0,
          )}
          detail={
            summary
              ? `Conclusão estimada: ${summary.completion ? dateLabel(summary.completion) : "sem previsão"}`
              : "Soma do que falta para os objetivos selecionados"
          }
        />
      </div>
      <div className="saving-messages">
        <p className="info-box">
          {delta >= 0.005
            ? `Você está ${money(delta)} acima do planejado`
            : delta <= -0.005
              ? `Você está ${money(-delta)} abaixo do planejado`
              : "Seus aportes estão em linha com o planejado"}{" "}
          no período até hoje.
        </p>
        <p className="info-box">
          {missingMonth > 0.005
            ? `Faltam ${money(missingMonth)} para completar o aporte deste mês.`
            : (thisMonth?.planned ?? 0) > 0
              ? "Você completou o aporte planejado deste mês."
              : "Ainda não há aportes planejados para este mês."}
        </p>
      </div>
      <div className="saving-analysis-charts">
        <section className="panel">
          <h3>Planejado versus realizado</h3>
          <p className="muted">
            Aportes acumulados no período. O saldo inicial reservado não entra
            neste gráfico.
          </p>
          <SavingChart data={data} />
        </section>
        <section className="panel">
          <h3>Aportes realizados por mês</h3>
          <p className="muted">
            Compare as reservas confirmadas com o plano mensal.
          </p>
          <SavingChart data={data} mode="bar" />
        </section>
      </div>
      {summary && (
        <section className="panel saving-analysis-summary">
          <div>
            <span>Saldo inicial reservado</span>
            <strong>{money(goal!.data.saved ?? 0)}</strong>
          </div>
          <div>
            <span>Já guardado, com aportes</span>
            <strong>{money(summary.saved)}</strong>
          </div>
          <div>
            <span>Aporte mensal necessário</span>
            <strong>
              {summary.required === null
                ? "Revise o prazo"
                : money(summary.required)}
            </strong>
          </div>
          <div>
            <span>Conclusão estimada</span>
            <strong>{dateLabel(summary.completion ?? "")}</strong>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>Histórico de aportes e retiradas</h3>
            <p>Editar ou excluir atualiza a reserva e as estimativas.</p>
          </div>
          <span className="pill">{history.length} registro(s)</span>
        </div>
        {!history.length ? (
          <p className="muted calm">
            Nenhum aporte neste período. Os saldos anteriores continuam
            preservados como reserva inicial.
          </p>
        ) : (
          <div className="saving-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição e objetivo</th>
                  <th>Status</th>
                  <th>Valor</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {history.map((e) => (
                  <tr key={e.id}>
                    <td>{dateLabel(e.data.date)}</td>
                    <td>
                      <strong>{e.data.description}</strong>
                      <small>
                        {goals.find((g) => g.id === e.data.goalId)?.data.name}
                        {e.data.direction === "withdrawal"
                          ? " · Retirada"
                          : e.data.extra
                            ? " · Extra"
                            : ""}
                        {e.data.transactionId ? " · Vinculado" : ""}
                      </small>
                    </td>
                    <td>
                      <span className="pill">
                        {e.data.status === "confirmed"
                          ? confirmedMovements(doc!).some((c) => c.id === e.id)
                            ? "Confirmado"
                            : "Vínculo pendente"
                          : "Previsto"}
                      </span>
                    </td>
                    <td
                      className={
                        e.data.direction === "withdrawal"
                          ? "negative"
                          : "positive"
                      }
                    >
                      {e.data.direction === "withdrawal" ? "− " : ""}
                      {money(e.data.amount)}
                    </td>
                    <td>
                      <div className="button-row">
                        <button
                          className="icon-btn"
                          aria-label={`Editar ${e.data.direction === "withdrawal" ? "retirada" : "aporte"} ${e.data.description}`}
                          onClick={() => setEntry(e)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          aria-label={`Excluir ${e.data.direction === "withdrawal" ? "retirada" : "aporte"} ${e.data.description}`}
                          onClick={() => {
                            setError("");
                            setDeleting(e);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <details className="panel">
        <summary>Valores mensais e convenção de datas</summary>
        <p className="footnote">
          {dateConvention} Alterações de planejamento valem a partir da data da
          revisão; períodos anteriores preservam o plano salvo.
        </p>
        <div className="saving-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Planejado</th>
                <th>Realizado</th>
                <th>Diferença</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.month}>
                  <td>{monthLabel(r.month)}</td>
                  <td>{money(r.planned)}</td>
                  <td>{money(r.actual)}</td>
                  <td>{money(r.actual - r.planned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {plan && <PlanEditor goal={plan} onClose={() => setPlan(null)} />}
      {entry && entry !== true && entry.data.direction === "withdrawal" ? (
        <WithdrawalForm
          goal={goals.find((g) => g.id === entry.data.goalId)!}
          entity={entry}
          onClose={() => setEntry(null)}
        />
      ) : (
        entry && (
          <ContributionForm
            goal={goal}
            entity={entry === true ? undefined : entry}
            onClose={() => setEntry(null)}
          />
        )
      )}
      {deleting && (
        <Modal title="Excluir aporte?" onClose={() => setDeleting(null)}>
          <p>
            {money(deleting.data.amount)}{" "}
            {deleting.data.direction === "withdrawal"
              ? "voltará para a reserva de"
              : "será retirado da reserva de"}{" "}
            {goals.find((g) => g.id === deleting.data.goalId)?.data.name}. A
            movimentação bancária vinculada será preservada.
          </p>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="btn" onClick={() => setDeleting(null)}>
              Voltar
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const g = goals.find((g) => g.id === deleting.data.goalId)!;
                  await saveContribution(g, deleting, true);
                  setDeleting(null);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Excluir aporte
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
export function SavingsDashboard({
  month,
  navigate,
}: {
  month: string;
  navigate: (p: string) => void;
}) {
  const { doc } = useFinance();
  const goals = objectives(doc!);
  const [register, setRegister] = useState(false),
    [analysis, setAnalysis] = useState(false);
  const data = contributionSeries(
    doc!,
    goals,
    addMonths(month + "-01", -5),
    monthEnd(month),
  );
  const current = data.at(-1),
    target = goals.reduce((s, g) => s + targetValue(g), 0),
    saved = totalReserved(doc!);
  const pct = target ? Math.min(100, (saved / target) * 100) : 0;
  return (
    <section className="panel savings-dashboard">
      <div className="savings-dashboard-main">
        <div className="panel-title">
          <div>
            <span className="eyebrow">UM PASSO A CADA MÊS</span>
            <h3>Seus aportes, em perspectiva</h3>
          </div>
          <span className="tile-icon">
            <Target size={21} />
          </span>
        </div>
        <div className="savings-dashboard-numbers">
          <div>
            <span>Aportado no mês</span>
            <strong>{money(current?.deposits ?? 0)}</strong>
          </div>
          <div>
            <span>Planejado para o mês</span>
            <strong>{money(current?.planned ?? 0)}</strong>
          </div>
          <div>
            <span>Progresso dos objetivos</span>
            <strong>{number(pct)}%</strong>
          </div>
        </div>
        <Progress value={pct} />
        <p className="muted">
          {money(saved)} reservados em {goals.length} objetivo(s). Planos
          previstos não alteram o saldo.
        </p>
        <div className="button-row">
          <button
            className="btn primary"
            onClick={() =>
              goals.length ? setRegister(true) : navigate("goal")
            }
          >
            <Plus size={16} />
            Registrar aporte
          </button>
          <button className="text-btn" onClick={() => setAnalysis(true)}>
            Análise completa
            <ArrowUpRight size={16} />
          </button>
        </div>
      </div>
      <div className="savings-dashboard-chart">
        <span className="muted">
          Últimos seis meses · planejado e realizado
        </span>
        <SavingChart data={data} mode="bar" />
      </div>
      {register && <ContributionForm onClose={() => setRegister(false)} />}
      {analysis && (
        <Modal title="Análise dos aportes" onClose={() => setAnalysis(false)}>
          <SavingAnalysis />
        </Modal>
      )}
    </section>
  );
}
