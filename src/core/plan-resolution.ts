import { addMonths, today } from "./model";
import {
  projectSavings,
  remainingOccurrences,
  planStreams,
  requiredMonthly,
  type FundedOccurrence,
  type SavingPlan,
  type SavingStream,
} from "./contributions";

export function resolvePlan(
  input: SavingPlan,
  target: number,
  initial: number,
  asOf = today(),
  funded?: FundedOccurrence[],
  additional: SavingStream[] = [],
): SavingPlan {
  const p = { ...input, effective: asOf, extras: input.extras ?? [] };
  const forecastPlan = { ...p, extras: [...p.extras, ...additional] };
  if (
    p.mode === "months" &&
    Number.isInteger(p.months) &&
    p.months >= 1 &&
    p.months <= 600
  )
    p.deadline = addMonths(p.firstDate, p.months - 1);
  if (p.mode === "monthly") {
    p.deadline =
      projectSavings({
        target,
        initial,
        start: asOf,
        streams: funded
          ? remainingOccurrences(
              forecastPlan,
              asOf,
              addMonths(asOf, 600),
              funded,
            ).map((e, i) => ({
              id: String(i),
              description: "Aporte futuro",
              frequency: "once" as const,
              amount: e.amount,
              date: e.date,
              interval: 1,
            }))
          : planStreams(forecastPlan),
      }).completion ?? "";
  } else {
    const required = requiredMonthly(
      target,
      initial,
      { ...p, extras: forecastPlan.extras },
      asOf,
      0,
      funded,
    );
    if (required === null)
      throw Error(
        "Não há aportes mensais disponíveis até esse prazo. Atualize a data do primeiro aporte ou o prazo antes de recalcular.",
      );
    p.monthly = required;
  }
  return p;
}
