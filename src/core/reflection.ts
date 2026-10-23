import {
  confirmedMovements,
  positive,
  roundMoney,
  validDate,
} from "./contributions";
import { rows, today, type Document } from "./model";
import { targetValue } from "./saving-targets";

export type ProvenMilestone = {
  id: string;
  date: string;
  name: string;
  amount: number;
  goalId?: string;
  basis: "net-deposits" | "goal-target";
};
export type WealthObservation = {
  id: string;
  at: string;
  date: string;
  timestamp: number;
  balance: number;
  netWorth: number;
};

export function reflectionRecords(doc: Document, tab: "journal" | "milestone") {
  return rows(doc, "simulation")
    .filter((e) => e.data.tab === tab)
    .sort(
      (a, b) =>
        String(b.data.date).localeCompare(String(a.data.date)) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
}

function datedMovements(doc: Document, asOf: string) {
  return confirmedMovements(doc, undefined, asOf)
    .filter(
      (e) =>
        validDate(e.data.date) &&
        e.data.date <= asOf &&
        Number.isFinite(Number(e.data.amount)) &&
        Number(e.data.amount) > 0,
    )
    .sort(
      (a, b) =>
        a.data.date.localeCompare(b.data.date) ||
        Number(a.data.direction === "withdrawal") -
          Number(b.data.direction === "withdrawal") ||
        a.id.localeCompare(b.id),
    );
}

/** Achievement dates are evidence from registered money movements, not creation dates. */
export function provenMilestones(
  doc: Document,
  asOf = today(),
): ProvenMilestone[] {
  const movements = datedMovements(doc, asOf),
    out: ProvenMilestone[] = [];
  let net = 0;
  const thresholds = [1000, 10000];
  const reached = new Set<number>();
  for (const e of movements) {
    net = roundMoney(
      net +
        (e.data.direction === "withdrawal" ? -1 : 1) * positive(e.data.amount),
    );
    for (const threshold of thresholds)
      if (!reached.has(threshold) && net >= threshold) {
        reached.add(threshold);
        out.push({
          id: `net-deposits:${threshold}`,
          date: e.data.date,
          name:
            threshold === 1000
              ? "Primeiros R$ 1.000 em aportes líquidos registrados"
              : "Primeiros R$ 10 mil em aportes líquidos registrados",
          amount: threshold,
          basis: "net-deposits",
        });
      }
  }
  for (const goal of doc.entities.filter(
    (e) => !e.deleted && (e.kind === "goal" || e.kind === "trip"),
  )) {
    const target = targetValue(goal);
    let accumulated = positive(goal.data.saved);
    // An initial reserve that already meets the target has no provable completion date.
    if (target <= 0 || accumulated >= target) continue;
    for (const e of movements.filter(
      (entry) => entry.data.goalId === goal.id,
    )) {
      const before = accumulated;
      accumulated = roundMoney(
        accumulated +
          (e.data.direction === "withdrawal" ? -1 : 1) *
            positive(e.data.amount),
      );
      if (before < target && accumulated >= target) {
        out.push({
          id: `goal-target:${goal.id}`,
          date: e.data.date,
          name: goal.data.name || "Horizonte alcançado",
          amount: target,
          goalId: goal.id,
          basis: "goal-target",
        });
        break;
      }
    }
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
}

function brazilDate(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function wealthObservations(
  doc: Document,
  year: number,
  asOf = today(),
): WealthObservation[] {
  return rows(doc, "simulation")
    .filter((e) => e.data.tab === "wealth-snapshot")
    .flatMap((e): WealthObservation[] => {
      const at = e.data.at;
      if (
        typeof at !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T/.test(at) ||
        !validDate(at.slice(0, 10))
      )
        return [];
      const timestamp = Date.parse(at);
      if (
        !Number.isFinite(timestamp) ||
        typeof e.data.balance !== "number" ||
        !Number.isFinite(e.data.balance) ||
        typeof e.data.netWorth !== "number" ||
        !Number.isFinite(e.data.netWorth)
      )
        return [];
      const date = brazilDate(timestamp);
      if (!date.startsWith(`${year}-`) || date > asOf) return [];
      return [
        {
          id: e.id,
          at,
          date,
          timestamp,
          balance: roundMoney(Number(e.data.balance)),
          netWorth: roundMoney(Number(e.data.netWorth)),
        },
      ];
    })
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}

export function annualReflection(doc: Document, year: number, asOf = today()) {
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || !validDate(asOf))
    throw Error("Escolha um ano válido.");
  const start = `${year}-01-01`,
    end = `${year}-12-31`,
    cutoff = end < asOf ? end : asOf;
  const inYear = (date: unknown): date is string =>
    typeof date === "string" &&
    validDate(date) &&
    date >= start &&
    date <= cutoff;
  const transactions = rows(doc, "transaction").filter(
    (e) =>
      e.data.status === "confirmed" &&
      inYear(e.data.date) &&
      Number.isFinite(Number(e.data.amount)) &&
      Number(e.data.amount) > 0,
  );
  const income = roundMoney(
    transactions
      .filter((e) => e.data.type === "income")
      .reduce((sum, e) => sum + positive(e.data.amount), 0),
  );
  const expense = roundMoney(
    transactions
      .filter((e) => e.data.type === "expense")
      .reduce((sum, e) => sum + positive(e.data.amount), 0),
  );
  const movements = datedMovements(doc, cutoff).filter((e) =>
    inYear(e.data.date),
  );
  const deposits = roundMoney(
    movements
      .filter((e) => e.data.direction !== "withdrawal")
      .reduce((sum, e) => sum + positive(e.data.amount), 0),
  );
  const withdrawals = roundMoney(
    movements
      .filter((e) => e.data.direction === "withdrawal")
      .reduce((sum, e) => sum + positive(e.data.amount), 0),
  );
  const milestones = provenMilestones(doc, cutoff).filter((e) =>
    inYear(e.date),
  );
  const manual = reflectionRecords(doc, "milestone").filter((e) =>
    inYear(e.data.date),
  );
  const observations = wealthObservations(doc, year, cutoff);
  const first = observations[0],
    last = observations.at(-1);
  return {
    year,
    cutoff,
    income,
    expense,
    saving: roundMoney(income - expense),
    deposits,
    withdrawals,
    netDeposits: roundMoney(deposits - withdrawals),
    completed: milestones.filter((e) => e.basis === "goal-target"),
    automatic: milestones.filter((e) => e.basis === "net-deposits"),
    manual,
    observations,
    wealthChange:
      first && last && first.timestamp !== last.timestamp
        ? roundMoney(last.netWorth - first.netWorth)
        : null,
    recordCount: transactions.length + movements.length,
  };
}

export function reflectionLinkChoices(doc: Document) {
  const scenarioTabs = new Set([
    "savings",
    "purchase",
    "vehicle",
    "housing",
    "investment",
    "reserve",
    "forecast",
    "what-if",
    "decisions",
    "freedom",
  ]);
  return doc.entities
    .filter(
      (e) =>
        !e.deleted &&
        (e.kind === "goal" ||
          e.kind === "trip" ||
          e.kind === "contribution" ||
          (e.kind === "simulation" && scenarioTabs.has(e.data.tab))),
    )
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      label: `${e.kind === "goal" || e.kind === "trip" ? "Horizonte" : e.kind === "contribution" ? (e.data.direction === "withdrawal" ? "Retirada" : "Aporte") : "Cenário"} · ${e.data.name || e.data.description || "Sem título"}`,
    }));
}

export function validateReflectionRecord(
  data: Record<string, unknown>,
  asOf = today(),
) {
  if (
    typeof data.name !== "string" ||
    !data.name.trim() ||
    data.name.length > 120
  )
    throw Error("Informe um título com até 120 caracteres.");
  if (
    typeof data.description !== "string" ||
    !data.description.trim() ||
    data.description.length > 10000
  )
    throw Error("Escreva uma descrição com até 10 mil caracteres.");
  if (
    typeof data.date !== "string" ||
    !validDate(data.date) ||
    data.date > asOf
  )
    throw Error("Informe uma data válida até hoje.");
}
