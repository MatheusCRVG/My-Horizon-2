import {
  cents,
  fromCents,
  uid,
  today,
  type Entity,
  type Document,
} from "./model";
import {
  validDate,
  reservedValue,
  revisedPlan,
  fundedOccurrences,
  manualPlannedStreams,
  validatePlan,
  type SavingPlan,
} from "./contributions";
import { resolvePlan } from "./plan-resolution";

export type BudgetItem = { id: string; name: string; amount: number };
export type HorizonPlanner =
  | {
      version: 1;
      type: "travel";
      city: string;
      state: string;
      country: string;
      date: string;
      days: number;
      people: number;
      transport: "plane" | "car" | "bus" | "other";
      transportCost: number;
      transportUnit: "person" | "group";
      nights: number;
      nightly: number;
      foodDaily: number;
      tours: number;
      local: number;
      additional: number;
      contingencyMode: "percent" | "amount";
      contingency: number;
    }
  | {
      version: 1;
      type: "car";
      model: string;
      vehicle: number;
      initialCosts: number;
      buffer: number;
    }
  | {
      version: 1;
      type: "savings";
      purpose: string;
      method: "period" | "target";
      monthly: number;
      months: number;
      base: number;
      desired: number;
    }
  | {
      version: 1;
      type: "reserve";
      essentialMonthly: number;
      coverage: number;
      buffer: number;
    }
  | { version: 1; type: "items"; items: BudgetItem[] };
export type BudgetEstimate = {
  total: number;
  lines: { label: string; amount: number; detail?: string }[];
};

export const categoryBrief: Record<
  string,
  { title: string; hint: string; items?: string[] }
> = {
  travel: {
    title: "Uma viagem do seu jeito",
    hint: "Informe suas estimativas em reais. Você decide cada custo, sem cotações automáticas.",
  },
  car: {
    title: "Seu próximo carro",
    hint: "Some o veículo e os custos para começar. Financiamentos e parcelas ficam fora deste orçamento.",
  },
  savings: {
    title: "Dê um propósito ao seu dinheiro",
    hint: "Descubra quanto pode acumular ou escolha um valor final. Sem supor rendimentos.",
  },
  reserve: {
    title: "Mais tranquilidade para o futuro",
    hint: "Calcule uma reserva a partir das suas despesas essenciais e dos meses de cobertura.",
  },
  home: {
    title: "Seu lugar no mundo",
    hint: "Planeje a entrada ou o valor que deseja juntar para a casa, sem incluir parcelas futuras de financiamento.",
    items: [
      "Entrada ou valor a juntar para o imóvel",
      "Documentação e impostos",
      "Mudança e preparação",
    ],
  },
  study: {
    title: "Invista nos seus próximos passos",
    hint: "Monte o orçamento de um curso, formação ou projeto de estudos.",
    items: [
      "Curso ou mensalidades (total)",
      "Materiais e equipamentos",
      "Transporte e outras despesas",
    ],
  },
  personal: {
    title: "Um objetivo com a sua cara",
    hint: "Dê nome aos itens do seu plano. A soma define seu horizonte.",
    items: ["Item do objetivo"],
  },
  other: {
    title: "Seu horizonte, suas escolhas",
    hint: "Organize os itens e as despesas que compõem essa conquista.",
    items: ["Item do objetivo"],
  },
};
export function newHorizonPlanner(category: string, base = 0): HorizonPlanner {
  if (category === "travel")
    return {
      version: 1,
      type: "travel",
      city: "",
      state: "",
      country: "",
      date: "",
      days: 1,
      people: 1,
      transport: "plane",
      transportCost: 0,
      transportUnit: "person",
      nights: 0,
      nightly: 0,
      foodDaily: 0,
      tours: 0,
      local: 0,
      additional: 0,
      contingencyMode: "percent",
      contingency: 0,
    };
  if (category === "car")
    return {
      version: 1,
      type: "car",
      model: "",
      vehicle: 0,
      initialCosts: 0,
      buffer: 0,
    };
  if (category === "savings")
    return {
      version: 1,
      type: "savings",
      purpose: "",
      method: "period",
      monthly: 0,
      months: 12,
      base,
      desired: 0,
    };
  if (category === "reserve")
    return {
      version: 1,
      type: "reserve",
      essentialMonthly: 0,
      coverage: 6,
      buffer: 0,
    };
  return {
    version: 1,
    type: "items",
    items: (categoryBrief[category]?.items ?? ["Item do objetivo"]).map(
      (name) => ({ id: uid(), name, amount: 0 }),
    ),
  };
}
function amount(value: number, label: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1e9
  )
    throw Error(`Informe um valor válido para ${label.toLowerCase()}.`);
  return cents(value);
}
function quantity(value: number, max: number, label: string, min = 1) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw Error(`Confira ${label.toLowerCase()} (${min} a ${max}).`);
  return value;
}
/** All multiplication is on integer centavos. Group costs are counted once. */
export function estimateHorizon(p: HorizonPlanner): BudgetEstimate {
  if (!p || p.version !== 1)
    throw Error("Este planejamento precisa ser revisto antes de editar.");
  const lines: BudgetEstimate["lines"] = [];
  const line = (label: string, value: number, detail?: string) =>
    lines.push({ label, amount: fromCents(value), detail });
  if (p.type === "travel") {
    const days = quantity(p.days, 730, "Duração"),
      people = quantity(p.people, 100, "Número de viajantes"),
      nights = quantity(p.nights, 730, "Número de noites", 0);
    if (
      !["plane", "car", "bus", "other"].includes(p.transport) ||
      !["person", "group"].includes(p.transportUnit) ||
      !["percent", "amount"].includes(p.contingencyMode)
    )
      throw Error("Confira transporte, unidade dos custos e imprevistos.");
    line(
      p.transport === "car"
        ? "Combustível e pedágios"
        : "Transporte até o destino",
      amount(p.transportCost, "Transporte") *
        (p.transportUnit === "person" ? people : 1),
      p.transportUnit === "person"
        ? `Ida e volta · ${people} pessoa(s)`
        : "Ida e volta · total do grupo",
    );
    line(
      "Hospedagem",
      amount(p.nightly, "Hospedagem") * nights,
      `${nights} noite(s) · valor do grupo por noite`,
    );
    line(
      "Alimentação",
      amount(p.foodDaily, "Alimentação") * days * people,
      `${days} dia(s) × ${people} pessoa(s)`,
    );
    line("Passeios e atrações", amount(p.tours, "Passeios"), "Total do grupo");
    line(
      "Transporte local",
      amount(p.local, "Transporte local"),
      "Total do grupo, sem repetir o transporte até o destino",
    );
    line(
      "Despesas adicionais",
      amount(p.additional, "Despesas adicionais"),
      "Total do grupo",
    );
    const subtotal = lines.reduce((s, l) => s + cents(l.amount), 0);
    if (
      p.contingencyMode === "percent" &&
      (!Number.isFinite(p.contingency) ||
        p.contingency < 0 ||
        p.contingency > 100)
    )
      throw Error("Use de 0% a 100% para imprevistos.");
    line(
      "Reserva para imprevistos",
      p.contingencyMode === "percent"
        ? Math.round((subtotal * p.contingency) / 100)
        : amount(p.contingency, "Imprevistos"),
      p.contingencyMode === "percent"
        ? `${p.contingency}% sobre os custos acima`
        : "Valor fixo, contado uma única vez",
    );
  } else if (p.type === "car") {
    line("Veículo", amount(p.vehicle, "Valor do veículo"), p.model);
    line("Despesas iniciais", amount(p.initialCosts, "Despesas iniciais"));
    line("Reserva adicional", amount(p.buffer, "Reserva adicional"));
  } else if (p.type === "savings") {
    if (!["period", "target"].includes(p.method))
      throw Error("Escolha como estimar sua reserva.");
    if (p.method === "target")
      line("Valor final desejado", amount(p.desired, "Valor final desejado"));
    else {
      line(
        "Saldo inicial considerado",
        amount(p.base, "Saldo inicial"),
        "Base da estimativa; não é um novo aporte",
      );
      line(
        "Aportes do período",
        amount(p.monthly, "Aporte mensal") *
          quantity(p.months, 600, "Quantidade de meses"),
        `${p.months} mês(es), sem rendimento`,
      );
    }
  } else if (p.type === "reserve") {
    line(
      "Cobertura das despesas essenciais",
      amount(p.essentialMonthly, "Despesas essenciais") *
        quantity(p.coverage, 60, "Meses de cobertura"),
      `${p.coverage} mês(es) de cobertura`,
    );
    line("Reserva adicional", amount(p.buffer, "Reserva adicional"));
  } else if (p.type === "items") {
    if (!Array.isArray(p.items) || p.items.length < 1 || p.items.length > 40)
      throw Error("Inclua de 1 a 40 itens no seu horizonte.");
    for (const item of p.items)
      line(item.name || "Item sem nome", amount(item.amount, "Valor do item"));
  } else throw Error("Este tipo de planejamento não é reconhecido.");
  const total = lines.reduce((s, l) => s + cents(l.amount), 0);
  if (!Number.isSafeInteger(total) || total > cents(1e9))
    throw Error(
      "O total ultrapassa o limite de R$ 1 bilhão. Revise os valores.",
    );
  return { total: fromCents(total), lines };
}
export function validateHorizonPlanner(p: HorizonPlanner) {
  const estimate = estimateHorizon(p);
  if (estimate.total <= 0)
    throw Error("Informe os custos para calcular um horizonte maior que zero.");
  if (p.type === "travel") {
    if (!p.city.trim() || !p.country.trim())
      throw Error("Informe a cidade e o país do destino.");
    if (p.date && !validDate(p.date))
      throw Error("Informe uma data válida para a viagem.");
  }
  if (p.type === "car" && !p.model.trim())
    throw Error("Informe o modelo do carro.");
  if (p.type === "savings" && !p.purpose.trim())
    throw Error("Dê uma finalidade ao dinheiro que deseja guardar.");
  if (p.type === "items" && p.items.some((i) => !i.name.trim()))
    throw Error("Dê um nome a cada item do orçamento.");
  return estimate;
}
/** A snapshot only. The confirmed target remains goal.data.target until review. */
export function plannerFor(goal: Entity): HorizonPlanner | undefined {
  return goal.data.planner?.version === 1 ? goal.data.planner : undefined;
}
export function reviseHorizonBudget(
  doc: Document,
  goal: Entity,
  planner: HorizonPlanner,
  adaptPlan: boolean,
  asOf = today(),
): Entity["data"] {
  const { total } = validateHorizonPlanner(planner);
  if (goal.kind !== "goal")
    throw Error(
      "Este orçamento pertence a um horizonte. Viagens anteriores mantêm seu editor original.",
    );
  let data: Entity["data"] = {
    ...goal.data,
    target: total,
    planner,
    creationMethod: "planned",
  };
  const previousPlanner = plannerFor(goal);
  const travelDateChanged =
    planner.type === "travel" &&
    planner.date !==
      (previousPlanner?.type === "travel"
        ? previousPlanner.date
        : (goal.data.deadline ?? ""));
  if (
    planner.type === "travel" &&
    (planner.date || previousPlanner?.type === "travel")
  )
    data = { ...data, deadline: planner.date };
  if (adaptPlan && goal.data.plan) {
    let input: SavingPlan = { ...goal.data.plan };
    if (
      travelDateChanged &&
      planner.type === "travel" &&
      planner.date &&
      input.mode !== "monthly"
    )
      input = { ...input, mode: "date", deadline: planner.date };
    const plan = resolvePlan(
      input,
      total,
      reservedValue(doc, goal, asOf),
      asOf,
      fundedOccurrences(doc, goal.id, asOf),
      manualPlannedStreams(doc, goal.id),
    );
    validatePlan(plan);
    data = { ...data, ...revisedPlan({ ...goal, data }, plan) };
  }
  return {
    ...data,
    plannerHistory: [
      ...(goal.data.plannerHistory ?? []),
      {
        at: new Date().toISOString(),
        target: goal.data.target,
        planner: goal.data.planner ?? null,
      },
    ],
  };
}
