import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  Download,
  FolderOpen,
  Info,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Modal, csvExport } from "../components/ui";
import { useFinance } from "../core/store";
import { dateLabel, money, number, rows, uid } from "../core/model";
import {
  forecastDefaults,
  forecastGoalImpact,
  freedomEstimate,
  projectForecast,
  validateForecast,
  type ForecastInput,
  type ForecastScenario,
} from "../core/forecast";
import "../future.css";

const COLORS = ["#0085ff", "#36a58c", "#9776dc"];
const terms = [
  { label: "1 ano", value: 12 },
  { label: "3 anos", value: 36 },
  { label: "5 anos", value: 60 },
  { label: "10 anos", value: 120 },
  { label: "20 anos", value: 240 },
];
type FutureTab = "forecast" | "whatif" | "decisions";

function Numeric({
  label,
  value,
  onChange,
  min = 0,
  max = 1e12,
  step = "0.01",
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: string;
  hint?: string;
}) {
  return (
    <label className="future-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Future({ navigate }: { navigate: (page: string) => void }) {
  const { doc, edit, message } = useFinance();
  const context = useMemo(() => forecastDefaults(doc!), [doc]);
  const [scenarios, setScenarios] = useState<ForecastScenario[]>(() => [
    { id: uid(), name: "Base", input: context.input },
  ]);
  const [selectedId, setSelectedId] = useState(scenarios[0].id);
  const [tab, setTab] = useState<FutureTab>("forecast");
  const [real, setReal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [withdrawal, setWithdrawal] = useState({
    amount: 0,
    month: 1,
    description: "",
  });
  const [withdrawalError, setWithdrawalError] = useState("");
  const [freedomRate, setFreedomRate] = useState(0);
  const selected = scenarios.find((s) => s.id === selectedId) ?? scenarios[0];
  const input = selected.input;
  const update = (patch: Partial<ForecastInput>) =>
    setScenarios((all) =>
      all.map((s) =>
        s.id === selected.id ? { ...s, input: { ...s.input, ...patch } } : s,
      ),
    );
  const calculated = useMemo(
    () =>
      scenarios.map((scenario) => {
        try {
          return {
            scenario,
            result: projectForecast(scenario.input),
            error: "",
          };
        } catch (e) {
          return { scenario, result: null, error: (e as Error).message };
        }
      }),
    [scenarios],
  );
  const active = calculated.find((c) => c.scenario.id === selected.id)!;
  const result = active.result;
  const saved = rows(doc!, "simulation").filter(
    (e) => e.data.tab === "forecast",
  );
  const goalImpact = useMemo(
    () =>
      result
        ? forecastGoalImpact(result, context.goals, context.completedGoalIds)
        : [],
    [result, context.goals, context.completedGoalIds],
  );
  const chartData = useMemo(
    () =>
      Array.from(
        {
          length: Math.max(
            ...calculated
              .filter((c) => c.result)
              .map((c) => c.result!.points.length),
            1,
          ),
        },
        (_, month) => {
          const row: Record<string, number | string> = {
            month,
            label: month ? `${month} m` : "Hoje",
          };
          for (const c of calculated) {
            const p = c.result?.points[month];
            if (p) row[c.scenario.id] = real ? p.realNetWorth : p.netWorth;
          }
          return row;
        },
      ),
    [calculated, real],
  );
  const freedom = useMemo(() => {
    if (!result || freedomRate <= 0) return null;
    try {
      return freedomEstimate(
        input.monthlyExpense,
        freedomRate,
        Math.max(0, result.last.financial),
      );
    } catch {
      return null;
    }
  }, [result, freedomRate, input.monthlyExpense]);
  const addScenario = () => {
    if (scenarios.length >= 3) return;
    const scenario = {
      id: uid(),
      name: scenarios.length === 1 ? "Conservador" : "Otimista",
      input: structuredClone(input),
    };
    setScenarios((all) => [...all, scenario]);
    setSelectedId(scenario.id);
    message(
      "Cenário copiado. Ajuste as hipóteses para comparar; nenhuma taxa foi presumida.",
    );
  };
  const save = async () => {
    if (!selected.name.trim()) {
      message("Dê um nome ao cenário antes de salvar.");
      return;
    }
    try {
      validateForecast(input);
      setSaving(true);
      await edit([
        {
          id: uid(),
          kind: "simulation",
          data: {
            name: selected.name.trim(),
            tab: "forecast",
            version: 1,
            values: input,
          },
        },
      ]);
      message(
        "Cenário salvo no seu cofre. Saldos e metas reais não foram alterados.",
      );
    } catch (e) {
      message((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const openSaved = (id: string) => {
    const stored = saved.find((s) => s.id === id);
    if (!stored) return;
    try {
      const values: ForecastInput = { ...context.input, ...stored.data.values };
      validateForecast(values);
      setScenarios((all) =>
        all.map((s) =>
          s.id === selected.id
            ? { ...s, name: stored.data.name, input: structuredClone(values) }
            : s,
        ),
      );
      message("Cenário aberto. As hipóteses salvas foram preservadas.");
    } catch {
      message(
        "Não foi possível abrir este cenário. Seus dados reais continuam preservados.",
      );
    }
  };
  const exportCsv = () => {
    const data = calculated.flatMap((c) =>
      c.result
        ? c.result.points.map((p) => [
            c.scenario.name,
            p.month,
            p.date,
            p.cash,
            p.invested,
            p.financial,
            c.scenario.input.goods,
            c.scenario.input.liabilities,
            p.netWorth,
            p.realNetWorth,
            p.income,
            p.expense,
            p.investmentReturn,
            p.allocation,
            p.withdrawal,
            p.freeFinancial,
          ])
        : [],
    );
    csvExport(
      [
        "Cenário",
        "Mês",
        "Data estimada",
        "Saldo em contas",
        "Investimentos",
        "Saldo financeiro",
        "Bens",
        "Dívidas e faturas",
        "Patrimônio nominal",
        "Patrimônio em reais de hoje",
        "Renda",
        "Despesas",
        "Rendimento hipotético",
        "Alocação interna para investimentos",
        "Retiradas",
        "Financeiro não reservado",
      ],
      data,
      "my-horizon-projecoes.csv",
    );
  };
  const viewValue = (p: { netWorth: number; realNetWorth: number }) =>
    real ? p.realNetWorth : p.netWorth;
  const reachLabel = (month?: number, date?: string) =>
    month === 0
      ? "Já atingido no ponto inicial"
      : month && date
        ? `${month} meses · ${dateLabel(date)}`
        : "Não atingido neste período";

  return (
    <div className="future-root">
      <section className="future-intro">
        <div>
          <span className="eyebrow">MEU FUTURO</span>
          <h2>Uma perspectiva para os seus planos.</h2>
          <p>
            Explore possibilidades com os seus números. O futuro é uma
            estimativa; as decisões continuam suas.
          </p>
        </div>
        <span className="future-simulation-badge">
          <ShieldCheck size={17} /> Simulação · seus saldos estão preservados
        </span>
      </section>
      <nav className="future-tabs" aria-label="Ferramentas do Meu Futuro">
        {(
          [
            { id: "forecast", name: "Projeção", icon: ChartNoAxesCombined },
            { id: "whatif", name: "E se…", icon: Sparkles },
            { id: "decisions", name: "Decisões", icon: Target },
          ] as const
        ).map(({ id, name, icon: Icon }) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon size={18} />
            {name}
          </button>
        ))}
      </nav>
      <section className="panel future-context">
        <div>
          <Wallet size={20} />
          <div>
            <strong>Comece pelo que já é seu.</strong>
            <p>
              {context.historyMonths
                ? `Renda e gastos iniciais: ${context.incomeBasis}.`
                : "Ainda não há movimentações confirmadas para estimar sua renda e seus gastos. Preencha suas hipóteses abaixo."}
            </p>
          </div>
        </div>
        <button
          className="btn"
          onClick={() => {
            update(structuredClone(context.input));
            message(
              "Premissas do cenário atualizadas a partir dos registros. Outros cenários foram preservados.",
            );
          }}
        >
          <RotateCcw size={16} /> Usar meus dados atuais
        </button>
      </section>
      <section
        className="future-scenario-bar"
        aria-label="Cenários em comparação"
      >
        <div className="future-case-buttons">
          {scenarios.map((s, i) => (
            <button
              key={s.id}
              className={s.id === selected.id ? "active" : ""}
              aria-pressed={s.id === selected.id}
              onClick={() => setSelectedId(s.id)}
            >
              <span style={{ background: COLORS[i] }} />
              {s.name || `Cenário ${i + 1}`}
            </button>
          ))}
        </div>
        <button
          className="btn"
          disabled={scenarios.length >= 3}
          onClick={addScenario}
        >
          <Plus size={16} /> Comparar cenário
          {scenarios.length >= 3 ? " (3/3)" : ""}
        </button>
      </section>
      <div
        className={`future-layout ${tab === "decisions" ? "future-decisions-layout" : ""}`}
      >
        <section className="panel future-controls">
          <div className="future-section-heading">
            <div>
              <span className="eyebrow">HIPÓTESES EDITÁVEIS</span>
              <h3>
                {tab === "whatif"
                  ? "Pequenas mudanças. Novas possibilidades."
                  : "Construa seu cenário"}
              </h3>
            </div>
            {scenarios.length > 1 && (
              <button
                className="icon-btn"
                aria-label={`Remover ${selected.name} da comparação`}
                onClick={() => {
                  const next = scenarios.filter((s) => s.id !== selected.id);
                  setScenarios(next);
                  setSelectedId(next[0].id);
                }}
              >
                <Trash2 size={17} />
              </button>
            )}
          </div>
          <label className="future-field">
            <span>Nome do cenário</span>
            <input
              maxLength={80}
              value={selected.name}
              onChange={(e) =>
                setScenarios((all) =>
                  all.map((s) =>
                    s.id === selected.id ? { ...s, name: e.target.value } : s,
                  ),
                )
              }
            />
          </label>
          <div className="future-term-buttons" aria-label="Prazo da projeção">
            {terms.map((term) => (
              <button
                key={term.value}
                className={input.months === term.value ? "active" : ""}
                aria-pressed={input.months === term.value}
                onClick={() => update({ months: term.value })}
              >
                {term.label}
              </button>
            ))}
          </div>
          <div className="future-fields">
            <Numeric
              label="Período personalizado (meses)"
              value={input.months}
              onChange={(v) => update({ months: v })}
              min={1}
              max={600}
              step="1"
            />
            <label className="future-field">
              <span>Data inicial da hipótese</span>
              <input
                type="date"
                value={input.start}
                onChange={(e) => update({ start: e.target.value })}
              />
            </label>
            <Numeric
              label="Renda mensal (R$)"
              value={input.monthlyIncome}
              onChange={(v) => update({ monthlyIncome: v })}
            />
            <Numeric
              label="Despesas mensais (R$)"
              value={input.monthlyExpense}
              onChange={(v) => update({ monthlyExpense: v })}
            />
            <Numeric
              label="Aporte mensal em investimentos (R$)"
              value={input.monthlyAllocation}
              onChange={(v) => update({ monthlyAllocation: v })}
              hint="Transfere das contas para investimentos; não cria nem consome patrimônio."
            />
            <Numeric
              label="Patrimônio desejado (R$)"
              value={input.target}
              onChange={(v) => update({ target: v })}
              hint="Opcional. Zero significa sem marco patrimonial."
            />
          </div>
          <details className="future-disclosure">
            <summary>
              Seu ponto de partida <ChevronRight size={16} />
            </summary>
            <div className="future-fields">
              <Numeric
                label="Saldo inicial em contas (R$)"
                value={input.initialCash}
                onChange={(v) => update({ initialCash: v })}
                min={-1e12}
              />
              <Numeric
                label="Investimentos iniciais (R$)"
                value={input.initialInvested}
                onChange={(v) => update({ initialInvested: v })}
              />
              <Numeric
                label="Bens cadastrados (R$)"
                value={input.goods}
                onChange={(v) => update({ goods: v })}
              />
              <Numeric
                label="Dívidas e faturas em aberto (R$)"
                value={input.liabilities}
                onChange={(v) => update({ liabilities: v })}
              />
              <Numeric
                label="Já reservado em horizontes (R$)"
                value={input.reserved}
                onChange={(v) => update({ reserved: v })}
                hint="Parte do saldo financeiro. Não é somada ao patrimônio."
              />
            </div>
          </details>
          <details className="future-disclosure">
            <summary>
              Inflação, crescimento e rendimentos <ChevronRight size={16} />
            </summary>
            <div className="future-fields">
              <Numeric
                label="Inflação anual hipotética (%)"
                value={input.annualInflation}
                onChange={(v) => update({ annualInflation: v })}
                max={100}
                hint="Também reajusta as despesas gradualmente."
              />
              <Numeric
                label="Crescimento anual da renda (%)"
                value={input.annualIncomeGrowth}
                onChange={(v) => update({ annualIncomeGrowth: v })}
                min={-99.99}
                max={100}
              />
              <Numeric
                label="Rentabilidade anual hipotética (%)"
                value={input.annualReturn}
                onChange={(v) => update({ annualReturn: v })}
                min={-99.99}
                max={100}
                hint="Incide apenas nos investimentos. Não há retorno garantido."
              />
              <Numeric
                label="Crescimento anual do aporte (%)"
                value={input.annualAllocationGrowth}
                onChange={(v) => update({ annualAllocationGrowth: v })}
                min={-99.99}
                max={100}
              />
            </div>
            <p className="future-note">
              As taxas começam em zero e são hipóteses suas. Os nomes Base,
              Conservador e Otimista não definem taxas automaticamente.
            </p>
          </details>
          <details className="future-disclosure" open={tab === "whatif"}>
            <summary>
              Mudanças na sua rotina <ChevronRight size={16} />
            </summary>
            <div className="future-fields">
              <Numeric
                label="Mudança na renda (%)"
                value={input.incomeChange}
                onChange={(v) => update({ incomeChange: v })}
                min={-100}
                max={500}
                hint="Ex.: 20 para aumento de 20%."
              />
              <Numeric
                label="Mudança nas despesas (%)"
                value={input.expenseChange}
                onChange={(v) => update({ expenseChange: v })}
                min={-100}
                max={500}
                hint="Ex.: −10 para reduzir gastos em 10%."
              />
              <Numeric
                label="Economia adicional por mês (R$)"
                value={input.expenseReduction}
                onChange={(v) => update({ expenseReduction: v })}
                hint="Reduz as despesas, até o limite de zero."
              />
              <Numeric
                label="Meses de perda temporária de renda"
                value={input.incomeLossMonths}
                onChange={(v) => update({ incomeLossMonths: v })}
                max={600}
                step="1"
              />
              <Numeric
                label="Perda de renda a partir do mês"
                value={input.incomeLossStart}
                onChange={(v) => update({ incomeLossStart: v })}
                min={1}
                max={600}
                step="1"
              />
              <Numeric
                label="Parcela da renda perdida (%)"
                value={input.incomeLossPercent}
                onChange={(v) => update({ incomeLossPercent: v })}
                max={100}
              />
            </div>
          </details>
          <details className="future-disclosure">
            <summary>
              Retiradas futuras <ChevronRight size={16} />
            </summary>
            <p className="future-note">
              São saídas hipotéticas das contas, além das despesas mensais.
              Inclua apenas valores ainda não considerados nelas. Meses fora do
              período não entram no cálculo.
            </p>
            {input.withdrawals.map((w) => (
              <div className="future-withdrawal" key={w.id}>
                <div>
                  <strong>{w.description || "Retirada"}</strong>
                  <small>
                    Mês {w.month} · {money(w.amount)}
                    {w.month > input.months ? " · fora do período" : ""}
                  </small>
                </div>
                <button
                  className="icon-btn"
                  aria-label={`Remover retirada ${w.description}`}
                  onClick={() =>
                    update({
                      withdrawals: input.withdrawals.filter(
                        (item) => item.id !== w.id,
                      ),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div className="future-fields">
              <label className="future-field">
                <span>Descrição da retirada</span>
                <input
                  maxLength={200}
                  value={withdrawal.description}
                  onChange={(e) =>
                    setWithdrawal((v) => ({
                      ...v,
                      description: e.target.value,
                    }))
                  }
                />
              </label>
              <Numeric
                label="Mês da retirada"
                value={withdrawal.month}
                onChange={(v) => setWithdrawal((s) => ({ ...s, month: v }))}
                min={1}
                max={600}
                step="1"
              />
              <Numeric
                label="Valor da retirada (R$)"
                value={withdrawal.amount}
                onChange={(v) => setWithdrawal((s) => ({ ...s, amount: v }))}
              />
            </div>
            {withdrawalError && (
              <p className="future-error" role="alert">
                {withdrawalError}
              </p>
            )}
            <button
              className="btn"
              disabled={input.withdrawals.length >= 120}
              onClick={() => {
                const w = {
                  id: uid(),
                  month: withdrawal.month,
                  amount: withdrawal.amount,
                  description: withdrawal.description.trim(),
                };
                try {
                  if (!w.description)
                    throw Error("Descreva a retirada para identificá-la.");
                  validateForecast({
                    ...input,
                    withdrawals: [...input.withdrawals, w],
                  });
                  update({ withdrawals: [...input.withdrawals, w] });
                  setWithdrawal({ amount: 0, month: 1, description: "" });
                  setWithdrawalError("");
                } catch (e) {
                  setWithdrawalError((e as Error).message);
                }
              }}
            >
              <Plus size={16} /> Incluir retirada na hipótese
            </button>
          </details>
          <button
            className="btn primary future-save"
            disabled={saving || !!active.error || !selected.name.trim()}
            onClick={save}
          >
            <Save size={17} />
            {saving ? "Salvando…" : "Salvar cenário no cofre"}
          </button>
          <p className="future-note">
            Editar ou salvar uma simulação não cria movimentações, aportes ou
            metas.
          </p>
        </section>
        <div className="future-results">
          {active.error && (
            <div className="future-error panel" role="alert">
              <strong>Confira suas hipóteses</strong>
              <p>{active.error}</p>
            </div>
          )}
          {result && (
            <>
              <section className="future-hero">
                <div className="future-hero-heading">
                  <span>
                    <ChartNoAxesCombined size={17} /> SEU FUTURO EM PERSPECTIVA
                  </span>
                  <span className="future-hypothesis">Estimativa</span>
                </div>
                <p>
                  Patrimônio em{" "}
                  {input.months % 12 === 0
                    ? `${number(input.months / 12, 0)} ${input.months === 12 ? "ano" : "anos"}`
                    : `${input.months} ${input.months === 1 ? "mês" : "meses"}`}
                </p>
                <strong>{money(viewValue(result.last))}</strong>
                <small>
                  {real
                    ? "Poder de compra de hoje, descontada a inflação configurada."
                    : "Valor nominal, sem descontar a inflação."}
                </small>
                <div className="future-hero-bottom">
                  <div>
                    <span>Saldo financeiro projetado</span>
                    <b>{money(result.last.financial)}</b>
                  </div>
                  <div>
                    <span>Fora das reservas atuais</span>
                    <b>{money(result.last.freeFinancial)}</b>
                  </div>
                </div>
              </section>
              <div className="future-stat-grid">
                <div className="panel future-stat">
                  <span>Sobra no primeiro mês</span>
                  <strong
                    className={
                      result.points[1].income - result.points[1].expense < 0
                        ? "future-negative"
                        : ""
                    }
                  >
                    {money(result.points[1].income - result.points[1].expense)}
                  </strong>
                  <small>
                    Renda menos despesas, antes de alocações e retiradas.
                  </small>
                </div>
                <div className="panel future-stat">
                  <span>Rendimentos estimados</span>
                  <strong>{money(result.last.accumulatedReturns)}</strong>
                  <small>
                    Hipótese sobre investimentos. Sem impostos e taxas.
                  </small>
                </div>
                <div className="panel future-stat">
                  <span>Prazo para o patrimônio desejado</span>
                  <strong className="future-date">
                    {input.target > 0
                      ? reachLabel(
                          (real ? result.reachedReal : result.reachedNominal)
                            ?.month,
                          (real ? result.reachedReal : result.reachedNominal)
                            ?.date,
                        )
                      : "Defina um valor, se desejar"}
                  </strong>
                  <small>
                    {input.target > 0
                      ? `${money(input.target)} ${real ? "em poder de compra de hoje" : "nominais"}.`
                      : "O acompanhamento funciona sem um marco."}
                  </small>
                </div>
              </div>
              {result.firstShortfall && (
                <div className="future-warning">
                  <Info size={19} />
                  <div>
                    <strong>Possível insuficiência nas contas</strong>
                    <p>
                      {result.firstShortfall.month === 0
                        ? "O saldo inicial em contas já é negativo."
                        : `A partir do mês ${result.firstShortfall.month}, em ${dateLabel(result.firstShortfall.date)}, as contas podem ficar negativas.`}{" "}
                      Investimentos não são resgatados automaticamente nesta
                      hipótese.
                    </p>
                  </div>
                </div>
              )}
              {result.unmetAllocation > 0 && (
                <div className="future-warning">
                  <Info size={19} />
                  <p>
                    {money(result.unmetAllocation)} dos aportes em investimentos
                    não cabem no caixa projetado e não foram realizados na
                    simulação.
                  </p>
                </div>
              )}
              <section className="panel future-chart-panel">
                <div className="future-section-heading">
                  <div>
                    <h3>Evolução do patrimônio</h3>
                    <p>
                      Linhas estimadas, a partir das premissas de cada cenário.
                    </p>
                  </div>
                  <div
                    className="future-value-toggle"
                    aria-label="Valores da projeção"
                  >
                    <button
                      aria-pressed={!real}
                      className={!real ? "active" : ""}
                      onClick={() => setReal(false)}
                    >
                      Nominais
                    </button>
                    <button
                      aria-pressed={real}
                      className={real ? "active" : ""}
                      onClick={() => setReal(true)}
                    >
                      Em reais de hoje
                    </button>
                  </div>
                </div>
                <div
                  className="future-chart"
                  role="img"
                  aria-label={`Projeção do patrimônio em ${real ? "poder de compra atual" : "valores nominais"}. Os valores completos estão na tabela abaixo.`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ left: 0, right: 12, top: 16, bottom: 0 }}
                      accessibilityLayer
                    >
                      <CartesianGrid
                        vertical={false}
                        stroke="var(--line)"
                        strokeDasharray="3 5"
                      />
                      <XAxis
                        dataKey="month"
                        tickFormatter={(v) =>
                          Number(v) === 0 ? "Hoje" : `${v} m`
                        }
                        minTickGap={36}
                        tick={{ fill: "var(--muted)", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        width={68}
                        tickFormatter={(v) =>
                          Math.abs(Number(v)) >= 1e6
                            ? `${number(Number(v) / 1e6, 1)} mi`
                            : Math.abs(Number(v)) >= 1000
                              ? `${number(Number(v) / 1000, 0)} mil`
                              : number(Number(v), 0)
                        }
                        tick={{ fill: "var(--muted)", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(v) => money(Number(v))}
                        labelFormatter={(v) =>
                          Number(v) === 0
                            ? "Ponto de partida"
                            : `Final do mês ${v}`
                        }
                        contentStyle={{
                          background: "var(--panel)",
                          border: "1px solid var(--line)",
                          borderRadius: 12,
                        }}
                      />
                      <Legend />
                      {calculated.map(
                        (c, i) =>
                          c.result && (
                            <Line
                              key={c.scenario.id}
                              type="monotone"
                              name={c.scenario.name || `Cenário ${i + 1}`}
                              dataKey={c.scenario.id}
                              stroke={COLORS[i]}
                              strokeWidth={2.5}
                              strokeDasharray="5 3"
                              dot={false}
                              connectNulls={false}
                              isAnimationActive={false}
                            />
                          ),
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="future-note">
                  Comparação pelo número de meses a partir da data inicial de
                  cada cenário. Valores corrigidos usam a inflação de cada
                  cenário.
                </p>
              </section>
              <section className="panel future-comparison">
                <div className="future-section-heading">
                  <div>
                    <h3>
                      {tab === "decisions"
                        ? "Sua decisão, com os efeitos à vista"
                        : "Compare as possibilidades"}
                    </h3>
                    <p>
                      Até três hipóteses lado a lado. Nenhuma é uma previsão
                      garantida.
                    </p>
                  </div>
                  {scenarios.length < 3 && (
                    <button className="text-btn" onClick={addScenario}>
                      Adicionar cenário <Plus size={15} />
                    </button>
                  )}
                </div>
                <div className="future-compare-grid">
                  {calculated.map((c, i) => (
                    <article
                      className="future-compare-card"
                      key={c.scenario.id}
                      style={{ borderTopColor: COLORS[i] }}
                    >
                      <strong>{c.scenario.name || `Cenário ${i + 1}`}</strong>
                      {c.result ? (
                        <>
                          <p>
                            {c.scenario.input.months} meses · desde{" "}
                            {dateLabel(c.scenario.input.start)}
                          </p>
                          <b>{money(viewValue(c.result.last))}</b>
                          <small>
                            Patrimônio {real ? "em reais de hoje" : "nominal"}
                          </small>
                          <dl>
                            <div>
                              <dt>Saldo financeiro</dt>
                              <dd>{money(c.result.last.financial)}</dd>
                            </div>
                            <div>
                              <dt>Alocado em investimentos</dt>
                              <dd>
                                {money(c.result.last.accumulatedAllocations)}
                              </dd>
                            </div>
                            <div>
                              <dt>Rendimentos hipotéticos</dt>
                              <dd>{money(c.result.last.accumulatedReturns)}</dd>
                            </div>
                            <div>
                              <dt>Retiradas</dt>
                              <dd>
                                {money(c.result.last.accumulatedWithdrawals)}
                              </dd>
                            </div>
                            <div>
                              <dt>Prazo até o marco</dt>
                              <dd>
                                {c.scenario.input.target > 0
                                  ? reachLabel(
                                      (real
                                        ? c.result.reachedReal
                                        : c.result.reachedNominal
                                      )?.month,
                                      (real
                                        ? c.result.reachedReal
                                        : c.result.reachedNominal
                                      )?.date,
                                    )
                                  : "Não definido"}
                              </dd>
                            </div>
                            <div>
                              <dt>Liquidez das contas</dt>
                              <dd>
                                {c.result.firstShortfall
                                  ? `Atenção ${c.result.firstShortfall.month === 0 ? "no início" : `no mês ${c.result.firstShortfall.month}`}`
                                  : "Sem saldo negativo no período"}
                              </dd>
                            </div>
                          </dl>
                        </>
                      ) : (
                        <p className="future-negative">
                          Revise as hipóteses deste cenário.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
                {tab === "decisions" && (
                  <div className="future-decision-notes">
                    <div>
                      <ShieldCheck size={20} />
                      <div>
                        <strong>Mais investimento, menos caixa imediato</strong>
                        <p>
                          O aporte transfere dinheiro das contas para os
                          investimentos. A rentabilidade pode aumentar ou
                          reduzir o patrimônio; a liquidez e os riscos dependem
                          do investimento escolhido.
                        </p>
                      </div>
                    </div>
                    <div>
                      <Target size={20} />
                      <div>
                        <strong>Economizar cria espaço para horizontes</strong>
                        <p>
                          Reduzir despesas aumenta o dinheiro disponível. Prazo,
                          renda e inflação influenciam o resultado; compare
                          também a suficiência do caixa e o esforço mensal.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </section>
              <section className="panel future-goal-impact">
                <div className="future-section-heading">
                  <div>
                    <h3>O que muda para seus horizontes</h3>
                    <p>
                      Hipótese de orçamento: uma única sobra mensal distribuída
                      por prioridade e dependências. Não substitui os planos
                      salvos.
                    </p>
                  </div>
                  <button className="text-btn" onClick={() => navigate("goal")}>
                    Ver horizontes <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="future-capacity">
                  <span>
                    Capacidade no primeiro mês
                    <b>{money(result.points[1].goalCapacity)}</b>
                  </span>
                  <span>
                    Aportes mensais já planejados
                    <b>{money(context.monthlyGoalPlan)}</b>
                  </span>
                </div>
                {!goalImpact.length ? (
                  <p className="future-note">
                    Seus horizontes em andamento aparecerão aqui. Nenhuma meta é
                    criada por esta simulação.
                  </p>
                ) : (
                  <div className="future-impact-list">
                    {goalImpact.map((g) => (
                      <div key={g.id}>
                        <div>
                          <strong>{g.name}</strong>
                          <small>
                            Falta {money(g.remaining)}
                            {g.deadline
                              ? ` · prazo ${dateLabel(g.deadline)}`
                              : " · sem prazo definido"}
                          </small>
                        </div>
                        <span>
                          {g.completion
                            ? `${dateLabel(g.completion)} · hipótese de orçamento${g.deadline && g.completion > g.deadline ? " após o prazo" : ""}`
                            : "Sem conclusão neste período"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="future-note">
                  Usa a sobra após despesas, retiradas e aportes em
                  investimentos; não usa seu saldo inicial livre. O primeiro
                  horizonte recebe os recursos até concluir, seguido pelos
                  próximos, respeitando as dependências cadastradas. Um
                  pré-requisito concluído libera o próximo horizonte no mês
                  seguinte; ciclos ou vínculos indisponíveis não recebem datas.
                  Aportes já planejados servem como referência e não são
                  cobrados novamente. Este cronograma pode diferir do Início e
                  dos detalhes, que mostram os planos individuais, e do Life,
                  que também permite uma hipótese com orçamento constante. O
                  gráfico de patrimônio não distribui dinheiro entre metas.
                  Nenhum dinheiro é reservado ou movimentado.
                </p>
              </section>
              <section className="panel future-freedom">
                <div className="future-section-heading">
                  <div>
                    <span className="eyebrow">HORIZON FREEDOM</span>
                    <h3>Que patrimônio sustentaria sua rotina?</h3>
                    <p>
                      Uma referência matemática para conversar com o futuro.
                    </p>
                  </div>
                  <ShieldCheck size={23} />
                </div>
                <Numeric
                  label="Retirada anual hipotética (%)"
                  value={freedomRate}
                  onChange={setFreedomRate}
                  max={100}
                  hint="Escolha uma hipótese maior que zero. Não há percentual seguro presumido."
                />
                {freedom ? (
                  <>
                    <div className="future-capacity">
                      <span>
                        Patrimônio de referência<b>{money(freedom.target)}</b>
                      </span>
                      <span>
                        Retirada mensal no saldo financeiro final
                        <b>{money(freedom.monthlyHypothetical)}</b>
                      </span>
                    </div>
                    <button
                      className="btn"
                      onClick={() => update({ target: freedom.target })}
                    >
                      Usar como patrimônio desejado
                    </button>
                  </>
                ) : (
                  <p className="future-note">
                    Informe a taxa para estimar. Despesa anual ÷ percentual de
                    retirada anual.
                  </p>
                )}
                <p className="future-note">
                  Usa suas despesas mensais iniciais e o saldo financeiro final
                  nominal, sem bens. Não é promessa de renda passiva nem
                  considera impostos, longevidade, volatilidade ou sequência de
                  retornos. Uma retirada pode consumir o principal; inflação e
                  taxas mudam o resultado.
                </p>
              </section>
              <details className="panel future-disclosure future-table-panel">
                <summary>
                  Projeção mensal completa <ChevronRight size={16} />
                </summary>
                <div className="future-section-heading">
                  <p>
                    Valores nominais, exceto a coluna corrigida pela inflação.
                  </p>
                  <button className="btn" onClick={exportCsv}>
                    <Download size={16} /> Exportar comparação CSV
                  </button>
                </div>
                <div
                  className="future-table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Tabela mensal da projeção"
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Mês</th>
                        <th>Contas</th>
                        <th>Investimentos</th>
                        <th>Patrimônio nominal</th>
                        <th>Em reais de hoje</th>
                        <th>Renda</th>
                        <th>Despesas</th>
                        <th>Aportes internos</th>
                        <th>Rendimentos</th>
                        <th>Retiradas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.points.map((p) => (
                        <tr key={p.month}>
                          <th scope="row">
                            {p.month === 0 ? "Inicial" : p.month}
                            <small>{dateLabel(p.date)}</small>
                          </th>
                          <td>{money(p.cash)}</td>
                          <td>{money(p.invested)}</td>
                          <td>{money(p.netWorth)}</td>
                          <td>{money(p.realNetWorth)}</td>
                          <td>{money(p.income)}</td>
                          <td>{money(p.expense)}</td>
                          <td>{money(p.allocation)}</td>
                          <td>{money(p.investmentReturn)}</td>
                          <td>{money(p.withdrawal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <details className="panel future-disclosure">
                <summary>
                  Como esta estimativa funciona <Info size={17} />
                </summary>
                <ul className="future-assumptions">
                  <li>
                    Cada linha representa um mês completo após a data inicial,
                    com o mesmo dia ajustado ao último dia do mês. O primeiro
                    período começa no mês 1; não há pró-rata do mês atual.
                  </li>
                  <li>
                    Taxas anuais são convertidas por equivalência composta.
                    Rendimentos incidem no saldo investido no início do mês.
                    Renda, despesas, retiradas e alocação acontecem ao fim do
                    período; o novo aporte rende a partir do mês seguinte.
                  </li>
                  <li>
                    A renda cresce gradualmente pela taxa configurada. Despesas
                    crescem pela inflação; redução adicional é nominal fixa.
                    Perda temporária vale apenas para os meses escolhidos.
                  </li>
                  <li>
                    Patrimônio = contas + investimentos + bens − dívidas e
                    faturas. Reservas de metas já fazem parte do dinheiro, e
                    limite de cartão não entra. Transferências próprias não
                    entram como renda ou despesa.
                  </li>
                  <li>
                    Bens e dívidas ficam constantes em valores nominais: não há
                    valorização de bens nem amortização ou juros de dívidas
                    automáticos. Despesas não diminuem o saldo de dívida nesta
                    simulação. Ajuste as premissas para evitar considerar
                    parcelas duas vezes.
                  </li>
                  <li>
                    Caixa negativo é mostrado como insuficiência. Sem caixa
                    suficiente, o aporte é limitado ao que existe nas contas;
                    não há empréstimo, resgate ou pagamento automático.
                  </li>
                  <li>
                    Dinheiro fora das reservas = saldo financeiro menos o valor
                    reservado inicial, mantido constante. Inclui investimentos e
                    não representa necessariamente liquidez imediata. As metas
                    recebem apenas uma distribuição visual da sobra.
                  </li>
                  <li>
                    Resultados são hipóteses, sem impostos, taxas, eventos
                    imprevisíveis ou garantias de rendimento. Preços reais usam
                    o poder de compra da data inicial de cada cenário.
                  </li>
                </ul>
              </details>
            </>
          )}
        </div>
      </div>
      <section className="panel future-saved">
        <div className="future-section-heading">
          <div>
            <h3>Cenários salvos</h3>
            <p>
              Retome suas hipóteses, sem alterar a sua vida financeira real.
            </p>
          </div>
          <span className="pill">{saved.length}</span>
        </div>
        {saved.length ? (
          saved.map((s) => (
            <div className="future-saved-row" key={s.id}>
              <div>
                <strong>{s.data.name}</strong>
                <small>
                  {s.data.values?.months} meses · hipótese salva em{" "}
                  {dateLabel(s.updatedAt.slice(0, 10))}
                </small>
              </div>
              <button className="btn" onClick={() => openSaved(s.id)}>
                <FolderOpen size={16} /> Abrir
              </button>
              <button
                className="icon-btn"
                aria-label={`Excluir cenário salvo ${s.data.name}`}
                onClick={() => setDeleting(s.id)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))
        ) : (
          <div className="future-empty">
            <CalendarDays size={26} />
            <p>Seu próximo plano pode começar aqui.</p>
            <small>
              Salve um cenário para continuar depois, em qualquer dispositivo
              sincronizado.
            </small>
          </div>
        )}
      </section>
      <div className="future-links">
        <button className="btn" onClick={() => navigate("simulations")}>
          Abrir simuladores existentes <ArrowUpRight size={16} />
        </button>
        <button className="btn" onClick={() => navigate("asset")}>
          Meu patrimônio e investimentos <ArrowUpRight size={16} />
        </button>
      </div>
      {deleting && (
        <Modal title="Excluir cenário salvo?" onClose={() => setDeleting(null)}>
          <p>
            Apenas esta hipótese será removida. Seus saldos, investimentos e
            metas permanecem preservados.
          </p>
          <button
            className="btn danger"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const s = saved.find((e) => e.id === deleting);
                if (s) await edit([{ ...s, deleted: true }]);
                setDeleting(null);
                message("Cenário excluído.");
              } catch (e) {
                message((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            Excluir cenário
          </button>
        </Modal>
      )}
    </div>
  );
}
