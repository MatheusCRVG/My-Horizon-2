function greetingForHour(hour: number): string { return hour < 12 ? "Bom dia." : hour < 18 ? "Boa tarde." : "Boa noite."; }
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Sparkles,
  CalendarDays,
  Eye,
  EyeOff,
  Target,
} from "lucide-react";
import { useFinance } from "../core/store";
import { money, rows, today, dateLabel } from "../core/model";
import { totals } from "../core/finance";
import { totalReserved, objectives } from "../core/contributions";
import { savingSummary } from "../core/saving-targets";
import {
  assistantAnswer,
  savingCapacity,
  type PulseSnapshot,
} from "../core/intelligence";
import { dashboardLayout } from "../core/workspace";
import { Stat, Amount, TypeIcon, Empty } from "../components/ui";
import { monthlySeries, FlowChart } from "../components/FinanceCharts";
import { HorizonsDashboard } from "./Horizons";
import { SavingsDashboard } from "./SavingAnalysis";
import { DashboardCustomizer, HorizonPulse, ScoreCard } from "./Intelligence";

export function Dashboard({
  month,
  account,
  category,
  navigate,
  add,
  pulseBaseline,
}: {
  month: string;
  account: string;
  category: string;
  navigate: (p: string) => void;
  add: (type?: "income" | "expense") => void;
  pulseBaseline: PulseSnapshot | null;
}) {
  const [hiddenValues, setHiddenValues] = useState(false);
  const [greeting, setGreeting] = useState(() => greetingForHour(new Date().getHours()));
  useEffect(() => {
    const update = () => setGreeting(greetingForHour(new Date().getHours()));
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, []);
  const { doc } = useFinance(),
    t = totals(doc!, month),
    series = monthlySeries(doc!, month, account, category);
  const selected = totals(doc!, month, account, category),
    layout = dashboardLayout(doc!);
  const recent = rows(doc!, "transaction")
    .filter(
      (e) =>
        e.data.status === "confirmed" &&
        e.data.date.startsWith(month) &&
        (!account ||
          e.data.accountId === account ||
          e.data.targetAccountId === account) &&
        (!category || e.data.category === category),
    )
    .sort((a, b) => b.data.date.localeCompare(a.data.date))
    .slice(0, 5);
  const upcoming = rows(doc!, "transaction")
    .filter((e) => e.data.status === "planned" && e.data.type === "expense")
    .sort((a, b) => a.data.date.localeCompare(b.data.date))
    .slice(0, 3);
  const next = objectives(doc!)
    .filter((g) => !g.data.archived)
    .map((g) => ({ goal: g, ...savingSummary(doc!, g) }))
    .filter((g) => g.remaining > 0 && g.completion)
    .sort((a, b) => a.completion!.localeCompare(b.completion!))[0];
  const guidance = assistantAnswer(doc!, "Quanto posso economizar este mês?");
  const capacity = savingCapacity(doc!);
  const components: Record<string, ReactNode> = {
    horizons: <HorizonsDashboard navigate={navigate} />,
    pulse: <HorizonPulse baseline={pulseBaseline} navigate={navigate} />,
    contributions: <SavingsDashboard month={month} navigate={navigate} />,
    guidance: (
      <div className="home-guidance-grid">
        <section className="panel home-recommendation">
          <div className="panel-title">
            <div>
              <span className="eyebrow">HORIZON AI · ANÁLISE LOCAL</span>
              <h3>Um próximo passo possível</h3>
            </div>
            <Sparkles size={21} />
          </div>
          <p>{guidance.text}</p>
          <p className="muted">
            Análise do mês atual, independentemente do filtro do relatório.
          </p>
          <div className="button-row">
            <button className="btn" onClick={() => navigate("assistant")}>
              Entender meus números <ArrowUpRight size={15} />
            </button>
            <button className="text-btn" onClick={() => navigate("calendar")}>
              Ver calendário
            </button>
          </div>
        </section>
        <ScoreCard navigate={navigate} />
      </div>
    ),
    activity: (
      <div className="home-activity-grid">
        <section className="panel">
          <div className="panel-title">
            <div>
              <h3>Sua evolução financeira</h3>
              <p className="muted">
                Receitas e despesas registradas · últimos seis meses
              </p>
            </div>
            <button className="text-btn" onClick={() => navigate("future")}>
              Olhar adiante <ArrowUpRight size={15} />
            </button>
          </div>
          <FlowChart data={series} />
          <div className="flow-legend">
            <span>
              <i />
              Receitas
            </span>
            <span>
              <i />
              Despesas
            </span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h3>Últimas movimentações</h3>
            <button
              className="text-btn"
              onClick={() => navigate("transactions")}
            >
              Ver todas <ArrowRight size={15} />
            </button>
          </div>
          {recent.length ? (
            recent.map((e) => (
              <div className="activity" key={e.id}>
                <TypeIcon type={e.data.type} category={e.data.category} />
                <div>
                  <strong>{e.data.description}</strong>
                  <small>
                    {e.data.category ?? "Transferência"} ·{" "}
                    {dateLabel(e.data.date)}
                  </small>
                </div>
                <Amount value={e.data.amount} type={e.data.type} />
              </div>
            ))
          ) : (
            <Empty
              title="Sua história começa com um registro"
              text="Cadastre uma entrada ou saída para acompanhar a evolução."
              action={add}
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-title">
            <h3>Próximos compromissos</h3>
            <CalendarDays size={19} />
          </div>
          {upcoming.length ? (
            upcoming.map((e) => (
              <div className="upcoming" key={e.id}>
                <div className="date-tile">
                  <strong>{e.data.date.slice(8)}</strong>
                  <small>{e.data.date.slice(5, 7)}</small>
                </div>
                <div>
                  <strong>{e.data.description}</strong>
                  <small>
                    {e.data.date < today()
                      ? "Aguardando confirmação"
                      : dateLabel(e.data.date)}
                  </small>
                </div>
                <strong>{money(e.data.amount)}</strong>
              </div>
            ))
          ) : (
            <p className="muted calm">Nenhuma despesa prevista cadastrada.</p>
          )}
          <button className="text-btn" onClick={() => navigate("calendar")}>
            Abrir calendário completo <ArrowRight size={15} />
          </button>
        </section>
        <section className="panel">
          <h3>Seu dinheiro tem um destino.</h3>
          <p className="home-reservation-note">
            {money(totalReserved(doc!))} já estão reservados nos seus
            horizontes. Eles continuam incluídos nos saldos e no patrimônio, sem
            serem somados outra vez.
          </p>
          <button className="text-btn" onClick={() => navigate("goal")}>
            Cuidar dos meus horizontes <ArrowRight size={15} />
          </button>
        </section>
      </div>
    ),
  };
  const mainGoal = objectives(doc!).find(g => !g.data.archived);
  const mainProgress = mainGoal ? savingSummary(doc!, mainGoal) : null;
  return (
    <div className="home-workspace home52-premium">
      <section className="home52-hero">
        <span className="eyebrow">SEU DINHEIRO. SEUS SONHOS.</span>
        <h2>{greeting} <span>Seu próximo horizonte começa aqui.</span></h2>
      </section>
      {!rows(doc!, "account").length && (
        <section className="start-hint">
          <div>
            <h3>Comece pelo dinheiro que você já tem</h3>
            <p>
              Cadastre uma conta com saldo de abertura. Depois, registre
              entradas e saídas.
            </p>
          </div>
          <button className="btn primary" onClick={() => navigate("account")}>
            Cadastrar conta <ArrowRight size={16} />
          </button>
        </section>
      )}
      <section
        className="home-questions"
        aria-label="Seu dinheiro em três perguntas"
      >
        <article className="home-money home52-balance">
          <div className="home52-balance-label"><span>Meu patrimônio</span><button type="button" aria-label={hiddenValues ? "Mostrar valores do patrimônio" : "Ocultar valores do patrimônio"} aria-pressed={hiddenValues} onClick={() => setHiddenValues(v => !v)}>{hiddenValues ? <EyeOff size={20}/> : <Eye size={20}/>}</button></div>
          <strong>{hiddenValues ? "R$ ••••••" : money(t.balance)}</strong>
          <p>Nas contas cadastradas, com movimentos confirmados até hoje.</p>
          <button className="text-btn" onClick={() => navigate("account")}>
            Ver minhas contas <ArrowUpRight size={15} />
          </button>
        </article>
        <article>
          <span>Quanto posso guardar?</span>
          <strong className={t.saving < 0 ? "negative" : ""}>
            {hiddenValues ? "R$ ••••••" : money(capacity.prudent)}
          </strong>
          <p>
            Estimativa para o mês atual, limitada pela sobra, pelo dinheiro
            livre e pelas despesas previstas.
          </p>
          <button className="text-btn" onClick={() => navigate("calendar")}>
            Planejar este mês <ArrowUpRight size={15} />
          </button>
        </article>
        <article>
          <span>Próximo horizonte</span>
          <strong className="home-next-date">
            {next ? dateLabel(next.completion!) : "No seu ritmo"}
          </strong>
          <p>
            {next
              ? `${next.goal.data.name} · conclusão estimada pelo plano, sem rendimento.`
              : "Escolha um objetivo e seu ritmo de aportes para estimar a próxima conquista."}
          </p>
          <button className="text-btn" onClick={() => navigate("goal")}>
            Meus horizontes <ArrowUpRight size={15} />
          </button>
        </article>
      </section>
      <button type="button" className="home52-goal" onClick={() => navigate("goal")}>
        <span className="home52-goal-icon"><Target size={23}/></span>
        <span className="home52-goal-content"><strong>Seus horizontes</strong><small>{mainGoal ? mainGoal.data.name : "Seu próximo objetivo começa aqui"}</small><span className="home52-goal-progress"><span style={{width: mainProgress ? `${Math.max(0, Math.min(100, Math.round(mainProgress.progress)))}%` : "0%"}}/></span></span>
        <ArrowRight size={20}/>
      </button>
      <details className="home52-more"><summary>Explorar meus dados financeiros</summary>
      <div className="home-month-stats">
        <Stat
          label="Receitas do mês"
          value={selected.income}
          tone="green"
          detail="Confirmadas no período selecionado"
        />
        <Stat
          label="Despesas do mês"
          value={selected.expense}
          detail="Transferências próprias não entram"
        />
        <Stat
          label="Patrimônio líquido"
          value={t.netWorth}
          detail="Contas + ativos − dívidas − faturas"
        />
        <Stat
          label="Dinheiro livre"
          value={t.available}
          detail="Saldo nas contas − reservas − faturas"
        />
      </div>
      {(account || category) && (
        <p className="footnote">
          Os filtros afetam movimentações e gráficos. Saldo geral, dinheiro
          livre, patrimônio e metas consideram todas as contas para manter as
          reservas consistentes.
        </p>
      )}
      <div className="home-actions">
        <button className="btn primary" onClick={() => add("expense")}>
          <Plus size={17} />
          Registrar despesa
        </button>
        <button className="btn" onClick={() => add("income")}>
          Registrar receita <Plus size={15} />
        </button>
        <button className="text-btn" onClick={() => navigate("connect")}>
          Organizar minhas contas <ArrowRight size={15} />
        </button>
      </div>
      <div className="home-modules">
        {layout.map((id) => (
          <div key={id} data-dashboard-section={id}>
            {components[id]}
          </div>
        ))}
      </div>
      </details>
      <p className="footnote">
        Os valores refletem somente os dados cadastrados. Projeções são
        estimativas e não alteram seus saldos.
      </p>
    </div>
  );
}
