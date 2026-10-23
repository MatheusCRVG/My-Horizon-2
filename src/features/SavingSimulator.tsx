import { useState } from "react";
import { Save, Plus, Target, FolderOpen, Trash2 } from "lucide-react";
import { Modal, Stat } from "../components/ui";
import { useFinance } from "../core/store";
import {
  addMonths,
  dateLabel,
  money,
  rows,
  today,
  uid,
  type Entity,
} from "../core/model";
import {
  planStreams,
  projectSavings,
  validatePlan,
  validDate,
  type SavingPlan,
} from "../core/contributions";
import { PlanControls, resolvePlan, dateConvention } from "./SavingPlanner";
import { ProjectionChart } from "./SavingAnalysis";
type Case = {
  name: string;
  target: number;
  initial: number;
  rate: number;
  horizon: number;
  plan: SavingPlan;
};
const initialCase = (): Case => ({
  name: "Meu plano",
  target: 10000,
  initial: 0,
  rate: 0,
  horizon: 24,
  plan: {
    mode: "monthly",
    monthly: 500,
    firstDate: addMonths(today(), 1),
    deadline: "",
    months: 12,
    effective: today(),
    extras: [],
  },
});
function calculate(v: Case) {
  if (
    ![v.target, v.initial, v.rate, v.horizon].every(Number.isFinite) ||
    v.target <= 0 ||
    v.initial < 0 ||
    v.rate < 0 ||
    v.rate > 100 ||
    !Number.isInteger(v.horizon) ||
    v.horizon < 1 ||
    v.horizon > 600
  )
    throw Error(
      "Confira valor desejado, saldo inicial, taxa e horizonte (1 a 600 meses).",
    );
  const plan = resolvePlan(v.plan, v.target, v.initial);
  validatePlan(plan);
  const full = projectSavings({
    target: v.target,
    initial: v.initial,
    streams: planStreams(plan),
    monthlyRate: v.rate,
  });
  const until = plan.mode === "monthly" ? undefined : plan.deadline;
  if (until && (!validDate(until) || until < today()))
    throw Error("Escolha um prazo futuro para a projeção.");
  const projection = projectSavings({
    target: v.target,
    initial: v.initial,
    streams: planStreams(plan),
    monthlyRate: v.rate,
    months: v.horizon,
    until,
  });
  return { plan, full, projection };
}
export function GoalConversion({
  name,
  target,
  plan: sourcePlan,
  onClose,
  onSaved,
}: {
  name: string;
  target: number;
  plan?: SavingPlan;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { edit, message } = useFinance();
  const [goalName, setGoalName] = useState(name || "Meu próximo objetivo");
  const [input, setInput] = useState<SavingPlan>(
    sourcePlan ?? { ...initialCase().plan },
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Converter cenário em meta" onClose={onClose}>
      <p className="info-box">
        Você vai criar uma meta real de {money(target)} com reserva inicial
        zero. Saldos e rendimentos simulados não serão transferidos; registre
        apenas o dinheiro que efetivamente guardar.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (!goalName.trim() || !Number.isFinite(target) || target <= 0)
              throw Error("Confira nome e valor da meta.");
            const plan = resolvePlan(input, target, 0);
            validatePlan(plan);
            await edit([
              {
                id: uid(),
                kind: "goal",
                data: {
                  name: goalName.trim(),
                  target,
                  saved: 0,
                  deadline: plan.mode === "monthly" ? "" : plan.deadline,
                  priority: "2",
                  plan,
                },
              },
            ]);
            message(
              "Meta criada. Nenhuma movimentação ou reserva real foi criada.",
            );
            onSaved?.();
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="saving-label">
          Nome da nova meta
          <input
            value={goalName}
            maxLength={160}
            required
            onChange={(e) => setGoalName(e.target.value)}
          />
        </label>
        <PlanControls value={input} onChange={setInput} />
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="btn" type="button" onClick={onClose}>
            Voltar
          </button>
          <button className="btn primary" disabled={busy}>
            Criar meta real
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function SavingSimulator() {
  const { doc, edit, message } = useFinance();
  const [value, setValue] = useState<Case>(initialCase);
  const [compared, setCompared] = useState<Case[]>([]),
    [convert, setConvert] = useState<Case | null>(null),
    [deleting, setDeleting] = useState<Entity | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  let result: ReturnType<typeof calculate> | null = null,
    calculationError = "";
  try {
    result = calculate(value);
  } catch (err) {
    calculationError = (err as Error).message;
  }
  const saved = rows(doc!, "simulation").filter(
    (e) => e.data.tab === "savings",
  );
  const patch = (p: Partial<Case>) => setValue((v) => ({ ...v, ...p }));
  const addComparison = (v: Case) => {
    if (compared.length >= 3) {
      setError(
        "Compare até três cenários por vez. Remova um para incluir outro.",
      );
      return;
    }
    try {
      calculate(v);
      setCompared((xs) => [...xs, structuredClone(v)]);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="saving-simulator">
      <div className="simulation-layout">
        <section className="panel">
          <span className="eyebrow">ESCOLHA O RITMO. ENXERGUE O CAMINHO.</span>
          <h3>Aportes e metas</h3>
          <p className="muted">
            Planeje o que deseja guardar. Comece sem rendimento e teste suas
            possibilidades.
          </p>
          <div className="form-grid saving-fields">
            <label>
              Nome do cenário
              <input
                value={value.name}
                maxLength={160}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label>
              Valor desejado (R$)
              <input
                type="number"
                min="0.01"
                max="1000000000"
                step="0.01"
                value={value.target}
                onChange={(e) => patch({ target: Number(e.target.value) })}
              />
            </label>
            <label>
              Saldo inicial simulado (R$)
              <input
                type="number"
                min="0"
                max="1000000000"
                step="0.01"
                value={value.initial}
                onChange={(e) => patch({ initial: Number(e.target.value) })}
              />
            </label>
            <label>
              Horizonte da projeção (meses)
              <input
                type="number"
                min="1"
                max="600"
                step="1"
                value={value.horizon}
                onChange={(e) => patch({ horizon: Number(e.target.value) })}
              />
            </label>
            <label className="span-2">
              Taxa mensal opcional · hipótese (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={value.rate}
                onChange={(e) => patch({ rate: Number(e.target.value) })}
              />
              <small>
                Padrão: 0%, sem rendimento. A taxa é uma hipótese, sem garantia,
                impostos ou tarifas. O aporte necessário é calculado sem
                rendimento.
              </small>
            </label>
          </div>
          <PlanControls
            value={value.plan}
            onChange={(plan) => patch({ plan })}
          />
        </section>
        <section className="panel simulation-result">
          <div className="panel-title">
            <div>
              <span className="eyebrow">UMA ESTIMATIVA, COM CLAREZA</span>
              <h3>Seu dinheiro ao longo do tempo</h3>
            </div>
            <span className="pill">
              {value.rate === 0
                ? "Sem rendimento"
                : `${value.rate}% a.m. · hipótese`}
            </span>
          </div>
          {calculationError && (
            <p className="error-box" role="alert">
              {calculationError}
            </p>
          )}
          {result && (
            <>
              <div className="stats-grid two">
                <Stat
                  label="Saldo projetado no horizonte"
                  value={result.projection.balance}
                  tone="blue"
                />
                <Stat
                  label="Aportes acumulados no horizonte"
                  value={result.projection.totalContributed}
                />
              </div>
              <div className="result-list">
                <div>
                  <span>Conclusão estimada com os aportes mantidos</span>
                  <strong>
                    {result.full.completion
                      ? dateLabel(result.full.completion)
                      : "Sem previsão em até 600 meses"}
                  </strong>
                </div>
                <div>
                  <span>Prazo estimado</span>
                  <strong>
                    {result.full.monthsToTarget !== null
                      ? `${result.full.monthsToTarget} mês(es) até a conclusão`
                      : "Aportes insuficientes"}
                  </strong>
                </div>
                <div>
                  <span>
                    Aporte mensal{" "}
                    {value.plan.mode === "monthly"
                      ? "definido"
                      : "necessário, sem rendimento"}
                  </span>
                  <strong>{money(result.plan.monthly)}</strong>
                </div>
                {value.plan.mode !== "monthly" && (
                  <div>
                    <span>Atende à data desejada?</span>
                    <strong>
                      {result.full.completion &&
                      result.full.completion <= result.plan.deadline
                        ? "Sim, nesta hipótese"
                        : "Não. Ajuste os aportes ou o prazo."}
                    </strong>
                  </div>
                )}
              </div>
              <ProjectionChart data={result.projection.data} />
              <div className="button-row">
                <button
                  className="btn"
                  disabled={compared.length >= 3}
                  onClick={() => addComparison(value)}
                >
                  <Plus size={16} />
                  Adicionar à comparação
                </button>
                <button
                  className="btn primary"
                  disabled={busy || !value.name.trim()}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await edit([
                        {
                          id: uid(),
                          kind: "simulation",
                          data: {
                            name: value.name.trim(),
                            tab: "savings",
                            values: value,
                          },
                        },
                      ]);
                      message("Cenário salvo. Seu saldo não foi alterado.");
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Save size={16} />
                  Salvar cenário
                </button>
                <button className="btn" onClick={() => setConvert(value)}>
                  <Target size={16} />
                  Converter em meta
                </button>
              </div>
              <details className="projection-table">
                <summary>Ver projeção mensal em tabela</summary>
                <div className="saving-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Mês</th>
                        <th>Saldo inicial</th>
                        <th>Aportes acumulados</th>
                        <th>Rendimentos hipotéticos</th>
                        <th>Saldo projetado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.projection.data.map((r) => (
                        <tr key={r.month}>
                          <td>{r.month.split("-").reverse().join("/")}</td>
                          <td>{money(r.initial)}</td>
                          <td>{money(r.contributions)}</td>
                          <td>{money(r.interest)}</td>
                          <td>{money(r.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
          <p className="footnote">
            {dateConvention} Na hipótese de rendimento, a taxa incide no saldo
            de abertura de cada mês completo; os novos aportes rendem a partir
            do mês seguinte. Meses parciais não recebem juros.
          </p>
        </section>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>Compare até três caminhos</h3>
            <p>
              O prazo considera aportes mantidos. O saldo e o total aportado
              usam o horizonte de cada cenário.
            </p>
          </div>
          <span className="pill">{compared.length}/3</span>
        </div>
        {!compared.length ? (
          <p className="muted calm">
            Monte seu plano acima e adicione à comparação. Experimente R$ 500,
            R$ 800 ou um extra em dezembro.
          </p>
        ) : (
          <div className="saving-comparison-grid">
            {compared.map((v, i) => {
              const r = calculate(v);
              return (
                <article className="comparison-case" key={i}>
                  <div className="split">
                    <h4>{v.name}</h4>
                    <button
                      className="icon-btn"
                      aria-label={`Remover cenário ${i + 1} da comparação`}
                      onClick={() =>
                        setCompared((xs) => xs.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <p className="muted">
                    {money(r.plan.monthly)}/mês · {v.plan.extras.length}{" "}
                    extra(s)
                  </p>
                  <dl>
                    <div>
                      <dt>Prazo estimado</dt>
                      <dd>
                        {r.full.completion
                          ? dateLabel(r.full.completion)
                          : "Sem previsão"}
                      </dd>
                    </div>
                    <div>
                      <dt>Horizonte</dt>
                      <dd>
                        {r.projection.data.length} meses · até{" "}
                        {r.projection.data
                          .at(-1)
                          ?.month.split("-")
                          .reverse()
                          .join("/")}
                      </dd>
                    </div>
                    <div>
                      <dt>Total aportado no horizonte</dt>
                      <dd>{money(r.projection.totalContributed)}</dd>
                    </div>
                    <div>
                      <dt>Saldo projetado</dt>
                      <dd>{money(r.projection.balance)}</dd>
                    </div>
                  </dl>
                  <button
                    className="text-btn"
                    onClick={() => setValue(structuredClone(v))}
                  >
                    Editar este cenário
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h3>Cenários de aportes salvos</h3>
            <p>Retome, compare ou converta quando decidir.</p>
          </div>
        </div>
        {saved.length ? (
          saved.map((e) => (
            <div className="saved-scenario" key={e.id}>
              <div>
                <strong>{e.data.name}</strong>
                <small>Aportes e metas</small>
              </div>
              <div className="button-row">
                <button
                  className="btn"
                  onClick={() => setValue(structuredClone(e.data.values))}
                >
                  <FolderOpen size={15} />
                  Abrir
                </button>
                <button
                  className="btn"
                  disabled={compared.length >= 3}
                  onClick={() => addComparison(e.data.values)}
                >
                  Comparar
                </button>
                <button
                  className="btn"
                  onClick={() => setConvert(e.data.values)}
                >
                  Converter em meta
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Excluir cenário ${e.data.name}`}
                  onClick={() => setDeleting(e)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="muted calm">
            Seus cenários de aportes aparecerão aqui.
          </p>
        )}
      </section>
      {convert && (
        <GoalConversion
          name={convert.name}
          target={convert.target}
          plan={convert.plan}
          onClose={() => setConvert(null)}
        />
      )}
      {deleting && (
        <Modal
          title="Excluir cenário de aportes?"
          onClose={() => setDeleting(null)}
        >
          <p>A exclusão remove apenas a simulação salva.</p>
          <button
            className="btn danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await edit([{ ...deleting, deleted: true }]);
                setDeleting(null);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
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
