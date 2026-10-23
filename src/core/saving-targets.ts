import { tripCost } from "./finance";
import { addMonths, today, type Document, type Entity } from "./model";
import {
  contributions,
  fundedOccurrences,
  remainingOccurrences,
  defaultPlan,
  occurrences,
  positive,
  projectSavings,
  requiredMonthly,
  reservedValue,
  type SavingPlan,
  roundMoney,
  manualPlannedStreams,
} from "./contributions";
export const tripScenarios = [
  { value: "economy", label: "Econômico", factor: 0.8 },
  { value: "standard", label: "Padrão", factor: 1 },
  { value: "comfort", label: "Confortável", factor: 1.3 },
];
export function targetValue(goal: Entity) {
  return goal.kind === "trip"
    ? roundMoney(
        positive(
          tripCost(
            goal.data,
            tripScenarios.find((s) => s.value === goal.data.scenario)?.factor ??
              1,
          ).total,
        ),
      )
    : positive(goal.data.target);
}
export function savingSummary(doc: Document, goal: Entity, asOf = today()) {
  const target = targetValue(goal),
    saved = reservedValue(doc, goal, asOf),
    remaining = roundMoney(Math.max(0, target - saved));
  const plan: SavingPlan = goal.data.plan ?? defaultPlan(goal);
  const paidThisMonth = contributions(doc, goal.id, asOf)
    .filter((e) => e.data.date.startsWith(asOf.slice(0, 7)) && !e.data.extra)
    .reduce((s, e) => s + e.data.amount, 0);
  const funded = fundedOccurrences(doc, goal.id, asOf);
  const desired =
    goal.kind === "trip" ? goal.data.start : goal.data.deadline || "";
  const forecastPlan = {
    ...plan,
    extras: [...(plan.extras ?? []), ...manualPlannedStreams(doc, goal.id)],
  };
  const required = requiredMonthly(
    target,
    saved,
    {
      ...forecastPlan,
      deadline: desired,
    },
    asOf,
    paidThisMonth,
    funded,
  );
  const future = remainingOccurrences(
    forecastPlan,
    asOf,
    addMonths(asOf, 600),
    funded,
  );
  const streams = future.map((e, i) => ({
    id: String(i),
    description: "Aporte futuro",
    amount: e.amount,
    date: e.date,
    frequency: "once" as const,
    interval: 1,
  }));
  const forecast = projectSavings({
    target,
    initial: saved,
    start: asOf,
    streams,
  });
  const completion = remaining === 0 ? asOf : forecast.completion;
  return {
    target,
    saved,
    remaining,
    plan,
    paidThisMonth,
    required,
    completion,
    projection: forecast.data.slice(0, 24),
    excess: roundMoney(Math.max(0, saved - target)),
    percent: target ? Math.min(100, (saved / target) * 100) : 100,
    meetsDate: !!completion && (!desired || completion <= desired),
    desired,
    monthlyPlanned: positive(plan.monthly),
    configured: !!goal.data.plan,
    upcoming:
      remaining > 0
        ? future.filter((e) => !plan.deadline || e.date <= plan.deadline)
        : [],
  };
}
