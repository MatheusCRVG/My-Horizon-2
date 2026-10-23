import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  Plus,
  ShieldCheck,
  Target,
  Wallet,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { useFinance } from "../core/store";
import {
  addMonths,
  categories,
  dateLabel,
  money,
  monthNow,
  rows,
  today,
  type Entity,
} from "../core/model";
import {
  calendarMonth,
  essentialExpenseAverage,
  type CalendarEvent,
} from "../core/calendar";
import { horizonCategory } from "../core/horizons";
import { positive, reservedValue } from "../core/contributions";
import { savingSummary } from "../core/saving-targets";
import { Empty, Modal, Stat } from "../components/ui";
import { HorizonCover } from "../components/HorizonCover";
import { TransactionForm } from "./Transactions";
import { ContributionForm } from "./ContributionForm";
import { RecordForm } from "./Records";
import { HorizonDetails } from "./Horizons";
import "../money-planning.css";

const eventLabels: Record<CalendarEvent["type"], string> = {
  income: "Receita",
  expense: "Despesa",
  transfer: "Transferência",
  invoice: "Fatura",
  contribution: "Reserva planejada",
  opening: "Saldo de abertura",
};

export function MoneyPlanning({
  view,
  navigate,
}: {
  view: "calendar" | "reserve";
  navigate: (p: string) => void;
}) {
  return view === "calendar" ? (
    <FinancialCalendar navigate={navigate} />
  ) : (
    <EmergencyReserve navigate={navigate} />
  );
}

function FinancialCalendar({ navigate }: { navigate: (p: string) => void }) {
  const { doc } = useFinance();
  const [month, setMonth] = useState(monthNow()),
    [accountId, setAccountId] = useState(""),
    [layout, setLayout] = useState<"calendar" | "list">("calendar"),
    [selectedDate, setSelectedDate] = useState(today()),
    [transaction, setTransaction] = useState<Entity | null>(null),
    [goalId, setGoalId] = useState("");
  const projection = useMemo(
    () => calendarMonth(doc!, month, today(), accountId),
    [doc, month, accountId],
  );
  const selected = projection.days.find((day) => day.date === selectedDate);
  const firstOffset = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  const shift = (delta: number) => {
    const next = addMonths(`${month}-01`, delta).slice(0, 7);
    if (next >= "1900-01" && next <= "2200-12") setMonth(next);
  };
  const openEvent = (event: CalendarEvent) => {
    if (event.transactionId) {
      const tx = rows(doc!, "transaction").find(
        (e) => e.id === event.transactionId,
      );
      if (tx) setTransaction(tx);
    } else if (event.goalId) setGoalId(event.goalId);
    else if (event.type === "invoice") navigate("card");
  };
  const eventList = (entries: CalendarEvent[]) =>
    entries.length ? (
      <div className="money-event-list">
        {entries.map((event) => (
          <article
            className={`money-event money-event-${event.type}`}
            key={event.id}
          >
            <span className="money-event-marker" aria-hidden="true" />
            <div className="money-event-text">
              <strong>{event.title}</strong>
              <small>
                {eventLabels[event.type]} · {dateLabel(event.date)}
                {event.overdue
                  ? ` · Vencido em ${dateLabel(event.originalDate)}; considerado hoje`
                  : event.status === "planned"
                    ? " · Previsto"
                    : " · Confirmado"}
                {event.credit
                  ? ` · Compra no cartão, sem débito em conta · Fatura em ${dateLabel(event.billingDate!)}`
                  : ""}
              </small>
            </div>
            <div className="money-event-value">
              <strong
                className={
                  event.cashImpact < 0
                    ? "negative"
                    : event.type === "income"
                      ? "positive"
                      : ""
                }
              >
                {money(event.amount)}
              </strong>
              {event.transactionId ||
              event.goalId ||
              event.type === "invoice" ? (
                <button className="text-btn" onClick={() => openEvent(event)}>
                  {event.goalId
                    ? "Ver horizonte"
                    : event.type === "invoice" && !event.transactionId
                      ? "Ver fatura"
                      : "Revisar"}
                  <ArrowRight size={14} />
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    ) : (
      <p className="money-calm muted">
        Nenhum compromisso registrado para este período.
      </p>
    );
  return (
    <div className="money-planning">
      <section className="money-intro">
        <span className="eyebrow">SEU DINHEIRO, NO TEMPO</span>
        <h2>Um mês com mais clareza.</h2>
        <p>
          Acompanhe entradas, compromissos e aportes. As previsões usam os
          registros que você cadastrou.
        </p>
      </section>
      <div className="money-calendar-toolbar panel">
        <div className="money-month-control">
          <button
            className="icon-btn"
            aria-label="Mês anterior"
            onClick={() => shift(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <label>
            Mês do calendário
            <input
              type="month"
              min="1900-01"
              max="2200-12"
              value={month}
              onChange={(e) => {
                if (
                  /^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value) &&
                  e.target.value >= "1900-01" &&
                  e.target.value <= "2200-12"
                )
                  setMonth(e.target.value);
              }}
            />
          </label>
          <button
            className="icon-btn"
            aria-label="Próximo mês"
            onClick={() => shift(1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <label>
          Conta
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Todas as contas</option>
            {rows(doc!, "account").map((a) => (
              <option key={a.id} value={a.id}>
                {a.data.name}
              </option>
            ))}
          </select>
        </label>
        <div className="money-segment" aria-label="Apresentação do calendário">
          <button
            aria-pressed={layout === "calendar"}
            onClick={() => setLayout("calendar")}
          >
            <CalendarDays size={17} />
            Calendário
          </button>
          <button
            aria-pressed={layout === "list"}
            onClick={() => setLayout("list")}
          >
            <List size={17} />
            Lista
          </button>
        </div>
      </div>
      <div className="stats-grid money-calendar-stats">
        <Stat
          label="Saldo no fim do mês"
          value={projection.closing}
          detail={
            month >= monthNow()
              ? "Estimativa de caixa nas contas"
              : "Saldo histórico registrado"
          }
        />
        <Stat
          label="Entradas no mês"
          value={projection.income}
          tone="green"
          detail="Registradas e previstas; sem transferências"
        />
        <Stat
          label="Saídas de caixa"
          value={projection.outgoing}
          detail="Compromissos e faturas, sem transferências próprias"
        />
        <Stat
          label="Aportes previstos"
          value={projection.allocation}
          tone="blue"
          detail={
            accountId
              ? "Veja todas as contas para exibir os planos"
              : "Alocações; não diminuem o saldo bancário"
          }
        />
      </div>
      {projection.shortfalls.length > 0 && (
        <div className="money-alert" role="status">
          <AlertTriangle size={20} />
          <div>
            <strong>Há previsão de saldo insuficiente.</strong>
            <p>
              Primeiro dia: {dateLabel(projection.shortfalls[0].date)}. Menor
              saldo estimado: {money(projection.minimum)}. Revise valores e
              datas antes de assumir novos compromissos.
            </p>
          </div>
        </div>
      )}
      {layout === "calendar" ? (
        <section
          className="panel money-calendar-panel"
          aria-label="Calendário financeiro mensal"
        >
          <p className="muted money-calendar-currency">
            Saldos em reais (R$). Toque em um dia para ver os valores completos.
          </p>
          <div className="money-calendar-grid">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((label) => (
              <span className="money-weekday" key={label}>
                {label}
              </span>
            ))}
            {Array.from({ length: firstOffset }, (_, i) => (
              <span className="money-day-blank" key={`blank:${i}`} />
            ))}
            {projection.days.map((day) => (
              <button
                key={day.date}
                className={`money-day ${day.date === today() ? "money-today" : ""} ${selectedDate === day.date ? "selected" : ""} ${day.balance < 0 ? "money-shortfall" : ""}`}
                aria-pressed={selectedDate === day.date}
                aria-label={`${dateLabel(day.date)}, ${day.events.length} compromisso(s), ${day.estimated ? "saldo estimado" : "saldo"} ${money(day.balance)}`}
                onClick={() => setSelectedDate(day.date)}
              >
                <span className="money-day-number">
                  {Number(day.date.slice(8))}
                </span>
                <span className="money-day-balance">
                  <span className="money-day-full">{money(day.balance)}</span>
                  <span className="money-day-compact">
                    {new Intl.NumberFormat("pt-BR", {
                      notation: "compact",
                      maximumFractionDigits: 0,
                    })
                      .format(day.balance)
                      .replace(/\s/g, "")}
                  </span>
                </span>
                <span className="money-day-count">
                  {day.events.length
                    ? `${day.events.length} ${day.events.length === 1 ? "evento" : "eventos"}`
                    : "Sem eventos"}
                </span>
                <span className="money-day-dots" aria-hidden="true">
                  {day.events.slice(0, 4).map((event) => (
                    <i className={`money-dot-${event.type}`} key={event.id} />
                  ))}
                </span>
              </button>
            ))}
          </div>
          <div className="money-day-detail">
            <div className="panel-title">
              <div>
                <h3>
                  {selected ? dateLabel(selected.date) : "Escolha um dia"}
                </h3>
                {selected && (
                  <p>
                    {selected.estimated ? "Saldo estimado" : "Saldo registrado"}
                    : {money(selected.balance)}
                    {!accountId
                      ? ` · Após reservas: ${money(selected.unreserved)}`
                      : ""}
                  </p>
                )}
              </div>
            </div>
            {selected ? (
              eventList(selected.events)
            ) : (
              <p className="muted">
                Toque em um dia para ver os compromissos e revisar os registros.
              </p>
            )}
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-title">
            <h3>Compromissos do mês</h3>
            <span className="pill">{projection.events.length} eventos</span>
          </div>
          {eventList(projection.events)}
        </section>
      )}
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>Semana a semana</h3>
            <p>Saldos ao fim de cada semana, com segunda-feira como início.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Período</th>
                <th>Entradas</th>
                <th>Saídas de caixa</th>
                <th>Aportes planejados</th>
                <th>Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {projection.weeks.map((week) => (
                <tr key={week.from}>
                  <td>
                    {dateLabel(week.from)} a {dateLabel(week.to)}
                  </td>
                  <td>{money(week.income)}</td>
                  <td>{money(week.outgoing)}</td>
                  <td>{money(week.allocation)}</td>
                  <td className={week.balance < 0 ? "negative" : ""}>
                    {money(week.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <details className="panel money-premises">
        <summary>Como esta previsão é calculada</summary>
        <p>
          O saldo de hoje usa os lançamentos confirmados. A partir de hoje,
          entram as receitas e despesas previstas, os registros confirmados com
          data futura e as faturas remanescentes. Pagamentos de fatura já
          cadastrados são considerados uma única vez. Pendências vencidas são
          trazidas para hoje, sem repetir automaticamente os meses anteriores.
        </p>
        <p>
          Recorrências de despesas e receitas só aparecem nas datas que já foram
          cadastradas. Planos de aportes seguem a recorrência configurada, até
          atingir o valor que falta; aportes já realizados não são repetidos.
          Reservar dinheiro não é uma saída bancária: “Após reservas” desconta
          alocações sem alterar o caixa. Investimentos e limite de cartão não
          fazem parte deste saldo. Com uma conta filtrada, os aportes não são
          distribuídos porque o plano não define a origem de cada ocorrência.
        </p>
        <p>
          Registros confirmados com datas passadas mostram o histórico das
          contas. As datas são dias civis, sem ajuste por feriados. A previsão
          não confirma nem altera nenhum registro.
        </p>
      </details>
      {transaction && (
        <TransactionForm
          entity={transaction}
          onClose={() => setTransaction(null)}
        />
      )}
      {goalId && (
        <Modal title="Seu horizonte" onClose={() => setGoalId("")}>
          <HorizonDetails id={goalId} onBack={() => setGoalId("")} />
        </Modal>
      )}
    </div>
  );
}

const reserveSettingsId = "settings:emergency-reserve";
const defaultEssential = [
  "Moradia",
  "Alimentação",
  "Mercado",
  "Transporte",
  "Saúde",
];

function EmergencyReserve({ navigate }: { navigate: (p: string) => void }) {
  const { doc, edit, message } = useFinance();
  const stored = rows(doc!, "simulation").find(
    (e) => e.id === reserveSettingsId || e.data.tab === "reserve-settings",
  );
  const goals = rows(doc!, "goal").filter(
    (e) => horizonCategory(e).id === "reserve" && !e.data.archived,
  );
  const [goalId, setGoalId] = useState<string>(
      stored?.data.goalId || goals[0]?.id || "",
    ),
    [mode, setMode] = useState<string>(stored?.data.mode || "average"),
    [essential, setEssential] = useState<string>(
      String(stored?.data.essential ?? ""),
    ),
    [months, setMonths] = useState<string>(String(stored?.data.months ?? 6)),
    [averageMonths, setAverageMonths] = useState<string>(
      String(stored?.data.averageMonths ?? 3),
    ),
    [selectedCategories, setSelectedCategories] = useState<string[]>(
      Array.isArray(stored?.data.categories)
        ? stored.data.categories
        : defaultEssential,
    ),
    [creating, setCreating] = useState(false),
    [adding, setAdding] = useState(false),
    [detail, setDetail] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const average = essentialExpenseAverage(
    doc!,
    selectedCategories,
    Number(averageMonths),
  );
  const monthly =
    mode === "average" ? (average.average ?? 0) : positive(essential);
  const desiredMonths = Math.min(
    60,
    Math.max(1, Math.floor(Number(months) || 1)),
  );
  const target = Math.round(monthly * desiredMonths * 100) / 100;
  const goal = goals.find((e) => e.id === goalId);
  const saved = goal ? reservedValue(doc!, goal) : 0;
  const remaining = Math.max(0, target - saved),
    coverage = monthly ? saved / monthly : 0;
  const summary =
    goal && target > 0
      ? savingSummary(doc!, { ...goal, data: { ...goal.data, target } })
      : null;
  const allCategories = Array.from(
    new Set([
      ...categories,
      ...rows(doc!, "transaction")
        .map((e) => e.data.category)
        .filter(Boolean),
    ]),
  ).sort();
  const saveSettings = async () => {
    setError("");
    setBusy(true);
    try {
      if (
        !Number.isFinite(Number(months)) ||
        Number(months) < 1 ||
        Number(months) > 60 ||
        !Number.isInteger(Number(months))
      )
        throw Error("Informe entre 1 e 60 meses de cobertura.");
      if (
        mode === "manual" &&
        (!Number.isFinite(Number(essential)) || Number(essential) <= 0)
      )
        throw Error("Informe uma despesa essencial mensal maior que zero.");
      if (mode === "average" && !selectedCategories.length)
        throw Error("Selecione ao menos uma categoria essencial.");
      if (goalId && !goal)
        throw Error("Selecione uma reserva disponível ou crie um horizonte.");
      await edit([
        {
          id: stored?.id ?? reserveSettingsId,
          kind: "simulation",
          data: {
            ...stored?.data,
            tab: "reserve-settings",
            name: "Configuração da reserva de emergência",
            goalId,
            mode,
            essential: mode === "manual" ? Number(essential) : 0,
            months: Number(months),
            averageMonths: Number(averageMonths),
            categories: selectedCategories,
          },
        },
      ]);
      message("Planejamento da reserva salvo. Nenhum saldo foi alterado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="money-planning">
      <section className="money-intro">
        <span className="eyebrow">RESERVA DE EMERGÊNCIA</span>
        <h2>Tranquilidade para o inesperado.</h2>
        <p>
          Entenda por quanto tempo sua reserva cobre o essencial. O dinheiro
          continua na mesma meta e nas mesmas contas.
        </p>
      </section>
      <div className="money-reserve-layout">
        <section className="panel money-reserve-settings">
          <div className="panel-title">
            <h3>Seu ponto de partida</h3>
            <ShieldCheck size={21} />
          </div>
          <label>
            Horizonte da reserva
            <select
              value={goal?.id ?? ""}
              onChange={(e) => setGoalId(e.target.value)}
            >
              <option value="">Escolha sua reserva</option>
              {goals.map((g) => (
                <option value={g.id} key={g.id}>
                  {g.data.name}
                </option>
              ))}
            </select>
          </label>
          <button className="text-btn" onClick={() => setCreating(true)}>
            <Plus size={16} />
            Criar horizonte de reserva
          </button>
          <label>
            Despesas essenciais
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="average">Média dos meus registros</option>
              <option value="manual">Informar valor mensal</option>
            </select>
          </label>
          {mode === "manual" ? (
            <label>
              Valor essencial por mês (R$)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={essential}
                onChange={(e) => setEssential(e.target.value)}
                placeholder="Ex.: 2500"
              />
            </label>
          ) : (
            <>
              <label>
                Período da média
                <select
                  value={averageMonths}
                  onChange={(e) => setAverageMonths(e.target.value)}
                >
                  <option value="3">Últimos 3 meses completos</option>
                  <option value="6">Últimos 6 meses completos</option>
                  <option value="12">Últimos 12 meses completos</option>
                </select>
              </label>
              <fieldset className="money-essential-categories">
                <legend>O que é essencial para você?</legend>
                {allCategories.map((category) => (
                  <label key={category}>
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(category)}
                      onChange={(e) =>
                        setSelectedCategories((current) =>
                          e.target.checked
                            ? [...current, category]
                            : current.filter((item) => item !== category),
                        )
                      }
                    />
                    <span>{category}</span>
                  </label>
                ))}
              </fieldset>
              <p className="muted money-average-note">
                Média de {average.periods[0].split("-").reverse().join("/")} a{" "}
                {average.periods.at(-1)!.split("-").reverse().join("/")}:{" "}
                {average.observedPeriods.length ? (
                  <>
                    {money(average.total)} ÷ {average.observedPeriods.length}{" "}
                    mês(es) com registros ={" "}
                    <strong>{money(average.average!)}/mês</strong>.
                  </>
                ) : (
                  "Ainda não há base para calcular uma média."
                )}{" "}
                {average.observedPeriods.length} de {average.periods.length}{" "}
                meses com despesas essenciais observadas
                {average.partial ? "; histórico parcial" : ""}. Meses sem
                registros não são tratados como gasto zero. {average.count}{" "}
                despesa(s) confirmada(s); transferências e pagamentos de fatura
                não entram novamente. Os valores seguem o mês de cada
                lançamento, inclusive a parcela de cartão no mês de vencimento.
                Confira se os registros das categorias selecionadas estão
                completos ou informe seu valor mensal.
              </p>
              {!average.count && (
                <p className="info-box">
                  Ainda não há despesas confirmadas neste período e nestas
                  categorias. Informe um valor mensal ou importe seu histórico
                  para planejar com uma base útil.
                </p>
              )}
            </>
          )}
          <label>
            Meses de cobertura desejados
            <input
              type="number"
              min="1"
              max="60"
              step="1"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
            />
          </label>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => void saveSettings()}
          >
            {busy ? "Salvando…" : "Salvar planejamento da reserva"}
          </button>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
        </section>
        <div className="money-reserve-main">
          <section className="panel money-reserve-hero">
            {goal ? (
              <HorizonCover goal={goal} />
            ) : (
              <div className="money-reserve-symbol">
                <ShieldCheck size={54} />
              </div>
            )}
            <div className="money-reserve-hero-content">
              <span className="eyebrow">
                {goal?.data.name ?? "SUA REDE DE SEGURANÇA"}
              </span>
              <h3>
                {monthly
                  ? `${coverage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} meses`
                  : "Comece pelo essencial"}
              </h3>
              <p>
                {monthly
                  ? `de cobertura atual, de ${desiredMonths} meses planejados`
                  : "Defina sua despesa essencial mensal para calcular a cobertura."}
              </p>
              {monthly > 0 && (
                <div
                  className="progress"
                  role="progressbar"
                  aria-label="Cobertura da reserva"
                  aria-valuenow={Math.min(
                    100,
                    Math.round((coverage / desiredMonths) * 100),
                  )}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <i
                    style={{
                      width: `${Math.min(100, (coverage / desiredMonths) * 100)}%`,
                    }}
                  />
                </div>
              )}
              {target > 0 && saved >= target && (
                <p className="positive">
                  <ShieldCheck size={17} />
                  Sua cobertura desejada está completa.
                  {saved > target
                    ? ` Você tem ${money(saved - target)} acima desse valor.`
                    : ""}
                </p>
              )}
            </div>
          </section>
          <div className="stats-grid money-reserve-stats">
            <Stat
              label="Já reservado"
              value={saved}
              tone="blue"
              detail="Saldo real do horizonte selecionado"
            />
            {monthly > 0 ? (
              <>
                <Stat
                  label="Reserva desejada"
                  value={target}
                  detail={`${desiredMonths} meses × ${money(monthly)}`}
                />
                <Stat
                  label="Falta reservar"
                  value={remaining}
                  detail="Sem duplicar seu patrimônio"
                />
              </>
            ) : (
              <>
                <article className="stat">
                  <div className="stat-top">
                    <span>Reserva desejada</span>
                  </div>
                  <strong>Sem estimativa</strong>
                  <small>Informe a despesa essencial mensal</small>
                </article>
                <article className="stat">
                  <div className="stat-top">
                    <span>Falta reservar</span>
                  </div>
                  <strong>Sem estimativa</strong>
                  <small>Seu saldo real permanece preservado</small>
                </article>
              </>
            )}
          </div>
          <section className="panel">
            <div className="panel-title">
              <h3>Seu plano de construção</h3>
              <Target size={21} />
            </div>
            {goal ? (
              <>
                <dl className="money-reserve-plan">
                  <div>
                    <dt>Aporte mensal planejado</dt>
                    <dd>
                      {goal.data.plan
                        ? money(positive(goal.data.plan.monthly))
                        : "Ainda não configurado"}
                    </dd>
                  </div>
                  <div>
                    <dt>Prazo do horizonte</dt>
                    <dd>
                      {goal.data.deadline
                        ? dateLabel(goal.data.deadline)
                        : "Sem prazo definido"}
                    </dd>
                  </div>
                  <div>
                    <dt>Necessário por mês para o prazo</dt>
                    <dd>
                      {monthly <= 0
                        ? "Informe as despesas essenciais"
                        : target > 0 && remaining === 0
                          ? money(0)
                          : summary?.required !== null &&
                              summary?.required !== undefined &&
                              goal.data.deadline
                            ? money(summary.required)
                            : goal.data.deadline && goal.data.deadline < today()
                              ? "Prazo vencido; revise seu plano"
                              : "Defina um prazo nos detalhes"}
                    </dd>
                  </div>
                  <div>
                    <dt>Conclusão estimada da cobertura</dt>
                    <dd>
                      {monthly <= 0
                        ? "Informe as despesas essenciais"
                        : summary?.completion
                          ? dateLabel(summary.completion)
                          : "Configure aportes para estimar"}
                    </dd>
                  </div>
                </dl>
                <div className="button-row">
                  <button
                    className="btn primary"
                    onClick={() => setAdding(true)}
                  >
                    <Plus size={17} />
                    Adicionar dinheiro
                  </button>
                  <button className="btn" onClick={() => setDetail(true)}>
                    Ver reserva e planejar aportes
                    <ArrowRight size={16} />
                  </button>
                </div>
                {target > 0 &&
                  Math.abs(Number(goal.data.target) - target) > 0.01 && (
                    <div className="info-box money-reserve-align">
                      <p>
                        O valor alvo deste horizonte é{" "}
                        {money(Number(goal.data.target))}. A cobertura calculada
                        pede {money(target)}. Você pode alinhá-los sem mudar o
                        dinheiro já guardado.
                      </p>
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            await edit([
                              { ...goal, data: { ...goal.data, target } },
                            ]);
                            message(
                              "Objetivo atualizado. O saldo reservado foi preservado.",
                            );
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Usar {money(target)} como objetivo
                      </button>
                    </div>
                  )}
              </>
            ) : (
              <Empty
                title="Vincule sua reserva a um horizonte"
                text="Selecione uma reserva existente ou crie uma. Seus aportes e retiradas serão os mesmos em todas as telas."
              />
            )}
            <p className="muted money-reserve-note">
              A estimativa usa o saldo real e os aportes configurados, sem
              rendimento presumido. Alterar a cobertura não cria aportes ou
              movimentações. Reservar no app organiza dinheiro que já existe;
              não transfere valores entre bancos.
            </p>
          </section>
          <button className="text-btn" onClick={() => navigate("goal")}>
            <Wallet size={16} />
            Ver todos os meus horizontes
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
      {creating && (
        <RecordForm
          kind="goal"
          initialCategory="reserve"
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setGoalId(id);
          }}
        />
      )}
      {adding && goal && (
        <ContributionForm goal={goal} onClose={() => setAdding(false)} />
      )}
      {detail && goal && (
        <Modal
          title="Sua reserva de emergência"
          onClose={() => setDetail(false)}
        >
          <HorizonDetails id={goal.id} onBack={() => setDetail(false)} />
        </Modal>
      )}
    </div>
  );
}
