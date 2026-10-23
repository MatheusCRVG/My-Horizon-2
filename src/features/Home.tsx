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
  PiggyBank,
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
import { HorizonPulse, ScoreCard } from "./Intelligence";

export function Dashboard({
  month,
  account,
  category,
  navigate,
  add,
  pulseBaseline,
  setMonth,
}: {
  month: string;
  account: string;
  category: string;
  navigate: (p: string) => void;
  add: (type?: "income" | "expense") => void;
  pulseBaseline: PulseSnapshot | null;
  setMonth: (month: string) => void;
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
  const past = totals(doc!, new Date(Number(month.slice(0,4)), Number(month.slice(5))-2, 1).toISOString().slice(0,7));
  const growth = past.balance ? (t.balance - past.balance) / Math.abs(past.balance) * 100 : null;
  const mainGoal = objectives(doc!).find(g => !g.data.archived);
  const mainProgress = mainGoal ? savingSummary(doc!, mainGoal) : null;
  return (
    <div className="home-workspace home52-premium">
      <section className="home52-hero">
        <div className="home52-hero-copy">
          <h2><strong>{greeting}</strong><span>Seu próximo horizonte começa aqui.</span></h2>
          <label className="home52-month"><CalendarDays size={20}/><span>{new Date(Number(month.slice(0,4)),Number(month.slice(5))-1,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}</span><input aria-label="Selecionar mês" type="month" value={month} onChange={e=>{if(e.target.value) setMonth(e.target.value)}} /></label>
        </div>
      </section>
      {!rows(doc!, "account").length && (
        <section className="start-hint"><div><h3>Seu dinheiro começa aqui</h3><p>Cadastre sua primeira conta para acompanhar seus objetivos.</p></div><button className="btn primary" onClick={() => navigate("account")}>Adicionar conta <ArrowRight size={16}/></button></section>
      )}
      <section className="home52-overview" aria-label="Resumo do meu dinheiro">
        <article className="home52-wealth">
          <div className="home52-wealth-top">
            <div className="home52-wealth-title"><span>Meu patrimônio</span><button type="button" aria-label={hiddenValues?"Mostrar valores":"Ocultar valores"} aria-pressed={hiddenValues} onClick={()=>setHiddenValues(v=>!v)}>{hiddenValues?<EyeOff size={22}/>:<Eye size={22}/>}</button></div>
            {growth !== null && <span className={`home52-growth ${growth>=0?"positive":"negative"}`}>{growth>=0?"↗":"↘"} {growth>=0?"+":""}{growth.toLocaleString("pt-BR",{maximumFractionDigits:1})}%<small>vs. mês anterior</small></span>}
          </div>
          <strong className="home52-wealth-amount">{hiddenValues?"R$ ••••••":money(t.balance)}</strong>
          <p>Nas contas cadastradas, com movimentos confirmados até hoje.</p>
          <div className="home52-wealth-chart" aria-hidden="true"><svg viewBox="0 0 600 110" preserveAspectRatio="none"><defs><linearGradient id="h52line" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#d5eaff"/><stop offset="1" stopColor="#1885ff"/></linearGradient></defs><path d="M0 87 C55 74 70 89 110 84 S167 63 206 73 S266 45 303 58 S368 62 406 36 S466 51 506 25 S557 36 600 8" fill="none" stroke="url(#h52line)" strokeWidth="5" strokeLinecap="round"/><circle cx="600" cy="8" r="7" fill="#1685ff" stroke="white" strokeWidth="4"/></svg></div>
        </article>
        <div className="home52-mini-grid">
          <button type="button" className="home52-mini" onClick={()=>navigate("calendar")}><span className="home52-icon"><PiggyBank size={25}/></span><span>Quanto posso guardar?</span><strong>{hiddenValues?"R$ ••••••":money(capacity.prudent)}</strong><small>Estimativa para este mês</small><ArrowRight className="home52-mini-arrow" size={21}/></button>
          <button type="button" className="home52-mini" onClick={()=>navigate("goal")}><span className="home52-icon"><Target size={25}/></span><span>Próximo horizonte</span><strong>{next?dateLabel(next.completion!):"Comece hoje"}</strong><small>{next?next.goal.data.name:"Escolha sua próxima meta"}</small><ArrowRight className="home52-mini-arrow" size={21}/></button>
        </div>
        <button type="button" className="home52-goal" onClick={() => navigate("goal")}>
          <span className="home52-goal-content"><strong>Seus horizontes</strong><small>{mainGoal?`Seu plano principal está ${mainProgress&&mainProgress.target>0?Math.round(mainProgress.saved/mainProgress.target*100):0}% concluído.`:"Transforme planos em conquistas."}</small><span className="home52-goal-progress"><span style={{width:mainProgress&&mainProgress.target>0?`${Math.min(100,Math.max(0,mainProgress.saved/mainProgress.target*100))}%`:"0%"}}/></span></span>
          <span className="home52-goal-art" aria-hidden="true"/>
          <span className="home52-goal-arrow"><ArrowRight size={21}/></span>
        </button>
      </section>
      <button type="button" className="home52-new" onClick={()=>add("expense")} aria-label="Novo lançamento"><Plus size={26}/> Novo</button>
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
