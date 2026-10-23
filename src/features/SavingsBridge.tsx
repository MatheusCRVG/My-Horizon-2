import { useState } from "react";
import { Target, Save } from "lucide-react";
import { useFinance } from "../core/store";
import { addMonths, dateLabel, money, today, uid } from "../core/model";
import {
  projectSavings,
  planStreams,
  type SavingPlan,
} from "../core/contributions";
import { GoalConversion } from "./SavingSimulator";
export function SavingsBridge({
  target,
  title,
  description,
  initial = 0,
  monthly = 500,
}: {
  target: number;
  title: string;
  description: string;
  initial?: number;
  monthly?: number;
}) {
  const { edit, message } = useFinance();
  const [saved, setSaved] = useState(initial),
    [contribution, setContribution] = useState(monthly),
    [convert, setConvert] = useState(false),
    [busy, setBusy] = useState(false);
  const plan: SavingPlan = {
    mode: "monthly",
    monthly: contribution,
    months: 12,
    firstDate: addMonths(today(), 1),
    effective: today(),
    deadline: "",
    extras: [],
  };
  const valid =
    [target, saved, contribution].every(Number.isFinite) &&
    target > 0 &&
    saved >= 0 &&
    contribution >= 0;
  const projection = valid
    ? projectSavings({ target, initial: saved, streams: planStreams(plan) })
    : null;
  return (
    <section className="savings-bridge">
      <div>
        <span className="eyebrow">ANTES DO PRÓXIMO PASSO</span>
        <h4>{title}</h4>
        <p className="muted">{description}</p>
      </div>
      <div className="saving-bridge-target">
        <span>Dinheiro a acumular</span>
        <strong>{money(target)}</strong>
      </div>
      <div className="form-grid saving-fields">
        <label>
          Já guardado · simulação (R$)
          <input
            type="number"
            min="0"
            max="1000000000"
            step="0.01"
            value={saved}
            onChange={(e) => setSaved(Number(e.target.value))}
          />
        </label>
        <label>
          Quanto guardar por mês · simulação (R$)
          <input
            type="number"
            min="0"
            max="1000000000"
            step="0.01"
            value={contribution}
            onChange={(e) => setContribution(Number(e.target.value))}
          />
        </label>
      </div>
      <p className="info-box">
        {projection?.completion
          ? `Conclusão estimada, sem rendimento: ${dateLabel(projection.completion)}.`
          : "Defina um aporte positivo para estimar a conclusão."}{" "}
        A acumulação é separada das despesas futuras e parcelas do
        financiamento.
      </p>
      <div className="button-row">
        <button
          className="btn"
          disabled={busy || !valid}
          onClick={async () => {
            setBusy(true);
            try {
              await edit([
                {
                  id: uid(),
                  kind: "simulation",
                  data: {
                    name: title,
                    tab: "savings",
                    values: {
                      name: title,
                      target,
                      initial: saved,
                      rate: 0,
                      horizon: 24,
                      plan,
                    },
                  },
                },
              ]);
              message("Planejamento de poupança salvo em Aportes e metas.");
            } catch (err) {
              message((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Save size={16} />
          Salvar plano de poupança
        </button>
        <button
          className="btn"
          disabled={!valid}
          onClick={() => setConvert(true)}
        >
          <Target size={16} />
          Converter em meta
        </button>
      </div>
      {convert && (
        <GoalConversion
          name={title}
          target={target}
          plan={plan}
          onClose={() => setConvert(false)}
        />
      )}
    </section>
  );
}
