import { useId, useState, type ReactNode } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  ArrowRight,
  MapPin,
  Calculator,
  Info,
} from "lucide-react";
import { Modal } from "../components/ui";
import { money, dateLabel, uid, type Entity } from "../core/model";
import { useFinance } from "../core/store";
import { horizonCategory } from "../core/horizons";
import { reservedValue } from "../core/contributions";
import { goalMovementRevision } from "../core/merge";
import {
  savingSummary,
  targetValue,
  tripScenarios,
} from "../core/saving-targets";
import { tripCost } from "../core/finance";
import {
  categoryBrief,
  estimateHorizon,
  newHorizonPlanner,
  plannerFor,
  reviseHorizonBudget,
  validateHorizonPlanner,
  type HorizonPlanner,
  type BudgetEstimate,
} from "../core/horizon-planning";

export function BudgetNumber({
  label,
  value,
  onChange,
  hint,
  integer = false,
  min = 0,
  max = 1e9,
  required = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  integer?: boolean;
  min?: number;
  max?: number;
  required?: boolean;
}) {
  const hintId = useId();
  return (
    <label className="budget-field">
      {label}
      <input
        aria-label={label}
        aria-describedby={hint ? hintId : undefined}
        type="number"
        min={min}
        max={max}
        step={integer ? "1" : "0.01"}
        value={value === 0 && !integer ? "" : value}
        placeholder="0"
        required={required}
        onChange={(e) =>
          onChange(e.target.value === "" ? 0 : e.target.valueAsNumber)
        }
      />
      {hint && <small id={hintId}>{hint}</small>}
    </label>
  );
}
function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="budget-group">
      <legend>{title}</legend>
      {hint && <p className="muted">{hint}</p>}
      <div className="budget-fields">{children}</div>
    </fieldset>
  );
}
export function HorizonBudgetFields({
  value: p,
  onChange,
  category,
  initialSaved,
  onInitialSaved,
}: {
  value: HorizonPlanner;
  onChange: (v: HorizonPlanner) => void;
  category: string;
  initialSaved?: number;
  onInitialSaved?: (n: number) => void;
}) {
  const patch = (v: Record<string, unknown>) =>
    onChange({ ...p, ...v } as HorizonPlanner);
  return (
    <div className="horizon-budget-fields">
      {p.type === "travel" && (
        <>
          <Group title="Seu destino">
            <label>
              Cidade
              <input
                value={p.city}
                maxLength={100}
                required
                onChange={(e) => patch({ city: e.target.value })}
                autoComplete="off"
              />
            </label>
            <label>
              Estado ou região (opcional)
              <input
                value={p.state}
                maxLength={100}
                onChange={(e) => patch({ state: e.target.value })}
              />
            </label>
            <label>
              País
              <input
                value={p.country}
                maxLength={100}
                required
                onChange={(e) => patch({ country: e.target.value })}
              />
            </label>
            <label>
              Data prevista da viagem (opcional)
              <input
                type="date"
                value={p.date}
                onChange={(e) => patch({ date: e.target.value })}
              />
              <small>Também será o prazo desejado do horizonte.</small>
            </label>
            <BudgetNumber
              label="Duração em dias"
              value={p.days}
              integer
              min={1}
              max={730}
              required
              onChange={(days) =>
                patch({
                  days,
                  nights:
                    p.nights === Math.max(0, p.days - 1)
                      ? Math.max(0, days - 1)
                      : p.nights,
                })
              }
            />
            <BudgetNumber
              label="Número de viajantes"
              value={p.people}
              integer
              min={1}
              max={100}
              required
              onChange={(people) => patch({ people })}
            />
          </Group>
          <Group
            title="Como você vai chegar"
            hint="Informe ida e volta. Escolha se o valor é por pessoa ou pelo grupo inteiro."
          >
            <label>
              Transporte
              <select
                value={p.transport}
                onChange={(e) =>
                  patch({
                    transport: e.target.value,
                    transportUnit:
                      e.target.value === "car" ? "group" : "person",
                  })
                }
              >
                <option value="plane">Avião</option>
                <option value="car">Carro</option>
                <option value="bus">Ônibus</option>
                <option value="other">Outro</option>
              </select>
            </label>
            <label>
              Como considerar esse custo
              <select
                value={p.transportUnit}
                onChange={(e) => patch({ transportUnit: e.target.value })}
              >
                <option value="person">Por pessoa</option>
                <option value="group">Total do grupo</option>
              </select>
            </label>
            <BudgetNumber
              label={
                p.transport === "car"
                  ? "Combustível e pedágios (R$)"
                  : "Passagens ou transporte de ida e volta (R$)"
              }
              value={p.transportCost}
              onChange={(transportCost) => patch({ transportCost })}
              hint={
                p.transportUnit === "person"
                  ? "Multiplicado pelo número de viajantes."
                  : "Contado uma vez, sem multiplicar pelos viajantes."
              }
            />
          </Group>
          <Group title="Estadia e dia a dia">
            <BudgetNumber
              label="Número de noites"
              value={p.nights}
              integer
              max={730}
              onChange={(nights) => patch({ nights })}
              hint="Sugestão: dias menos um. Você pode ajustar."
            />
            <BudgetNumber
              label="Hospedagem por noite · grupo (R$)"
              value={p.nightly}
              onChange={(nightly) => patch({ nightly })}
              hint="Total de quartos necessários para todos os viajantes."
            />
            <BudgetNumber
              label="Alimentação por dia · pessoa (R$)"
              value={p.foodDaily}
              onChange={(foodDaily) => patch({ foodDaily })}
              hint="Multiplicado pelos dias e pelo número de viajantes."
            />
            <BudgetNumber
              label="Passeios e atrações · total do grupo (R$)"
              value={p.tours}
              onChange={(tours) => patch({ tours })}
            />
            <BudgetNumber
              label="Transporte local · total do grupo (R$)"
              value={p.local}
              onChange={(local) => patch({ local })}
              hint="Não repita o combustível ou as passagens já incluídos acima."
            />
            <BudgetNumber
              label="Despesas adicionais · total do grupo (R$)"
              value={p.additional}
              onChange={(additional) => patch({ additional })}
            />
          </Group>
          <Group title="Uma margem para imprevistos">
            <label>
              Tipo de reserva
              <select
                value={p.contingencyMode}
                onChange={(e) =>
                  patch({ contingencyMode: e.target.value, contingency: 0 })
                }
              >
                <option value="percent">Porcentagem dos custos</option>
                <option value="amount">Valor fixo</option>
              </select>
            </label>
            <BudgetNumber
              label={
                p.contingencyMode === "percent"
                  ? "Reserva para imprevistos (%)"
                  : "Reserva para imprevistos (R$)"
              }
              value={p.contingency}
              max={p.contingencyMode === "percent" ? 100 : 1e9}
              onChange={(contingency) => patch({ contingency })}
              hint="Aplicada uma única vez ao orçamento."
            />
          </Group>
        </>
      )}
      {p.type === "car" && (
        <Group title="O carro e os primeiros passos">
          <label className="budget-wide">
            Modelo do carro
            <input
              value={p.model}
              maxLength={160}
              placeholder="Modelo, versão e ano, se souber"
              required
              onChange={(e) => patch({ model: e.target.value })}
            />
          </label>
          <BudgetNumber
            label="Valor estimado do veículo (R$)"
            value={p.vehicle}
            required
            onChange={(vehicle) => patch({ vehicle })}
          />
          <BudgetNumber
            label="Despesas iniciais opcionais (R$)"
            value={p.initialCosts}
            onChange={(initialCosts) => patch({ initialCosts })}
            hint="Por exemplo, documentação ou preparação, sem repetir o valor do carro."
          />
          <BudgetNumber
            label="Reserva adicional opcional (R$)"
            value={p.buffer}
            onChange={(buffer) => patch({ buffer })}
          />
        </Group>
      )}
      {p.type === "savings" && (
        <Group title="Como você quer juntar?">
          <label className="budget-wide">
            Finalidade da reserva
            <input
              value={p.purpose}
              maxLength={200}
              required
              onChange={(e) => patch({ purpose: e.target.value })}
              placeholder="O que esse dinheiro vai tornar possível?"
            />
          </label>
          <label className="budget-wide">
            Como calcular o valor
            <select
              value={p.method}
              onChange={(e) => patch({ method: e.target.value })}
            >
              <option value="period">A partir do aporte e do período</option>
              <option value="target">Definir um valor final desejado</option>
            </select>
          </label>
          {p.method === "period" ? (
            <>
              <BudgetNumber
                label="Quanto guardar mensalmente (R$)"
                value={p.monthly}
                onChange={(monthly) => patch({ monthly })}
                required
              />
              <BudgetNumber
                label="Durante quantos meses"
                value={p.months}
                integer
                min={1}
                max={600}
                onChange={(months) => patch({ months })}
                required
              />
              {!onInitialSaved && (
                <div className="budget-wide info-box">
                  Base da estimativa: {money(p.base)}. Esse saldo inicial é uma
                  referência do orçamento original; aportes posteriores não
                  aumentam a meta automaticamente.
                </div>
              )}
            </>
          ) : (
            <BudgetNumber
              label="Valor final desejado (R$)"
              value={p.desired}
              onChange={(desired) => patch({ desired })}
              required
            />
          )}
        </Group>
      )}
      {p.type === "reserve" && (
        <Group title="Sua tranquilidade em meses">
          <BudgetNumber
            label="Despesas essenciais mensais (R$)"
            value={p.essentialMonthly}
            onChange={(essentialMonthly) => patch({ essentialMonthly })}
            required
            hint="Considere moradia, alimentação, saúde e compromissos essenciais."
          />
          <BudgetNumber
            label="Meses de cobertura desejados"
            value={p.coverage}
            integer
            min={1}
            max={60}
            onChange={(coverage) => patch({ coverage })}
            required
          />
          <BudgetNumber
            label="Reserva adicional opcional (R$)"
            value={p.buffer}
            onChange={(buffer) => patch({ buffer })}
          />
        </Group>
      )}
      {p.type === "items" && (
        <fieldset className="budget-group">
          <legend>
            {category === "home"
              ? "O orçamento do seu novo lar"
              : category === "study"
                ? "Seu plano de estudos"
                : "O que compõe seu objetivo"}
          </legend>
          <p className="muted">
            Cada item representa um custo total. Não repita despesas em mais de
            uma linha.
          </p>
          <div className="budget-items">
            {p.items.map((item, i) => (
              <div className="budget-item" key={item.id}>
                <label>
                  Item {i + 1}
                  <input
                    aria-label={`Nome do item ${i + 1}`}
                    maxLength={160}
                    value={item.name}
                    required
                    onChange={(e) =>
                      patch({
                        items: p.items.map((x) =>
                          x.id === item.id ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <BudgetNumber
                  label={`Valor do item ${i + 1} (R$)`}
                  value={item.amount}
                  onChange={(amount) =>
                    patch({
                      items: p.items.map((x) =>
                        x.id === item.id ? { ...x, amount } : x,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remover item ${i + 1}`}
                  disabled={p.items.length <= 1}
                  onClick={() =>
                    patch({ items: p.items.filter((x) => x.id !== item.id) })
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="btn"
            type="button"
            disabled={p.items.length >= 40}
            onClick={() =>
              patch({ items: [...p.items, { id: uid(), name: "", amount: 0 }] })
            }
          >
            <Plus size={16} />
            Adicionar item
          </button>
        </fieldset>
      )}
      {onInitialSaved && (
        <Group title="Seu ponto de partida">
          <BudgetNumber
            label="Quanto já possui guardado (R$)"
            value={initialSaved ?? 0}
            onChange={onInitialSaved}
            hint="Dinheiro já existente, reservado no app. Não cria receita nem aumenta seu patrimônio."
          />
        </Group>
      )}
    </div>
  );
}
export function BudgetBreakdown({
  estimate,
  compact = false,
}: {
  estimate: BudgetEstimate;
  compact?: boolean;
}) {
  const visible = estimate.lines.filter((l) => l.amount > 0);
  return (
    <div
      className={`horizon-budget-result ${compact ? "compact" : ""}`}
      aria-live="polite"
    >
      <div className="budget-total">
        <span>Seu horizonte está estimado em</span>
        <strong>{money(estimate.total)}</strong>
        <small>
          Estimativa pessoal em reais. Sem cotações ou rendimentos presumidos.
        </small>
      </div>
      {!!visible.length && (
        <div className="budget-breakdown">
          {visible.map((l, i) => (
            <div className="budget-breakdown-row" key={i}>
              <div>
                <span>{l.label}</span>
                <strong>{money(l.amount)}</strong>
              </div>
              {!compact && l.detail && <small>{l.detail}</small>}
              <div className="budget-bar">
                <span
                  style={{
                    width: `${estimate.total ? (l.amount / estimate.total) * 100 : 0}%`,
                    opacity: 1 - (i % 4) * 0.16,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function HorizonPlanningSection({
  goal,
  onLegacyEdit,
}: {
  goal: Entity;
  onLegacyEdit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const planner = plannerFor(goal),
    category = horizonCategory(goal).id;
  let estimate: BudgetEstimate | undefined,
    error = "";
  try {
    if (planner) estimate = estimateHorizon(planner);
  } catch (e) {
    error = (e as Error).message;
  }
  if (goal.kind === "trip") {
    const d = goal.data,
      { days, nights } = tripCost(d),
      factor = tripScenarios.find((s) => s.value === d.scenario)?.factor ?? 1,
      exchange = Number(d.exchange);
    const baseLines = [
      { label: "Passagens", amount: Number(d.flights) * Number(d.people) },
      { label: "Hospedagem", amount: Number(d.hotel) * nights },
      {
        label: "Alimentação",
        amount: Number(d.food) * days * Number(d.people),
      },
      { label: "Transporte local", amount: Number(d.transport) * days },
      {
        label: "Passeios e seguro",
        amount: (Number(d.tours) + Number(d.insurance)) * Number(d.people),
      },
      {
        label: "Compras e outros",
        amount: Number(d.shopping) + Number(d.other),
      },
    ].map((l) => ({ ...l, amount: l.amount * exchange * factor }));
    const subtotal = baseLines.reduce((s, l) => s + l.amount, 0);
    return (
      <section className="panel horizon-my-planning">
        <div className="split">
          <div>
            <span className="eyebrow">ORÇAMENTO DA VIAGEM</span>
            <h3>Meu Planejamento</h3>
            <p>
              Seu orçamento anterior foi preservado, incluindo moeda, câmbio e
              cenário. Você pode revisar os custos dentro deste horizonte.
            </p>
          </div>
          <button className="btn" onClick={onLegacyEdit}>
            <Pencil size={17} />
            Editar planejamento
          </button>
        </div>
        <details className="budget-saved-details">
          <summary>Consultar composição · {money(targetValue(goal))}</summary>
          <BudgetBreakdown
            compact
            estimate={{
              total: targetValue(goal),
              lines: [
                ...baseLines,
                {
                  label: "Imprevistos",
                  amount: (subtotal * Number(d.margin)) / 100,
                },
              ],
            }}
          />
        </details>
      </section>
    );
  }
  return (
    <section className="panel horizon-my-planning">
      <div className="split">
        <div>
          <span className="eyebrow">O ORÇAMENTO POR TRÁS DO OBJETIVO</span>
          <h3>Meu Planejamento</h3>
          <p>
            {planner
              ? categoryBrief[category]?.hint
              : "Você escolheu Definir valor. Se quiser, construa um orçamento para este mesmo horizonte."}
          </p>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>
          {planner ? <Pencil size={17} /> : <Calculator size={17} />}
          {planner ? "Editar planejamento" : "Planejar meu horizonte"}
        </button>
      </div>
      {planner?.type === "travel" && (
        <p className="budget-destination">
          <MapPin size={16} />
          {[planner.city, planner.state, planner.country]
            .filter(Boolean)
            .join(", ")}
          {planner.date ? ` · ${dateLabel(planner.date)}` : ""} · {planner.days}{" "}
          dia(s) · {planner.people} viajante(s)
        </p>
      )}
      {planner?.type === "car" && (
        <p className="budget-destination">{planner.model}</p>
      )}
      {planner?.type === "savings" && <p>{planner.purpose}</p>}
      {estimate && (
        <details className="budget-saved-details">
          <summary>Consultar composição · {money(estimate.total)}</summary>
          <BudgetBreakdown estimate={estimate} compact />
        </details>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {open && (
        <HorizonBudgetEditor goal={goal} onClose={() => setOpen(false)} />
      )}
    </section>
  );
}
export function HorizonBudgetEditor({
  goal: original,
  onClose,
}: {
  goal: Entity;
  onClose: () => void;
}) {
  const { doc, edit, message } = useFinance();
  const [baseline] = useState(original);
  const [input, setInput] = useState(() =>
    structuredClone(
      plannerFor(original) ??
        newHorizonPlanner(
          horizonCategory(original).id,
          reservedValue(doc!, original),
        ),
    ),
  );
  const [review, setReview] = useState(false),
    [adapt, setAdapt] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [movementRevision, setMovementRevision] = useState("");
  const goal = doc!.entities.find((e) => e.id === original.id && !e.deleted),
    category = horizonCategory(original).id;
  let estimate: BudgetEstimate | undefined,
    calculationError = "",
    nextData: Entity["data"] | undefined;
  try {
    estimate = estimateHorizon(input);
    if (review && goal)
      nextData = reviseHorizonBudget(doc!, goal, input, adapt);
  } catch (e) {
    calculationError = (e as Error).message;
  }
  const next =
    goal && nextData
      ? savingSummary(doc!, { ...goal, data: nextData })
      : undefined;
  return (
    <Modal
      title={review ? "Confirmar novo planejamento" : "Meu Planejamento"}
      onClose={onClose}
    >
      <div className="budget-editor">
        {!review ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              try {
                validateHorizonPlanner(input);
                if (!goal)
                  throw Error("Este horizonte não está mais disponível.");
                setMovementRevision(goalMovementRevision(doc!, goal.id));
                setReview(true);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <p className="muted">{categoryBrief[category]?.hint}</p>
            <HorizonBudgetFields
              category={category}
              value={input}
              onChange={setInput}
            />
            <p className="info-box">
              Já acumulado: {money(goal ? reservedValue(doc!, goal) : 0)}.
              Editar este orçamento preserva todos os aportes e retiradas; não
              registra dinheiro novo.
            </p>
            {estimate && <BudgetBreakdown estimate={estimate} />}
            {(error || calculationError) && (
              <p className="error-box" role="alert">
                {error || calculationError}
              </p>
            )}
            <div className="form-actions">
              <button type="button" className="btn" onClick={onClose}>
                Cancelar
              </button>
              <button className="btn primary" disabled={!!calculationError}>
                Revisar alteração
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="budget-change-summary">
              <div>
                <span>Meta atual</span>
                <strong>{money(original.data.target)}</strong>
              </div>
              <ArrowRight size={22} />
              <div>
                <span>Nova meta estimada</span>
                <strong>{money(estimate?.total ?? 0)}</strong>
              </div>
            </div>
            {original.data.plan && (
              <fieldset className="budget-group">
                <legend>Como ajustar os aportes?</legend>
                <label className="budget-radio">
                  <input
                    type="radio"
                    name="budget-adapt"
                    checked={adapt}
                    onChange={() => setAdapt(true)}
                  />
                  <span>
                    <strong>Recalcular mantendo minha estratégia</strong>
                    <small>
                      Aporte fixo ajusta a previsão; prazo fixo ajusta o valor
                      mensal necessário.
                    </small>
                  </span>
                </label>
                <label className="budget-radio">
                  <input
                    type="radio"
                    name="budget-adapt"
                    checked={!adapt}
                    onChange={() => setAdapt(false)}
                  />
                  <span>
                    <strong>Manter os aportes atuais</strong>
                    <small>
                      A nova meta será considerada nas projeções, sem reescrever
                      o plano configurado.
                    </small>
                  </span>
                </label>
              </fieldset>
            )}
            {next && (
              <div className="budget-review-facts">
                <div>
                  <span>Acumulado preservado</span>
                  <strong>{money(next.saved)}</strong>
                </div>
                <div>
                  <span>Restante atualizado</span>
                  <strong>{money(next.remaining)}</strong>
                </div>
                <div>
                  <span>Aporte mensal planejado</span>
                  <strong>{money(next.monthlyPlanned)}</strong>
                </div>
                <div>
                  <span>Conclusão estimada</span>
                  <strong>
                    {next.completion
                      ? dateLabel(next.completion)
                      : "Sem previsão"}
                  </strong>
                </div>
              </div>
            )}
            <p className="info-box">
              <Info size={18} />A nova meta só será aplicada ao confirmar. O
              histórico financeiro e a foto serão preservados. Nenhuma
              movimentação real será criada.
            </p>
            {(error || calculationError) && (
              <p className="error-box" role="alert">
                {error || calculationError}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  setReview(false);
                  setError("");
                }}
              >
                Voltar ao planejamento
              </button>
              <button
                className="btn primary"
                disabled={busy || !!calculationError || !goal}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    if (!goal)
                      throw Error("Este horizonte não está mais disponível.");
                    const data = reviseHorizonBudget(doc!, goal, input, adapt);
                    await edit([
                      {
                        id: goal.id,
                        kind: goal.kind,
                        data,
                        expectedVector: baseline.vector,
                        expectedMovements: movementRevision,
                      },
                    ]);
                    message(
                      "Planejamento atualizado. Seu histórico foi preservado.",
                    );
                    onClose();
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Salvando…" : "Confirmar atualização"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
