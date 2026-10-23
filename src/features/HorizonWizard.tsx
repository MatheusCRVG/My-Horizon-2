import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Calculator,
  Wallet,
  Plane,
  Car,
  House,
  GraduationCap,
  ShieldCheck,
  Target,
  Sparkles,
  CalendarDays,
  Pencil,
} from "lucide-react";
import { Modal } from "../components/ui";
import { CoverPicker, HorizonCover } from "../components/HorizonCover";
import {
  defaultCover,
  horizonCategories,
  validateCover,
  type Cover,
} from "../core/horizons";
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
  validatePlan,
  type SavingPlan,
} from "../core/contributions";
import { resolvePlan } from "../core/plan-resolution";
import {
  categoryBrief,
  estimateHorizon,
  newHorizonPlanner,
  validateHorizonPlanner,
  type HorizonPlanner,
  type BudgetEstimate,
} from "../core/horizon-planning";
import { savingSummary } from "../core/saving-targets";
import { useFinance } from "../core/store";
import {
  BudgetNumber,
  BudgetBreakdown,
  HorizonBudgetFields,
} from "./HorizonBudget";
import { PlanControls, ExtraStreams, dateConvention } from "./SavingPlanner";

const steps = [
  "Categoria",
  "Sua escolha",
  "Seu orçamento",
  "Aportes",
  "Revisão",
];
const icons = {
  travel: Plane,
  car: Car,
  home: House,
  study: GraduationCap,
  reserve: ShieldCheck,
  savings: Wallet,
  personal: Sparkles,
  other: Target,
};
export function HorizonWizard({
  onClose,
  onSaved,
  initialCategory,
}: {
  onClose: () => void;
  onSaved?: (id: string) => void;
  initialCategory?: string;
}) {
  const { doc, edit, message } = useFinance();
  const [id] = useState(uid),
    [step, setStep] = useState(0),
    [category, setCategory] = useState(initialCategory ?? ""),
    [method, setMethod] = useState<"direct" | "planned" | "">("");
  const [name, setName] = useState(""),
    [notes, setNotes] = useState(""),
    [target, setTarget] = useState(0),
    [saved, setSaved] = useState(0),
    [deadline, setDeadline] = useState("");
  const [planners, setPlanners] = useState<Record<string, HorizonPlanner>>({}),
    [cover, setCover] = useState<Cover | null>(null),
    [featured, setFeatured] = useState(true),
    [priority, setPriority] = useState("2");
  const [imageBusy, setImageBusy] = useState(false),
    [strategy, setStrategy] = useState<"regular" | "custom" | "later">(
      "regular",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [input, setInput] = useState<SavingPlan>(() => ({
    ...defaultPlan({ kind: "goal", data: {} } as Entity),
    mode: "months",
  }));
  const [planSeeded, setPlanSeeded] = useState(false),
    [planTouched, setPlanTouched] = useState(false),
    [syncedDeadline, setSyncedDeadline] = useState("");
  const content = useRef<HTMLDivElement>(null);
  const planner = planners[category] ?? newHorizonPlanner(category, saved);
  const setPlanner = (p: HorizonPlanner) =>
    setPlanners((v) => ({ ...v, [category]: p }));
  const updateSaved = (n: number) => {
    setSaved(n);
    setPlanners((values) =>
      Object.fromEntries(
        Object.entries(values).map(([key, p]) => [
          key,
          p.type === "savings" ? { ...p, base: n } : p,
        ]),
      ),
    );
    if (planner.type === "savings") setPlanner({ ...planner, base: n });
  };
  let estimate: BudgetEstimate | undefined,
    calculationError = "";
  try {
    if (method === "planned") estimate = estimateHorizon(planner);
  } catch (e) {
    calculationError = (e as Error).message;
  }
  const goalTarget = method === "planned" ? (estimate?.total ?? 0) : target;
  const requestedDeadline =
    method === "planned" && planner.type === "travel" ? planner.date : deadline;
  let plan = input,
    planError = "";
  if (strategy !== "later" && goalTarget > 0) {
    try {
      plan = resolvePlan(
        strategy === "custom"
          ? { ...input, mode: "monthly", monthly: 0 }
          : input,
        goalTarget,
        saved,
      );
      validatePlan(plan);
    } catch (e) {
      planError = (e as Error).message;
    }
  }
  const goal: Entity = {
    id,
    kind: "goal",
    vector: {},
    updatedAt: "",
    data: {
      name,
      notes,
      target: goalTarget,
      saved,
      deadline:
        requestedDeadline ||
        (strategy !== "later" && plan.mode !== "monthly" ? plan.deadline : ""),
      priority: Number(priority),
      horizonCategory: category,
      featured,
      creationMethod: method,
      ...(method === "planned" ? { planner } : {}),
      ...(strategy !== "later" ? { plan } : {}),
    },
  };
  const currentCover = cover ?? defaultCover(goal);
  goal.data.cover = currentCover;
  let summary;
  try {
    summary = savingSummary(doc!, goal);
  } catch {
    summary = savingSummary(doc!, {
      ...goal,
      data: { ...goal.data, plan: undefined },
    });
  }
  const move = (n: number) => {
    setError("");
    setStep(n);
    requestAnimationFrame(() => {
      content.current?.scrollIntoView({ block: "start" });
      content.current?.focus({ preventScroll: true });
    });
  };
  const validateBudget = () => {
    if (!name.trim()) throw Error("Dê um nome ao seu horizonte.");
    if (!Number.isFinite(saved) || saved < 0 || saved > 1e9)
      throw Error("Informe um saldo inicial válido.");
    if (method === "planned") validateHorizonPlanner(planner);
    else if (!Number.isFinite(target) || target <= 0 || target > 1e9)
      throw Error("Informe um valor desejado maior que zero, até R$ 1 bilhão.");
    validateCover(currentCover);
  };
  const next = () => {
    try {
      if (step === 0 && !category)
        throw Error("Escolha uma categoria para o seu horizonte.");
      if (step === 1 && !method)
        throw Error("Escolha Definir valor ou Planejar meu horizonte.");
      if (step === 2) {
        validateBudget();
        if (!planSeeded || !planTouched) {
          let seed = { ...input };
          if (!requestedDeadline && seed.mode === "date")
            seed = { ...seed, mode: "months", deadline: "" };
          if (
            method === "planned" &&
            planner.type === "savings" &&
            planner.method === "period"
          )
            seed = {
              ...seed,
              mode: "months",
              monthly: planner.monthly,
              months: planner.months,
            };
          else if (requestedDeadline)
            seed = { ...seed, mode: "date", deadline: requestedDeadline };
          setInput(seed);
          setPlanSeeded(true);
        } else if (
          requestedDeadline !== syncedDeadline &&
          input.mode === "date" &&
          input.deadline === syncedDeadline
        ) {
          setInput({
            ...input,
            mode: requestedDeadline ? "date" : "months",
            deadline: requestedDeadline,
          });
        }
      }
      if (step === 2) setSyncedDeadline(requestedDeadline);
      if (step === 3 && strategy !== "later") {
        if (planError) throw Error(planError);
        validatePlan(plan);
        if (
          plan.firstDate < today() ||
          plan.extras.some((e) => e.date < today())
        )
          throw Error(
            "Use datas de hoje em diante para os novos aportes planejados.",
          );
        if (strategy === "custom" && !plan.extras.length && goalTarget > saved)
          throw Error(
            "Adicione ao menos um aporte personalizado ou escolha Definir depois.",
          );
      }
      move(step + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const categoryLabel =
    horizonCategories.find((c) => c.id === category)?.label ?? "";
  let available: ReturnType<typeof occurrences> = [];
  try {
    if (strategy !== "later" && !planError)
      available = occurrences(
        planStreams(plan),
        today(),
        plan.deadline || addMonths(today(), 600),
      );
  } catch {
    /* Invalid drafts remain editable and cannot be submitted. */
  }
  return (
    <Modal
      title="Criar horizonte"
      onClose={onClose}
      className="horizon-wizard-modal"
    >
      <div className="horizon-wizard">
        <ol className="horizon-steps" aria-label="Etapas de criação">
          {steps.map((s, i) => (
            <li
              key={s}
              className={i === step ? "current" : i < step ? "done" : ""}
              aria-current={i === step ? "step" : undefined}
            >
              <span>{i < step ? <Check size={13} /> : i + 1}</span>
              <small>{s}</small>
            </li>
          ))}
        </ol>
        <div className="horizon-step-content" ref={content} tabIndex={-1}>
          <div className="wizard-heading">
            <span className="eyebrow">
              ETAPA {step + 1} DE 5
              {categoryLabel
                ? ` · ${categoryLabel.toLocaleUpperCase("pt-BR")}`
                : ""}
            </span>
            <h3>
              {
                [
                  "Qual é o seu próximo horizonte?",
                  "Como você quer começar?",
                  method === "direct"
                    ? "Dê forma ao seu objetivo."
                    : categoryBrief[category]?.title,
                  "Escolha um ritmo que cabe na sua vida.",
                  "Seu próximo horizonte começa aqui.",
                ][step]
              }
            </h3>
            <p>
              {
                [
                  "Escolha o que deseja conquistar. Todo horizonte pode começar com um valor ou com um plano.",
                  "Duas formas simples de chegar ao mesmo lugar.",
                  method === "direct"
                    ? "Informe o valor que quer juntar. Depois, vamos planejar como chegar lá."
                    : categoryBrief[category]?.hint,
                  "Os aportes abaixo são previsões. Somente dinheiro registrado será contado como acumulado.",
                  "Confira o orçamento e os aportes. Nada será criado antes da sua confirmação.",
                ][step]
              }
            </p>
          </div>
          {step === 0 && (
            <div
              className="horizon-category-choices"
              role="group"
              aria-label="Categoria do horizonte"
            >
              {horizonCategories.map((c) => {
                const Icon = icons[c.id];
                return (
                  <button
                    type="button"
                    key={c.id}
                    aria-pressed={category === c.id}
                    className={category === c.id ? "selected" : ""}
                    onClick={() => setCategory(c.id)}
                  >
                    <img src={`/covers/${c.images[0]}.webp`} alt="" />
                    <span>
                      <Icon size={20} />
                      <strong>
                        {c.id === "travel"
                          ? "Viagem"
                          : c.id === "car"
                            ? "Carro"
                            : c.id === "personal"
                              ? "Objetivo personalizado"
                              : c.label}
                      </strong>
                      {category === c.id && <Check size={18} />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {step === 1 && (
            <div
              className="horizon-method-choices"
              role="group"
              aria-label="Como definir seu horizonte"
            >
              <button
                type="button"
                aria-pressed={method === "direct"}
                className={method === "direct" ? "selected" : ""}
                onClick={() => setMethod("direct")}
              >
                <span className="method-icon">
                  <Wallet size={25} />
                </span>
                <h4>Definir valor</h4>
                <p>Já sei quanto quero juntar.</p>
                <span className="method-action">
                  Informar meu valor
                  <ArrowRight size={16} />
                </span>
              </button>
              <button
                type="button"
                aria-pressed={method === "planned"}
                className={method === "planned" ? "selected" : ""}
                onClick={() => setMethod("planned")}
              >
                <span className="method-icon">
                  <Calculator size={25} />
                </span>
                <h4>Planejar meu horizonte</h4>
                <p>Quero calcular quanto preciso para realizar meu objetivo.</p>
                <span className="method-action">
                  Construir meu orçamento
                  <ArrowRight size={16} />
                </span>
              </button>
            </div>
          )}
          {step === 2 && (
            <form
              id="horizon-budget-step"
              onSubmit={(e) => {
                e.preventDefault();
                next();
              }}
            >
              <div className="budget-fields wizard-name-fields">
                <label className="budget-wide">
                  Nome do objetivo
                  <input
                    value={name}
                    maxLength={160}
                    required
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      category === "travel"
                        ? "Minha próxima viagem"
                        : category === "car"
                          ? "Meu próximo carro"
                          : "O que você quer conquistar?"
                    }
                  />
                </label>
                <label className="budget-wide">
                  Descrição do horizonte (opcional)
                  <textarea
                    value={notes}
                    maxLength={2000}
                    rows={2}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="O que torna esse horizonte especial?"
                  />
                </label>
              </div>
              {method === "direct" ? (
                <div className="budget-fields">
                  <BudgetNumber
                    label="Valor desejado (R$)"
                    value={target}
                    onChange={setTarget}
                    required
                    min={0.01}
                  />
                  <BudgetNumber
                    label="Quanto já possui guardado (R$)"
                    value={saved}
                    onChange={updateSaved}
                    hint="Dinheiro já existente; não cria uma receita."
                  />
                </div>
              ) : (
                <HorizonBudgetFields
                  value={planner}
                  onChange={setPlanner}
                  category={category}
                  initialSaved={saved}
                  onInitialSaved={updateSaved}
                />
              )}
              {!(method === "planned" && planner.type === "travel") && (
                <label className="budget-field">
                  Prazo desejado (opcional)
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                  <small>
                    Você também pode definir o prazo pelos aportes na próxima
                    etapa.
                  </small>
                </label>
              )}
              {estimate && <BudgetBreakdown estimate={estimate} />}
              {method === "planned" && saved > 0 && (
                <p className="info-box">
                  O orçamento total é {money(goalTarget)}. Com {money(saved)} já
                  guardados, faltam {money(Math.max(0, goalTarget - saved))}. O
                  saldo guardado não é descontado duas vezes.
                </p>
              )}
              <details className="wizard-appearance">
                <summary>Personalizar foto e destaque</summary>
                <CoverPicker
                  goal={goal}
                  value={currentCover}
                  onChange={setCover}
                  onBusy={setImageBusy}
                />
                <label>
                  Prioridade
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="3">Alta</option>
                    <option value="2">Média</option>
                    <option value="1">Baixa</option>
                  </select>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={featured}
                    onChange={(e) => setFeatured(e.target.checked)}
                  />
                  Destacar em Seus próximos horizontes
                </label>
              </details>
            </form>
          )}
          {step === 3 && (
            <div className="wizard-contributions">
              <div className="wizard-target-strip">
                <span>
                  Seu objetivo<strong>{money(goalTarget)}</strong>
                </span>
                <span>
                  Já guardado<strong>{money(saved)}</strong>
                </span>
                <span>
                  Falta guardar
                  <strong>{money(Math.max(0, goalTarget - saved))}</strong>
                </span>
              </div>
              <div
                className="wizard-strategies"
                role="group"
                aria-label="Estratégia de aportes"
              >
                {[
                  ["regular", "Aporte ou prazo"],
                  ["custom", "Aportes personalizados"],
                  ["later", "Definir depois"],
                ].map(([v, l]) => (
                  <button
                    type="button"
                    key={v}
                    className={strategy === v ? "selected" : ""}
                    aria-pressed={strategy === v}
                    onClick={() => setStrategy(v as typeof strategy)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {strategy === "regular" && (
                <PlanControls
                  value={input}
                  onChange={(v) => {
                    setInput(v);
                    setPlanTouched(true);
                  }}
                />
              )}
              {strategy === "custom" && (
                <>
                  <p className="info-box">
                    Combine valores diferentes em meses específicos, aportes
                    semanais e extras. Sem aporte mensal fixo; cada valor é
                    contado apenas na data configurada.
                  </p>
                  <ExtraStreams
                    value={input.extras}
                    onChange={(extras) => {
                      setInput({ ...input, extras });
                      setPlanTouched(true);
                    }}
                  />
                </>
              )}
              {strategy === "later" ? (
                <p className="info-box">
                  Seu horizonte será criado sem aportes previstos. Você poderá
                  planejar ou adicionar dinheiro quando quiser.
                </p>
              ) : (
                <>
                  <div className="plan-result">
                    <CalendarDays size={24} />
                    <div>
                      <span>
                        {input.mode === "monthly" || strategy === "custom"
                          ? "Conclusão estimada"
                          : "Aporte mensal necessário"}
                      </span>
                      <strong>
                        {input.mode === "monthly" || strategy === "custom"
                          ? plan.deadline
                            ? dateLabel(plan.deadline)
                            : "Sem previsão com estes aportes"
                          : money(plan.monthly)}
                      </strong>
                      <small>
                        {available.length} ocorrência(s) futura(s). Sem
                        rendimento presumido.
                      </small>
                    </div>
                  </div>
                  {requestedDeadline &&
                    summary.completion &&
                    summary.completion > requestedDeadline && (
                      <p className="info-box">
                        A previsão ultrapassa {dateLabel(requestedDeadline)}.
                        Ajuste os aportes ou revise a data desejada; você também
                        pode criar e acompanhar esse plano.
                      </p>
                    )}
                  <details className="wizard-convention">
                    <summary>Como contamos as datas e os aportes</summary>
                    <p>
                      {dateConvention} Aportes extras podem antecipar a
                      conclusão ou reduzir o valor mensal, conforme a estratégia
                      escolhida.
                    </p>
                  </details>
                </>
              )}
              {planError && strategy !== "later" && (
                <p className="error-box" role="alert">
                  {planError}
                </p>
              )}
            </div>
          )}
          {step === 4 && (
            <div className="wizard-review">
              <div className="wizard-review-cover">
                <HorizonCover goal={goal} cover={currentCover} />
                <div>
                  <span>{categoryLabel}</span>
                  <h4>{name}</h4>
                </div>
              </div>
              <div className="budget-review-facts">
                <div>
                  <span>Valor do horizonte</span>
                  <strong>{money(goalTarget)}</strong>
                </div>
                <div>
                  <span>Já reservado</span>
                  <strong>{money(saved)}</strong>
                </div>
                <div>
                  <span>Falta guardar</span>
                  <strong>{money(Math.max(0, goalTarget - saved))}</strong>
                </div>
                <div>
                  <span>Conclusão estimada</span>
                  <strong>
                    {summary.completion && strategy !== "later"
                      ? dateLabel(summary.completion)
                      : saved >= goalTarget
                        ? "Objetivo alcançado"
                        : "Sem previsão"}
                  </strong>
                </div>
              </div>
              {requestedDeadline && (
                <p className="muted">
                  Prazo desejado: {dateLabel(requestedDeadline)}.
                </p>
              )}
              <div className="wizard-review-line">
                <span>
                  {method === "direct"
                    ? "Definir valor"
                    : "Planejar meu horizonte"}
                </span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => move(2)}
                >
                  <Pencil size={15} />
                  Revisar orçamento
                </button>
              </div>
              {estimate && (
                <details className="budget-saved-details">
                  <summary>Ver composição do orçamento</summary>
                  <BudgetBreakdown estimate={estimate} compact />
                </details>
              )}
              <div className="wizard-review-line">
                <span>
                  {strategy === "later"
                    ? "Aportes a definir"
                    : strategy === "custom"
                      ? `${input.extras.length} aporte(s) personalizado(s)`
                      : `${money(plan.monthly)} por mês planejados`}
                </span>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => move(3)}
                >
                  <Pencil size={15} />
                  Revisar aportes
                </button>
              </div>
              <p className="info-box">
                Criar o horizonte reserva apenas o saldo inicial informado.
                Aportes planejados não entram no acumulado. Não serão criadas
                receitas, despesas ou transferências.
              </p>
            </div>
          )}
          {(error || (step === 2 && calculationError)) && (
            <p className="error-box" role="alert">
              {error || calculationError}
            </p>
          )}
        </div>
        <div className="wizard-footer">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => (step === 0 ? onClose() : move(step - 1))}
          >
            <ArrowLeft size={16} />
            {step === 0 ? "Cancelar" : "Voltar"}
          </button>
          <span>{step + 1} de 5</span>
          {step < 4 ? (
            <button
              type="button"
              className="btn primary"
              disabled={imageBusy}
              onClick={(e) => {
                e.preventDefault();
                if (step === 2)
                  (
                    document.getElementById(
                      "horizon-budget-step",
                    ) as HTMLFormElement | null
                  )?.requestSubmit();
                else next();
              }}
            >
              Continuar
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={busy || imageBusy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  validateBudget();
                  if (strategy !== "later") {
                    if (planError) throw Error(planError);
                    validatePlan(plan);
                  }
                  await edit([
                    {
                      id,
                      kind: "goal",
                      data: { ...goal.data, name: name.trim() },
                    },
                  ]);
                  message("Horizonte criado. Seu próximo passo começa aqui.");
                  onSaved?.(id);
                  onClose();
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Criando…" : "Criar meu horizonte"}
              <Check size={16} />
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
