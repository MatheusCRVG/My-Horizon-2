import { useEffect, useState } from "react";
import { PriceReferenceManager } from "./PriceReferenceManager";
import {
  Plus,
  ArrowUpRight,
  ArrowLeft,
  Star,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Pencil,
  Archive,
  RotateCcw,
  Check,
  Wallet,
  Target,
  CalendarDays,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useFinance } from "../core/store";
import {
  addMonths,
  dateLabel,
  money,
  number,
  today,
  type Entity,
} from "../core/model";
import {
  objectives,
  reservedValue,
  monthEnd,
  revisedPlan,
  validatePlan,
  fundedOccurrences,
  manualPlannedStreams,
} from "../core/contributions";
import { resolvePlan } from "../core/plan-resolution";
import { goalMovementRevision } from "../core/merge";
import {
  horizonCategory,
  horizonCategories,
  isFeatured,
  horizonStatus,
} from "../core/horizons";
import {
  savingSummary,
  targetValue,
  tripScenarios,
} from "../core/saving-targets";
import { HorizonCover } from "../components/HorizonCover";
import { Modal, Progress, Empty, Stat, csvExport } from "../components/ui";
import { RecordForm, Allocation, DeleteModal } from "./Records";
import { ContributionForm } from "./ContributionForm";
import { WithdrawalForm } from "./WithdrawalForm";
import { SavingAnalysis } from "./SavingAnalysis";
import { PlanEditor, dateConvention } from "./SavingPlanner";
import { HorizonPlanningSection } from "./HorizonBudget";

export function HorizonCard({
  goal,
  onOpen,
  onAdd,
  onPlan,
}: {
  goal: Entity;
  onOpen: () => void;
  onAdd: () => void;
  onPlan?: () => void;
}) {
  const { doc, edit, message } = useFinance();
  const [scenarioChange, setScenarioChange] = useState<{
    scenario: string;
    goal: Entity;
    movements: string;
  } | null>(null);
  const s = savingSummary(doc!, goal),
    c = horizonCategory(goal),
    pct = s.target ? (s.saved / s.target) * 100 : 0;
  return (
    <article
      className={`horizon-card saving-card ${s.remaining === 0 ? "completed" : ""}`}
      data-horizon-id={goal.id}
    >
      <div className="horizon-card-picture">
        <button
          className="cover-open"
          onClick={onOpen}
          aria-label={`Abrir horizonte ${goal.data.name}`}
        >
          <HorizonCover goal={goal} />
        </button>
        <span className="horizon-category">{c.label}</span>
        <button
          className={`horizon-favorite ${isFeatured(goal) ? "selected" : ""}`}
          aria-label={`${isFeatured(goal) ? "Remover dos" : "Adicionar aos"} favoritos: ${goal.data.name}`}
          aria-pressed={isFeatured(goal)}
          onClick={async () => {
            try {
              await edit([
                {
                  ...goal,
                  data: { ...goal.data, featured: !isFeatured(goal) },
                },
              ]);
            } catch (err) {
              message((err as Error).message);
            }
          }}
        >
          <Star size={18} fill={isFeatured(goal) ? "currentColor" : "none"} />
        </button>
        {s.remaining === 0 && (
          <span className="horizon-done">
            <Check size={14} />
            Concluído
          </span>
        )}
      </div>
      <div className="horizon-card-content">
        <button className="horizon-name" onClick={onOpen}>
          <h3>{goal.data.name}</h3>
          <ArrowUpRight size={17} />
        </button>
        <div className="goal-values">
          <strong>{money(s.saved)}</strong>
          <span>
            de {money(s.target)}
            {goal.kind === "trip" ? " estimados" : ""}
          </span>
        </div>
        <div className="horizon-progress-label">
          <span>{number(pct)}% conquistado</span>
          <span>
            {s.excess > 0
              ? `${money(s.excess)} além da meta`
              : s.remaining === 0
                ? "Você chegou lá"
                : `Faltam ${money(s.remaining)}`}
          </span>
        </div>
        <Progress value={pct} />
        <div className="horizon-card-facts">
          <span>
            {s.desired
              ? `Até ${dateLabel(s.desired)}`
              : s.completion && s.remaining > 0
                ? `Previsão ${dateLabel(s.completion)}`
                : "No seu ritmo · sem prazo"}
          </span>
          {s.configured && (
            <strong>{money(s.monthlyPlanned)}/mês planejados</strong>
          )}
        </div>
        {goal.kind === "trip" && (
          <label className="trip-scenario-label">
            Cenário da viagem
            <select
              aria-label={`Cenário de ${goal.data.name}`}
              value={goal.data.scenario ?? "standard"}
              onChange={(e) =>
                setScenarioChange({
                  scenario: e.target.value,
                  goal,
                  movements: goalMovementRevision(doc!, goal.id),
                })
              }
            >
              {tripScenarios.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="horizon-card-actions">
          <button className="btn primary" onClick={onAdd}>
            <Plus size={16} />
            Adicionar dinheiro
          </button>
          <button className="btn" onClick={onOpen}>
            Ver horizonte
          </button>
        </div>
        {onPlan && (
          <button className="text-btn horizon-plan-link" onClick={onPlan}>
            Planejar aportes
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>
      {scenarioChange && (
        <LegacyScenarioReview
          goal={scenarioChange.goal}
          scenario={scenarioChange.scenario}
          movements={scenarioChange.movements}
          onClose={() => setScenarioChange(null)}
        />
      )}
    </article>
  );
}
function LegacyScenarioReview({
  goal,
  scenario,
  movements,
  onClose,
}: {
  goal: Entity;
  scenario: string;
  movements: string;
  onClose: () => void;
}) {
  const { doc, edit, message } = useFinance();
  const [adapt, setAdapt] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const candidate = { ...goal, data: { ...goal.data, scenario } };
  return (
    <Modal title="Confirmar cenário da viagem" onClose={onClose}>
      <div className="budget-change-summary">
        <div>
          <span>Meta atual</span>
          <strong>{money(targetValue(goal))}</strong>
        </div>
        <ArrowUpRight size={21} />
        <div>
          <span>Nova meta estimada</span>
          <strong>{money(targetValue(candidate))}</strong>
        </div>
      </div>
      <p className="info-box">
        O cenário é uma hipótese sobre o orçamento original. O saldo guardado,
        os aportes e as retiradas serão preservados.
      </p>
      {goal.data.plan && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={adapt}
            onChange={(e) => setAdapt(e.target.checked)}
          />
          Recalcular os aportes mantendo minha estratégia
        </label>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="btn" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              let data: Entity["data"] = {
                ...candidate.data,
                tripBudgetHistory: [
                  ...(goal.data.tripBudgetHistory ?? []),
                  {
                    at: new Date().toISOString(),
                    scenario: goal.data.scenario,
                    target: targetValue(goal),
                  },
                ],
              };
              if (adapt && goal.data.plan) {
                const plan = resolvePlan(
                  goal.data.plan,
                  targetValue(candidate),
                  reservedValue(doc!, goal),
                  today(),
                  fundedOccurrences(doc!, goal.id),
                  manualPlannedStreams(doc!, goal.id),
                );
                validatePlan(plan);
                data = revisedPlan({ ...candidate, data }, plan);
              }
              await edit([
                {
                  id: goal.id,
                  kind: goal.kind,
                  data,
                  expectedVector: goal.vector,
                  expectedMovements: movements,
                },
              ]);
              message("Cenário atualizado. Histórico preservado.");
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Salvando…" : "Confirmar atualização"}
        </button>
      </div>
    </Modal>
  );
}
export function HorizonDetails({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const { doc, edit, message } = useFinance();
  const goal = objectives(doc!).find((g) => g.id === id);
  const [action, setAction] = useState<
      "add" | "withdraw" | "edit" | "plan" | "archive" | "delete" | null
    >(null),
    [busy, setBusy] = useState(false);
  if (!goal)
    return (
      <section className="panel">
        <Empty
          title="Este horizonte não está mais disponível"
          text="Volte à lista para continuar."
        />
        <button className="btn" onClick={onBack}>
          Voltar aos horizontes
        </button>
      </section>
    );
  const s = savingSummary(doc!, goal),
    category = horizonCategory(goal);
  const real = Array.from({ length: 6 }, (_, i) => {
    const month = addMonths(today(), i - 5, 1).slice(0, 7);
    return {
      month,
      balance: reservedValue(
        doc!,
        goal,
        monthEnd(month) < today() ? monthEnd(month) : today(),
      ),
    };
  });
  const forecast = s.projection.slice(0, 13);
  return (
    <div className="horizon-detail" data-horizon-id={id}>
      <div className="horizon-detail-top">
        <button className="text-btn" onClick={onBack}>
          <ArrowLeft size={17} />
          Voltar aos horizontes
        </button>
        <div className="button-row">
          <button className="btn" onClick={() => setAction("edit")}>
            <Pencil size={15} />
            Editar horizonte
          </button>
          <button className="btn" onClick={() => setAction("archive")}>
            {goal.data.archived ? (
              <RotateCcw size={15} />
            ) : (
              <Archive size={15} />
            )}{" "}
            {goal.data.archived ? "Restaurar" : "Arquivar"}
          </button>
        </div>
      </div>
      <div className="horizon-detail-cover">
        <HorizonCover goal={goal} large />
        <span className="horizon-category">{category.label}</span>
      </div>
      <section className="panel horizon-detail-main">
        <div className="horizon-detail-heading">
          <div>
            <span className="eyebrow">
              {goal.data.archived
                ? "HORIZONTE ARQUIVADO"
                : s.remaining === 0
                  ? "UMA CONQUISTA SUA"
                  : "CADA PASSO APROXIMA VOCÊ"}
            </span>
            <h2>{goal.data.name}</h2>
            {goal.data.notes && <p>{goal.data.notes}</p>}
            <p>
              {s.desired
                ? `Seu horizonte até ${dateLabel(s.desired)}`
                : "Uma conquista no seu tempo, sem prazo definido."}
            </p>
          </div>
          {s.remaining === 0 && (
            <span className="horizon-completion">
              <Check size={19} />
              Você chegou lá
            </span>
          )}
        </div>
        <div className="horizon-detail-values">
          <div>
            <span>Já acumulado</span>
            <strong>{money(s.saved)}</strong>
          </div>
          <div>
            <span>
              {goal.data.planner
                ? "Valor total estimado"
                : `Valor desejado${goal.kind === "trip" ? " · estimado" : ""}`}
            </span>
            <strong>{money(s.target)}</strong>
          </div>
          <div>
            <span>
              {s.excess > 0 ? "Além do objetivo" : "Falta para chegar lá"}
            </span>
            <strong>{money(s.excess || s.remaining)}</strong>
          </div>
        </div>
        <Progress value={s.percent} />
        <div className="horizon-detail-progress">
          <strong>
            {number(s.target ? (s.saved / s.target) * 100 : 0)}% conquistado
          </strong>
          <span>
            {s.configured
              ? `${money(s.monthlyPlanned)}/mês planejados`
              : "Defina um ritmo de aportes para seu horizonte"}
          </span>
        </div>
        <div className="button-row">
          <button className="btn primary" onClick={() => setAction("add")}>
            <Plus size={17} />
            Adicionar dinheiro
          </button>
          <button
            className="btn"
            disabled={s.saved <= 0}
            onClick={() => setAction("withdraw")}
          >
            <Wallet size={17} />
            Registrar retirada
          </button>
          <button className="btn" onClick={() => setAction("plan")}>
            <Target size={17} />
            Planejar aportes
          </button>
          {s.remaining === 0 && (
            <button className="text-btn" onClick={() => setAction("edit")}>
              Aumentar objetivo
              <ArrowUpRight size={16} />
            </button>
          )}
        </div>
        <p className="horizon-reservation-note">
          Este dinheiro está reservado dentro do app. Adicionar ou retirar
          valores não cria receita, despesa ou movimentação bancária.
        </p>
      </section>
      <HorizonPlanningSection
        goal={goal}
        onLegacyEdit={() => setAction("edit")}
      />
      <PriceReferenceManager goal={goal} />
      <section className="panel horizon-next-contribution">
        <CalendarDays size={21} />
        <div>
          <span>Próximo aporte planejado</span>
          <strong>
            {s.upcoming[0]
              ? `${money(s.upcoming[0].amount)} · ${dateLabel(s.upcoming[0].date)}`
              : "Nenhum aporte futuro neste plano"}
          </strong>
          <small>Previsão; só será acumulado depois de registrado.</small>
        </div>
        <button className="text-btn" onClick={() => setAction("plan")}>
          Revisar aportes
        </button>
      </section>
      <section className="horizon-rhythm panel">
        <div>
          <h3>
            {!s.desired
              ? "No seu ritmo"
              : s.remaining === 0
                ? "Objetivo concluído"
                : s.desired < today()
                  ? "Vamos atualizar o prazo?"
                  : s.meetsDate
                    ? "Você está no caminho"
                    : "Seu plano pode precisar de um ajuste"}
          </h3>
          <p>
            {!s.desired
              ? "Sem prazo definido, você acompanha seu progresso sem alertas de atraso."
              : s.remaining === 0
                ? "Mantenha a conquista, arquive o horizonte ou escolha um novo valor desejado."
                : s.required === null
                  ? "Não há ocorrências mensais disponíveis até a data escolhida. Ajuste o prazo ou a data do primeiro aporte."
                  : `Pela estimativa sem rendimento, são necessários ${money(s.required)} por mês para cumprir o prazo, considerando o que já foi reservado e os complementares previstos.`}
          </p>
        </div>
        <div>
          <span>Conclusão estimada</span>
          <strong>
            {s.completion
              ? dateLabel(s.completion)
              : "Defina os próximos aportes"}
          </strong>
        </div>
      </section>
      <div className="horizon-evolution-grid">
        <section className="panel">
          <h3>Sua evolução real</h3>
          <p>Reserva inicial + aportes confirmados − retiradas.</p>
          <HorizonLine data={real} />
        </section>
        <section className="panel forecast-panel">
          <h3>
            O caminho à frente <span className="pill">Estimativa</span>
          </h3>
          <p>Projeção dos próximos 12 meses. Sem supor rendimento.</p>
          {s.configured || forecast.some((r) => r.monthly > 0) ? (
            <HorizonLine data={forecast} forecast />
          ) : (
            <div className="horizon-forecast-empty">
              <Target size={27} />
              <p>Escolha quanto guardar para visualizar o caminho.</p>
              <button className="text-btn" onClick={() => setAction("plan")}>
                Planejar aportes
              </button>
            </div>
          )}
        </section>
      </div>
      <details className="panel horizon-premises">
        <summary>Como calculamos este horizonte</summary>
        <p>
          {dateConvention} A reserva inicial anterior ao histórico é mostrada
          separadamente. Retiradas reduzem o reservado. A projeção é uma
          estimativa dos aportes configurados, não uma promessa de resultado.
        </p>
      </details>
      <SavingAnalysis key={goal.id} goal={goal} fixedGoal />
      <button className="text-btn negative" onClick={() => setAction("delete")}>
        Excluir horizonte
      </button>
      {action === "add" && (
        <ContributionForm goal={goal} onClose={() => setAction(null)} />
      )}
      {action === "withdraw" && (
        <WithdrawalForm goal={goal} onClose={() => setAction(null)} />
      )}
      {action === "edit" && (
        <RecordForm
          kind={goal.kind}
          entity={goal}
          onClose={() => setAction(null)}
        />
      )}
      {action === "plan" && (
        <PlanEditor goal={goal} onClose={() => setAction(null)} />
      )}
      {action === "delete" && (
        <DeleteModal entity={goal} onClose={() => setAction(null)} />
      )}
      {action === "archive" && (
        <Modal
          title={
            goal.data.archived ? "Restaurar horizonte?" : "Arquivar horizonte?"
          }
          onClose={() => setAction(null)}
        >
          <p>
            {goal.data.archived
              ? "O horizonte voltará às listagens ativas, mantendo a foto, o plano e o histórico."
              : "O horizonte sairá dos destaques e da lista em andamento. O dinheiro continuará reservado; registre uma retirada se quiser liberá-lo."}
          </p>
          <div className="form-actions">
            <button className="btn" onClick={() => setAction(null)}>
              Voltar
            </button>
            <button
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await edit([
                    {
                      ...goal,
                      data: { ...goal.data, archived: !goal.data.archived },
                    },
                  ]);
                  setAction(null);
                  message(
                    goal.data.archived
                      ? "Horizonte restaurado."
                      : "Horizonte arquivado. Sua reserva foi preservada.",
                  );
                } catch (err) {
                  message((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {goal.data.archived
                ? "Restaurar horizonte"
                : "Arquivar horizonte"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function HorizonLine({
  data,
  forecast = false,
}: {
  data: { month: string; balance: number }[];
  forecast?: boolean;
}) {
  return (
    <div
      className="horizon-line-chart"
      role="img"
      aria-label={
        forecast
          ? "Projeção futura estimada da reserva"
          : "Evolução real do valor reservado"
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="month"
            tickFormatter={(v) =>
              new Date(v + "-01T12:00:00").toLocaleDateString("pt-BR", {
                month: "short",
              })
            }
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            width={55}
            tickFormatter={(v) =>
              Math.abs(v) < 1000 ? number(v, 0) : `${number(v / 1000)}k`
            }
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            formatter={(v) => money(Number(v))}
            labelFormatter={(v) => String(v).split("-").reverse().join("/")}
          />
          <Line
            dataKey="balance"
            name={forecast ? "Reserva estimada" : "Reserva real"}
            stroke={forecast ? "#7896bb" : "#0085ff"}
            strokeWidth={3}
            strokeDasharray={forecast ? "6 5" : undefined}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function HorizonsPage({
  travelOnly = false,
  navigate,
}: {
  travelOnly?: boolean;
  navigate?: (page: string) => void;
}) {
  const { doc } = useFinance();
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(travelOnly ? "travel" : ""),
    [status, setStatus] = useState("active"),
    [sort, setSort] = useState("priority"),
    [detail, setDetail] = useState<string | null>(null),
    [analysis, setAnalysis] = useState(false),
    [create, setCreate] = useState(false),
    [deposit, setDeposit] = useState<Entity | null>(null),
    [plan, setPlan] = useState<Entity | null>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [detail, analysis]);
  const all = objectives(doc!),
    filtered = all
      .filter(
        (g) =>
          (!travelOnly || horizonCategory(g).id === "travel") &&
          g.data.name
            .toLocaleLowerCase("pt-BR")
            .includes(search.toLocaleLowerCase("pt-BR")) &&
          (!category || horizonCategory(g).id === category) &&
          (status === "all" || horizonStatus(doc!, g) === status),
      )
      .sort((a, b) =>
        sort === "deadline"
          ? (savingSummary(doc!, a).desired || "9999").localeCompare(
              savingSummary(doc!, b).desired || "9999",
            )
          : sort === "progress"
            ? savingSummary(doc!, b).percent - savingSummary(doc!, a).percent
            : Number(b.data.priority ?? 2) - Number(a.data.priority ?? 2) ||
              Number(a.data.dashboardOrder ?? 999) -
                Number(b.data.dashboardOrder ?? 999),
      );
  if (detail)
    return <HorizonDetails id={detail} onBack={() => setDetail(null)} />;
  if (analysis) return <SavingAnalysis onBack={() => setAnalysis(false)} />;
  return (
    <div className="horizons-page">
      <div className="horizons-page-intro">
        <div>
          <span className="eyebrow">DÊ FORMA AO SEU PRÓXIMO PASSO</span>
          <h2>
            {travelOnly
              ? "O mundo no seu horizonte"
              : "Uma conquista de cada vez."}
          </h2>
          <p>Reserve, planeje e acompanhe o que importa para você.</p>
        </div>
        <div className="button-row">
          <button className="btn" onClick={() => setAnalysis(true)}>
            Análise dos aportes
          </button>
          <button
            className="btn"
            onClick={() =>
              csvExport(
                [
                  "Nome",
                  "Categoria",
                  "Acumulado",
                  "Objetivo",
                  "Restante",
                  "Situação",
                ],
                filtered.map((g) => {
                  const s = savingSummary(doc!, g);
                  return [
                    g.data.name,
                    horizonCategory(g).label,
                    s.saved,
                    s.target,
                    s.remaining,
                    horizonStatus(doc!, g),
                  ];
                }),
                "my-horizon-objetivos.csv",
              )
            }
          >
            Exportar CSV
          </button>
          <button className="btn primary" onClick={() => setCreate(true)}>
            <Plus size={17} />
            Criar horizonte
          </button>
        </div>
      </div>
      <div className="horizon-filters panel">
        <label>
          Buscar horizonte
          <input
            type="search"
            placeholder="Qual é sua próxima conquista?"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Categoria
          <select
            aria-label="Categoria"
            value={category}
            disabled={travelOnly}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {horizonCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ordenar por
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="priority">Prioridade</option>
            <option value="deadline">Prazo</option>
            <option value="progress">Progresso</option>
          </select>
        </label>
      </div>
      <div className="horizon-status-tabs" aria-label="Situação dos horizontes">
        {[
          ["active", "Em andamento"],
          ["completed", "Concluídos"],
          ["archived", "Arquivados"],
          ["all", "Todos"],
        ].map(([v, l]) => (
          <button
            key={v}
            className={status === v ? "active" : ""}
            aria-pressed={status === v}
            onClick={() => setStatus(v)}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="stats-grid three horizon-summary">
        <Stat
          label="Acumulado nos horizontes filtrados"
          value={filtered.reduce((s, g) => s + reservedValue(doc!, g), 0)}
          tone="blue"
        />
        <Stat
          label="Falta para os objetivos filtrados"
          value={filtered.reduce(
            (s, g) => s + savingSummary(doc!, g).remaining,
            0,
          )}
        />
        <article className="stat horizon-count">
          <span>Seus horizontes nesta seleção</span>
          <strong>{filtered.length}</strong>
          <small>Os totais respeitam busca, categoria e situação.</small>
        </article>
      </div>
      {!filtered.length ? (
        <section className="panel">
          <Empty
            title={
              all.length
                ? "Nenhum horizonte nesta seleção"
                : "O que você quer conquistar?"
            }
            text={
              all.length
                ? "Ajuste os filtros ou crie um novo horizonte."
                : "Uma viagem, sua casa, uma reserva. Dê o primeiro passo."
            }
            action={() => setCreate(true)}
          />
        </section>
      ) : (
        <div className="horizon-grid">
          {filtered.map((g) => (
            <HorizonCard
              key={g.id}
              goal={g}
              onOpen={() => setDetail(g.id)}
              onAdd={() => setDeposit(g)}
              onPlan={() => setPlan(g)}
            />
          ))}
        </div>
      )}
      {!travelOnly &&
        filtered.some((g) => horizonStatus(doc!, g) === "active") && (
          <details className="panel horizon-allocation">
            <summary>Distribuir um aporte mensal entre os horizontes</summary>
            <p>
              Simulação proporcional à prioridade dos objetivos desta seleção.
              Não registra aportes nem altera suas reservas.
            </p>
            <Allocation items={filtered} />
          </details>
        )}
      {travelOnly && filtered.length > 1 && (
        <section className="panel horizon-comparison">
          <h3>Compare seus destinos</h3>
          <p>Custos estimados no cenário selecionado em cada viagem.</p>
          {filtered.map((g) => (
            <div className="comparison-row" key={g.id}>
              <span>{g.data.name}</span>
              <Progress
                value={
                  (targetValue(g) / Math.max(...filtered.map(targetValue), 1)) *
                  100
                }
              />
              <strong>{money(targetValue(g))}</strong>
            </div>
          ))}
        </section>
      )}
      {travelOnly && filtered.some((g) => g.kind === "trip") && (
        <p className="footnote">
          Nas viagens anteriores, os cenários Econômico e Confortável ajustam o
          custo Padrão em −20% e +30%. São estimativas; planejar a viagem não
          altera despesas reais.
        </p>
      )}
      {create && (
        <RecordForm
          kind={travelOnly ? "trip" : "goal"}
          initialCategory={category || undefined}
          onClose={() => setCreate(false)}
          onSaved={(id) => {
            const created = useFinance
              .getState()
              .doc?.entities.find((e) => e.id === id);
            if (!created) return;
            if (travelOnly && horizonCategory(created).id !== "travel") {
              navigate?.("goal");
              return;
            }
            if (category) setCategory(horizonCategory(created).id);
            if (status !== "all")
              setStatus(horizonStatus(useFinance.getState().doc!, created));
            if (
              !created.data.name
                .toLocaleLowerCase("pt-BR")
                .includes(search.toLocaleLowerCase("pt-BR"))
            )
              setSearch("");
          }}
        />
      )}
      {deposit && (
        <ContributionForm goal={deposit} onClose={() => setDeposit(null)} />
      )}
      {plan && <PlanEditor goal={plan} onClose={() => setPlan(null)} />}
    </div>
  );
}
export function HorizonsDashboard({
  navigate,
}: {
  navigate: (p: string) => void;
}) {
  const { doc, edit, message } = useFinance();
  const all = objectives(doc!)
    .filter((g) => !g.data.archived)
    .sort(
      (a, b) =>
        Number(a.data.dashboardOrder ?? 999) -
          Number(b.data.dashboardOrder ?? 999) ||
        Number(b.data.priority ?? 2) - Number(a.data.priority ?? 2),
    );
  const [detail, setDetail] = useState<string | null>(null),
    [deposit, setDeposit] = useState<Entity | null>(null),
    [create, setCreate] = useState(false),
    [manage, setManage] = useState(false),
    [order, setOrder] = useState<string[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const featured = all.filter(isFeatured);
  return (
    <section className="next-horizons">
      <div className="next-horizons-heading">
        <div>
          <span className="eyebrow">SEUS PLANOS GANHAM FORMA</span>
          <h2>Seus próximos horizontes</h2>
          <p>O que você guarda hoje aproxima o que vem amanhã.</p>
        </div>
        <div className="button-row">
          <button
            className="horizon-manage icon-btn"
            aria-label="Personalizar horizontes do dashboard"
            onClick={() => {
              setOrder(all.map((g) => g.id));
              setSelected(featured.map((g) => g.id));
              setManage(true);
            }}
          >
            <SlidersHorizontal size={18} />
          </button>
          <button className="text-btn" onClick={() => navigate("goal")}>
            Ver todos
            <ArrowUpRight size={16} />
          </button>
          <button className="btn" onClick={() => setCreate(true)}>
            <Plus size={16} />
            Criar horizonte
          </button>
        </div>
      </div>
      {featured.length ? (
        <div className="horizon-grid">
          {featured.map((g) => (
            <HorizonCard
              key={g.id}
              goal={g}
              onOpen={() => setDetail(g.id)}
              onAdd={() => setDeposit(g)}
            />
          ))}
        </div>
      ) : (
        <div className="panel horizon-empty">
          <Target size={32} />
          <div>
            <h3>Qual será o seu próximo horizonte?</h3>
            <p>Crie um objetivo ou escolha quais conquistas destacar aqui.</p>
          </div>
          <button className="btn primary" onClick={() => setCreate(true)}>
            Criar horizonte
          </button>
        </div>
      )}
      {create && <RecordForm kind="goal" onClose={() => setCreate(false)} />}
      {deposit && (
        <ContributionForm goal={deposit} onClose={() => setDeposit(null)} />
      )}
      {detail && (
        <Modal title="Seu horizonte" onClose={() => setDetail(null)}>
          <HorizonDetails id={detail} onBack={() => setDetail(null)} />
        </Modal>
      )}
      {manage && (
        <Modal
          title="Seus horizontes em destaque"
          onClose={() => setManage(false)}
        >
          <p className="muted">
            Escolha os favoritos e use as setas para definir a ordem. A seleção
            fica salva na sua conta.
          </p>
          <div className="horizon-order-list">
            {order.map((id, i) => {
              const g = all.find((g) => g.id === id)!;
              const move = (delta: number) =>
                setOrder((xs) => {
                  const next = [...xs];
                  [next[i], next[i + delta]] = [next[i + delta], next[i]];
                  return next;
                });
              return (
                <div key={id}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={selected.includes(id)}
                      onChange={(e) =>
                        setSelected((xs) =>
                          e.target.checked
                            ? [...xs, id]
                            : xs.filter((x) => x !== id),
                        )
                      }
                    />
                    {g.data.name}
                  </label>
                  <div className="button-row">
                    <button
                      className="icon-btn"
                      disabled={i === 0}
                      aria-label={`Mover ${g.data.name} para cima`}
                      onClick={() => move(-1)}
                    >
                      <ArrowUp size={17} />
                    </button>
                    <button
                      className="icon-btn"
                      disabled={i === order.length - 1}
                      aria-label={`Mover ${g.data.name} para baixo`}
                      onClick={() => move(1)}
                    >
                      <ArrowDown size={17} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => setManage(false)}>
              Voltar
            </button>
            <button
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await edit(
                    order.map((id, i) => {
                      const g = all.find((g) => g.id === id)!;
                      return {
                        ...g,
                        data: {
                          ...g.data,
                          featured: selected.includes(id),
                          dashboardOrder: i,
                        },
                      };
                    }),
                  );
                  setManage(false);
                } catch (err) {
                  message((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Salvar destaques
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
