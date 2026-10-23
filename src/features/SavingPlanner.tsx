import { useState } from "react";
import { Plus, Trash2, CalendarDays, ArrowRight } from "lucide-react";
import { Modal } from "../components/ui";
import { useFinance } from "../core/store";
import {
  addMonths,
  dateLabel,
  money,
  today,
  uid,
  type Entity,
} from "../core/model";
import {
  defaultPlan,
  occurrences,
  planStreams,
  reservedValue,
  revisedPlan,
  validatePlan,
  fundedOccurrences,
  manualPlannedStreams,
  type SavingPlan,
  type SavingStream,
} from "../core/contributions";
import { targetValue } from "../core/saving-targets";
import { resolvePlan } from "../core/plan-resolution";
export { resolvePlan } from "../core/plan-resolution";

export const dateConvention =
  "O primeiro aporte define o dia mensal (dias 29–31 usam o último dia quando necessário). Semanal: a cada 7 dias × intervalo. Início e fim são inclusivos; só entram ocorrências dentro do período. Previsões são estimativas, sem rendimento nas metas reais.";
export function ExtraStreams({
  value,
  onChange,
}: {
  value: SavingStream[];
  onChange: (v: SavingStream[]) => void;
}) {
  const update = (i: number, patch: Partial<SavingStream>) =>
    onChange(value.map((v, j) => (i === j ? { ...v, ...patch } : v)));
  return (
    <div className="extra-streams">
      <div className="split">
        <div>
          <h4>Aportes complementares</h4>
          <p className="muted">Combine outros valores com seu aporte mensal.</p>
        </div>
        <button
          className="btn"
          type="button"
          disabled={value.length >= 30}
          onClick={() =>
            onChange([
              ...value,
              {
                id: uid(),
                description: "Aporte extra",
                frequency: "once",
                amount: 0,
                date: today(),
                interval: 1,
              },
            ])
          }
        >
          <Plus size={16} />
          Adicionar aporte planejado
        </button>
      </div>
      {value.map((s, i) => (
        <fieldset className="stream-row" key={s.id}>
          <legend>Aporte planejado {i + 1}</legend>
          {s.frequency !== "once" && (
            <label>
              Reajuste anual do aporte (%)
              <input
                aria-label={`Reajuste anual do aporte ${i + 1}`}
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={s.annualGrowth ?? 0}
                onChange={(e) =>
                  update(i, { annualGrowth: Number(e.target.value) })
                }
              />
              <small>
                Hipótese de aumento após cada aniversário do primeiro aporte.
                Zero mantém o valor.
              </small>
            </label>
          )}
          <label>
            Descrição
            <input
              aria-label={`Descrição do aporte ${i + 1}`}
              value={s.description}
              maxLength={120}
              onChange={(e) => update(i, { description: e.target.value })}
            />
          </label>
          <label>
            Valor (R$)
            <input
              aria-label={`Valor do aporte ${i + 1}`}
              type="number"
              min="0.01"
              max="1000000000"
              step="0.01"
              value={s.amount || ""}
              required
              onChange={(e) => update(i, { amount: Number(e.target.value) })}
            />
          </label>
          <label>
            Frequência
            <select
              aria-label={`Frequência do aporte ${i + 1}`}
              value={s.frequency}
              onChange={(e) =>
                update(i, {
                  frequency: e.target.value as SavingStream["frequency"],
                })
              }
            >
              <option value="once">Avulso</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
            </select>
          </label>
          <label>
            Primeira data
            <input
              aria-label={`Data do aporte ${i + 1}`}
              type="date"
              value={s.date}
              required
              onChange={(e) => update(i, { date: e.target.value })}
            />
          </label>
          {s.frequency !== "once" && (
            <>
              <label>
                Intervalo ({s.frequency === "weekly" ? "semanas" : "meses"})
                <input
                  aria-label={`Intervalo do aporte ${i + 1}`}
                  type="number"
                  min="1"
                  max="600"
                  step="1"
                  required
                  value={s.interval}
                  onChange={(e) =>
                    update(i, { interval: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Repetir até (opcional)
                <input
                  aria-label={`Fim do aporte ${i + 1}`}
                  type="date"
                  value={s.end ?? ""}
                  onChange={(e) => update(i, { end: e.target.value })}
                />
              </label>
            </>
          )}
          <button
            className="icon-btn"
            type="button"
            aria-label={`Remover aporte planejado ${i + 1}`}
            onClick={() => onChange(value.filter((_, j) => i !== j))}
          >
            <Trash2 size={17} />
          </button>
        </fieldset>
      ))}
    </div>
  );
}
export function PlanControls({
  value: p,
  onChange,
}: {
  value: SavingPlan;
  onChange: (v: SavingPlan) => void;
}) {
  const update = (v: Partial<SavingPlan>) => onChange({ ...p, ...v });
  return (
    <>
      <div
        className="plan-modes"
        role="group"
        aria-label="Modo de planejamento"
      >
        {[
          ["monthly", "Definir aporte mensal"],
          ["months", "Definir prazo"],
          ["date", "Até uma data"],
        ].map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className={p.mode === mode ? "active" : ""}
            aria-pressed={p.mode === mode}
            onClick={() => update({ mode: mode as SavingPlan["mode"] })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="form-grid saving-fields">
        <label>
          Primeiro aporte mensal
          <input
            type="date"
            value={p.firstDate}
            required
            onChange={(e) => update({ firstDate: e.target.value })}
          />
        </label>
        {p.mode === "monthly" ? (
          <label>
            Quanto guardar por mês (R$)
            <input
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              required
              value={p.monthly}
              onChange={(e) => update({ monthly: Number(e.target.value) })}
            />
          </label>
        ) : p.mode === "months" ? (
          <label>
            Quantidade de meses
            <input
              type="number"
              min="1"
              max="600"
              step="1"
              required
              value={p.months}
              onChange={(e) => update({ months: Number(e.target.value) })}
            />
          </label>
        ) : (
          <label>
            Data desejada
            <input
              type="date"
              required
              value={p.deadline}
              onChange={(e) => update({ deadline: e.target.value })}
            />
          </label>
        )}
      </div>
      <ExtraStreams
        value={p.extras}
        onChange={(extras) => update({ extras })}
      />
      {!!p.extras.length && (
        <p className="info-box">
          {p.mode === "monthly"
            ? "Com o aporte mensal definido, os complementares antecipam a conclusão estimada. Para reduzir o valor mensal mantendo uma data, escolha Definir prazo ou Até uma data."
            : "Com o prazo definido, os complementares reduzem o aporte mensal necessário. Para manter o valor mensal e antecipar a conclusão, escolha Definir aporte mensal."}
        </p>
      )}
    </>
  );
}
export function PlanEditor({
  goal: original,
  onClose,
}: {
  goal: Entity;
  onClose: () => void;
}) {
  const { doc, edit, message } = useFinance();
  const goal = doc!.entities.find((e) => e.id === original.id && !e.deleted)!;
  const [input, setInput] = useState<SavingPlan>(
    () =>
      goal.data.plan ?? { ...defaultPlan(goal), mode: "monthly", monthly: 500 },
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const saved = reservedValue(doc!, goal),
    target = targetValue(goal);
  let plan = input,
    calculationError = "";
  try {
    plan = resolvePlan(
      input,
      target,
      saved,
      today(),
      fundedOccurrences(doc!, goal.id),
      manualPlannedStreams(doc!, goal.id),
    );
    validatePlan(plan);
  } catch (e) {
    calculationError = (e as Error).message;
  }
  const count = plan.deadline
    ? occurrences(
        [...planStreams(plan), ...manualPlannedStreams(doc!, goal.id)],
        today(),
        plan.deadline,
      ).length
    : 0;
  return (
    <Modal title={`Planejar aportes · ${goal.data.name}`} onClose={onClose}>
      <p className="muted">
        Faltam <strong>{money(Math.max(0, target - saved))}</strong> para
        atingir {money(target)}. Você já reservou {money(saved)}.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            validatePlan(plan);
            if (calculationError) throw Error(calculationError);
            await edit([
              {
                ...goal,
                data: {
                  ...revisedPlan(goal, plan),
                  ...(goal.kind === "goal" &&
                  goal.data.planner?.type !== "travel" &&
                  plan.mode !== "monthly"
                    ? { deadline: plan.deadline }
                    : {}),
                },
              },
            ]);
            message("Planejamento salvo. Nenhum aporte foi confirmado.");
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <PlanControls value={input} onChange={setInput} />
        {goal.data.planner?.type === "travel" && goal.data.planner.date && (
          <p className="info-box">
            Viagem prevista para {dateLabel(goal.data.planner.date)}. Este
            editor altera apenas o ritmo dos aportes; a data da viagem é editada
            em Meu Planejamento.
            {plan.deadline && plan.deadline > goal.data.planner.date
              ? " O plano ultrapassa a data da viagem."
              : ""}
          </p>
        )}
        <div className="plan-result">
          <CalendarDays size={22} />
          <div>
            <span>
              {input.mode === "monthly"
                ? "Conclusão estimada"
                : "Aporte mensal necessário"}
            </span>
            <strong>
              {input.mode === "monthly"
                ? plan.deadline
                  ? dateLabel(plan.deadline)
                  : "Sem previsão com estes aportes"
                : money(plan.monthly)}
            </strong>
            <small>
              {plan.deadline
                ? `${count} ocorrência(s) até ${dateLabel(plan.deadline)}. `
                : "Defina aportes positivos para estimar uma data. "}
              Planejar não movimenta seu dinheiro.
            </small>
          </div>
        </div>
        {(error || calculationError) && (
          <p className="error-box" role="alert">
            {error || calculationError}
          </p>
        )}
        <p className="footnote">{dateConvention}</p>
        <div className="form-actions">
          <button className="btn" type="button" onClick={onClose}>
            Voltar
          </button>
          <button className="btn primary" disabled={busy || !!calculationError}>
            {busy ? "Salvando…" : "Salvar planejamento"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
