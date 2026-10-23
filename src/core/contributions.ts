import {
  addMonths,
  cents,
  fromCents,
  rows,
  today,
  type Document,
  type Entity,
} from "./model";

export type SavingStream = {
  id: string;
  description: string;
  amount: number;
  frequency: "monthly" | "weekly" | "once";
  date: string;
  end?: string;
  interval: number;
  annualGrowth?: number;
};
export type SavingPlan = {
  mode: "monthly" | "months" | "date";
  monthly: number;
  months: number;
  firstDate: string;
  deadline: string;
  effective: string;
  extras: SavingStream[];
};
export type Occurrence = {
  date: string;
  amount: number;
  streamId: string;
  primary?: boolean;
};
export const roundMoney = (v: number) => fromCents(cents(v));
export const positive = (v: unknown) =>
  Math.max(0, Number.isFinite(Number(v)) ? Number(v) : 0);
export const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;
export const monthEnd = (month: string) =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0))
    .toISOString()
    .slice(0, 10);
export const nextDay = (date: string, days = 1) =>
  new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
export const objectives = (doc: Document) =>
  doc.entities.filter(
    (e) => !e.deleted && (e.kind === "goal" || e.kind === "trip"),
  );
export function contributions(doc: Document, goalId?: string, asOf = today()) {
  return rows(doc, "contribution").filter((e) => {
    const d = e.data;
    if (d.direction === "withdrawal") return false;
    if (
      (goalId && d.goalId !== goalId) ||
      d.status !== "confirmed" ||
      d.date > asOf
    )
      return false;
    if (!objectives(doc).some((g) => g.id === d.goalId)) return false;
    if (!d.transactionId) return true;
    const tx = rows(doc, "transaction").find((t) => t.id === d.transactionId);
    return (
      !!tx &&
      tx.data.status === "confirmed" &&
      tx.data.date <= asOf &&
      tx.data.type !== "expense" &&
      !tx.data.cardPayment &&
      positive(d.amount) <= positive(tx.data.amount)
    );
  });
}
export function withdrawals(doc: Document, goalId?: string, asOf = today()) {
  return rows(doc, "contribution").filter(
    (e) =>
      e.data.direction === "withdrawal" &&
      e.data.status === "confirmed" &&
      e.data.date <= asOf &&
      (!goalId || e.data.goalId === goalId) &&
      objectives(doc).some((g) => g.id === e.data.goalId),
  );
}
export const confirmedMovements = (
  doc: Document,
  goalId?: string,
  asOf = today(),
) => [...contributions(doc, goalId, asOf), ...withdrawals(doc, goalId, asOf)];
export function sourceReserved(doc: Document, sourceId: string) {
  let total = 0;
  for (const goal of objectives(doc)) {
    const buckets = [{ source: "", amount: cents(positive(goal.data.saved)) }];
    for (const e of confirmedMovements(doc, goal.id).sort(
      (a, b) =>
        a.data.date.localeCompare(b.data.date) ||
        Number(a.data.direction === "withdrawal") -
          Number(b.data.direction === "withdrawal"),
    )) {
      if (e.data.direction !== "withdrawal")
        buckets.push({
          source: e.data.sourceId || "",
          amount: cents(e.data.amount),
        });
      else {
        let left = cents(e.data.amount);
        for (const b of buckets) {
          const take = Math.min(b.amount, left);
          b.amount -= take;
          left -= take;
          if (!left) break;
        }
      }
    }
    total += buckets
      .filter((b) => b.source === sourceId)
      .reduce((s, b) => s + b.amount, 0);
  }
  return fromCents(total);
}
export function reservedValue(doc: Document, goal: Entity, asOf = today()) {
  return roundMoney(
    positive(goal.data.saved) +
      contributions(doc, goal.id, asOf).reduce(
        (s, e) => s + positive(e.data.amount),
        0,
      ) -
      withdrawals(doc, goal.id, asOf).reduce(
        (s, e) => s + positive(e.data.amount),
        0,
      ),
  );
}
export function totalReserved(doc: Document, asOf = today()) {
  return roundMoney(
    objectives(doc).reduce((s, g) => s + reservedValue(doc, g, asOf), 0),
  );
}
export function occurrences(
  streams: SavingStream[],
  from: string,
  to: string,
): Occurrence[] {
  if (!validDate(from) || !validDate(to) || from > to) return [];
  const out: Occurrence[] = [];
  for (const stream of streams) {
    if (
      !validDate(stream.date) ||
      !Number.isFinite(stream.amount) ||
      stream.amount <= 0
    )
      continue;
    const end = stream.end && stream.end < to ? stream.end : to;
    const interval = Math.max(
      1,
      Math.min(600, Math.floor(Number(stream.interval) || 1)),
    );
    for (let i = 0; i <= 5000; i++) {
      const date =
        stream.frequency === "once"
          ? stream.date
          : stream.frequency === "monthly"
            ? addMonths(stream.date, i * interval)
            : nextDay(stream.date, i * interval * 7);
      if (date > end) break;
      let years = Number(date.slice(0, 4)) - Number(stream.date.slice(0, 4));
      if (date < addMonths(stream.date, years * 12)) years--;
      const amount = roundMoney(
        stream.amount *
          Math.pow(1 + positive(stream.annualGrowth) / 100, Math.max(0, years)),
      );
      if (!Number.isSafeInteger(cents(amount)))
        throw Error(
          "O crescimento do aporte ultrapassa o limite seguro de cálculo. Reduza o valor, o reajuste ou o período.",
        );
      if (date >= from)
        out.push({
          date,
          amount,
          streamId: stream.id,
          primary: stream.id === "primary",
        });
      if (stream.frequency === "once") break;
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
export function manualPlannedStreams(
  doc: Document,
  goalId: string,
): SavingStream[] {
  return rows(doc, "contribution")
    .filter(
      (e) =>
        e.data.goalId === goalId &&
        e.data.status === "planned" &&
        !e.data.streamId,
    )
    .map((e) => ({
      id: `pending:${e.id}`,
      description: e.data.description,
      amount: positive(e.data.amount),
      date: e.data.date,
      frequency: "once",
      interval: 1,
    }));
}
export function planStreams(plan: SavingPlan): SavingStream[] {
  return [
    {
      id: "primary",
      description: "Aporte mensal",
      amount: positive(plan.monthly),
      frequency: "monthly",
      date: plan.firstDate,
      interval: 1,
    },
    ...(plan.extras ?? []),
  ];
}
export type FundedOccurrence = Occurrence & { exact: boolean };
export function fundedOccurrences(
  doc: Document,
  goalId: string,
  asOf = today(),
): FundedOccurrence[] {
  return contributions(doc, goalId, asOf)
    .filter((e) => e.data.streamId || !e.data.extra)
    .map((e) => ({
      streamId: e.data.streamId || "primary",
      date: e.data.scheduledDate || e.data.date,
      amount: e.data.amount,
      exact: !!e.data.scheduledDate,
    }));
}
function fundedAmount(event: Occurrence, funded: FundedOccurrence[]) {
  return funded
    .filter(
      (f) =>
        f.streamId === event.streamId &&
        (f.exact || event.streamId !== "primary"
          ? f.date === event.date
          : f.date.slice(0, 7) === event.date.slice(0, 7)),
    )
    .reduce((s, f) => s + f.amount, 0);
}
export function remainingOccurrences(
  plan: SavingPlan,
  from: string,
  to: string,
  funded: FundedOccurrence[],
) {
  return occurrences(planStreams(plan), from, to)
    .map((e) => ({
      ...e,
      amount: roundMoney(Math.max(0, e.amount - fundedAmount(e, funded))),
    }))
    .filter((e) => e.amount > 0);
}
export function validatePlan(plan: SavingPlan) {
  if (
    !["monthly", "months", "date"].includes(plan.mode) ||
    !validDate(plan.firstDate) ||
    !validDate(plan.effective)
  )
    throw Error("Informe datas válidas para o plano.");
  if (!Number.isFinite(plan.monthly) || plan.monthly < 0 || plan.monthly > 1e9)
    throw Error("Informe um aporte mensal válido.");
  if (!Number.isInteger(plan.months) || plan.months < 1 || plan.months > 600)
    throw Error("Use de 1 a 600 meses inteiros.");
  if (
    plan.mode !== "monthly" &&
    (!validDate(plan.deadline) || plan.deadline < plan.firstDate)
  )
    throw Error("O prazo deve incluir a data do primeiro aporte.");
  if ((plan.extras ?? []).length > 30)
    throw Error("Use até 30 aportes complementares por plano.");
  for (const s of plan.extras ?? []) {
    if (
      !Number.isFinite(s.amount) ||
      s.amount <= 0 ||
      s.amount > 1e9 ||
      !validDate(s.date) ||
      (s.end && (!validDate(s.end) || s.end < s.date)) ||
      !Number.isInteger(s.interval) ||
      s.interval < 1 ||
      s.interval > 600 ||
      (s.annualGrowth !== undefined &&
        (!Number.isFinite(s.annualGrowth) ||
          s.annualGrowth < 0 ||
          s.annualGrowth > 100)) ||
      !["monthly", "weekly", "once"].includes(s.frequency)
    )
      throw Error(
        "Confira valor, datas e recorrência dos aportes complementares.",
      );
  }
}
export function requiredMonthly(
  target: number,
  saved: number,
  plan: SavingPlan,
  asOf = today(),
  paidThisMonth = 0,
  funded?: FundedOccurrence[],
) {
  const remaining = roundMoney(Math.max(0, target - saved));
  if (!remaining) return 0;
  if (!validDate(plan.deadline) || plan.deadline < asOf) return null;
  const slots = occurrences(
    [{ ...planStreams(plan)[0], amount: 1 }],
    asOf,
    plan.deadline,
  );
  // A confirmed contribution pays the current month's monthly slot once. It is
  // already part of saved and must not also leave that same slot in the divisor.
  const paidSlot = paidThisMonth >= positive(plan.monthly) && paidThisMonth > 0;
  const eligible = slots.filter((o) =>
    funded
      ? fundedAmount(o, funded) < Math.max(0.01, plan.monthly)
      : !(paidSlot && o.date.slice(0, 7) === asOf.slice(0, 7)),
  );
  const extra = occurrences(plan.extras ?? [], asOf, plan.deadline).reduce(
    (s, o) =>
      s + Math.max(0, o.amount - (funded ? fundedAmount(o, funded) : 0)),
    0,
  );
  const needed = Math.max(0, cents(remaining) - cents(extra));
  if (!needed) return 0;
  if (!eligible.length) return null;
  // A partial payment is already in `saved`. Future occurrences subtract it
  // from this month's gross monthly amount, so solve for the same gross value
  // here. Water filling also handles a new amount below the partial payment.
  const paid = eligible.map(o => cents(funded ? fundedAmount(o, funded) : o.date.slice(0, 7) === asOf.slice(0, 7) ? paidThisMonth : 0)).sort((a, b) => a - b);
  let paidSum = 0;
  for (let i = 0; i < paid.length; i++) {
    paidSum += paid[i];
    const monthly = Math.ceil((needed + paidSum) / (i + 1));
    if (i === paid.length - 1 || monthly <= paid[i + 1]) return fromCents(monthly);
  }
  return null;
}
export type ProjectionRow = {
  month: string;
  initial: number;
  contributions: number;
  interest: number;
  balance: number;
  monthly: number;
};
export function projectSavings({
  target,
  initial,
  streams,
  start = today(),
  months = 600,
  monthlyRate = 0,
  until,
}: {
  target: number;
  initial: number;
  streams: SavingStream[];
  start?: string;
  months?: number;
  monthlyRate?: number;
  until?: string;
}) {
  if (
    !validDate(start) ||
    ![target, initial, monthlyRate, months].every(Number.isFinite) ||
    target < 0 ||
    initial < 0 ||
    monthlyRate < 0 ||
    monthlyRate > 100 ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 600
  )
    throw Error("Confira valores, prazo e taxa da simulação.");
  const horizonEnd = monthEnd(addMonths(start, months - 1).slice(0, 7));
  const end = until && until < horizonEnd ? until : horizonEnd;
  const events = occurrences(streams, start, end);
  let balance = roundMoney(initial),
    invested = 0,
    interest = 0,
    cursor = 0;
  let completion: string | null = balance >= target ? start : null;
  const data: ProjectionRow[] = [];
  for (let i = 0; i < months; i++) {
    const month = addMonths(start, i, 1).slice(0, 7);
    if (month + "-01" > end) break;
    // Hypothesis: monthly interest on opening balance, deposits at their dates;
    // new deposits earn from the next month. No income is assumed by default.
    const earned =
      month + "-01" >= start && monthEnd(month) <= end
        ? roundMoney((balance * monthlyRate) / 100)
        : 0;
    let monthly = 0;
    while (
      cursor < events.length &&
      events[cursor].date.slice(0, 7) === month
    ) {
      const e = events[cursor++];
      balance = roundMoney(balance + e.amount);
      monthly += e.amount;
      invested += e.amount;
      if (!completion && balance >= target) completion = e.date;
    }
    interest = roundMoney(interest + earned);
    balance = roundMoney(balance + earned);
    if (!Number.isFinite(balance) || balance > 1e18) break;
    if (!completion && balance >= target) completion = monthEnd(month);
    data.push({
      month,
      initial,
      contributions: roundMoney(invested),
      interest,
      balance,
      monthly: roundMoney(monthly),
    });
  }
  const duration = completion
    ? (Number(completion.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
      Number(completion.slice(5, 7)) -
      Number(start.slice(5, 7)) +
      (completion.slice(8) > start.slice(8) ? 1 : 0)
    : null;
  return {
    data,
    completion,
    totalContributed: roundMoney(invested),
    balance,
    monthsToTarget:
      initial >= target ? 0 : duration === null ? null : Math.max(1, duration),
  };
}
export function defaultPlan(goal: Entity): SavingPlan {
  return {
    mode: "date",
    monthly: 0,
    months: 12,
    firstDate: addMonths(today(), 1),
    deadline: goal.kind === "trip" ? goal.data.start : goal.data.deadline,
    effective: today(),
    extras: [],
  };
}
export function revisedPlan(goal: Entity, plan: SavingPlan) {
  const history: SavingPlan[] = [...(goal.data.planHistory ?? [])];
  if (goal.data.plan && goal.data.plan.effective < plan.effective)
    history.push(goal.data.plan);
  return { ...goal.data, plan, planHistory: history };
}
export function plannedOccurrences(goal: Entity, from: string, to: string) {
  const plans: SavingPlan[] = [
    ...(goal.data.planHistory ?? []),
    ...(goal.data.plan ? [goal.data.plan] : []),
  ].sort((a, b) => a.effective.localeCompare(b.effective));
  return plans.flatMap((p, i) =>
    occurrences(
      planStreams(p),
      p.effective > from ? p.effective : from,
      [
        to,
        p.deadline || to,
        plans[i + 1] ? nextDay(plans[i + 1].effective, -1) : to,
      ].sort()[0],
    ),
  );
}
export function contributionSeries(
  doc: Document,
  goals: Entity[],
  from: string,
  to: string,
) {
  if (!validDate(from) || !validDate(to) || from > to) return [];
  const months = Math.min(
    600,
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
      Number(to.slice(5, 7)) -
      Number(from.slice(5, 7)) +
      1,
  );
  const planned = goals.flatMap((g) => plannedOccurrences(g, from, to));
  for (const e of rows(doc, "contribution")) {
    const d = e.data,
      date = d.plannedDate || d.date;
    if (
      goals.some((g) => g.id === d.goalId) &&
      !d.streamId &&
      (d.status === "planned" || d.wasPlanned) &&
      date >= from &&
      date <= to
    )
      planned.push({
        date,
        amount: positive(d.plannedAmount ?? d.amount),
        streamId: `manual:${e.id}`,
      });
  }
  const actual = confirmedMovements(doc).filter(
    (e) =>
      goals.some((g) => g.id === e.data.goalId) &&
      e.data.date >= from &&
      e.data.date <= to,
  );
  let accumulatedPlanned = 0,
    accumulatedActual = 0;
  return Array.from({ length: months }, (_, i) => {
    const month = addMonths(from, i, 1).slice(0, 7);
    const plannedMonth = roundMoney(
      planned
        .filter((e) => e.date.startsWith(month))
        .reduce((s, e) => s + e.amount, 0),
    );
    const actualMonth = roundMoney(
      actual
        .filter((e) => e.data.date.startsWith(month))
        .reduce(
          (s, e) =>
            s +
            (e.data.direction === "withdrawal" ? -1 : 1) *
              positive(e.data.amount),
          0,
        ),
    );
    accumulatedPlanned = roundMoney(accumulatedPlanned + plannedMonth);
    accumulatedActual = roundMoney(accumulatedActual + actualMonth);
    return {
      month,
      planned: plannedMonth,
      actual: actualMonth,
      deposits: roundMoney(
        actual
          .filter(
            (e) =>
              e.data.date.startsWith(month) &&
              e.data.direction !== "withdrawal",
          )
          .reduce((s, e) => s + positive(e.data.amount), 0),
      ),
      withdrawn: roundMoney(
        actual
          .filter(
            (e) =>
              e.data.date.startsWith(month) &&
              e.data.direction === "withdrawal",
          )
          .reduce((s, e) => s + positive(e.data.amount), 0),
      ),
      accumulatedPlanned,
      accumulatedActual,
    };
  });
}

export function validateContributions(
  doc: Document,
  old: Document,
  capacity: number,
  sourceBalance: (id: string) => number,
) {
  const used = new Set<string>();
  for (const e of rows(doc, "contribution")) {
    const d = e.data;
    if (!objectives(doc).some((g) => g.id === d.goalId)) continue;
    if (
      !Number.isFinite(d.amount) ||
      typeof d.description !== "string" ||
      !d.description.trim() ||
      d.amount <= 0 ||
      d.amount > 1e9 ||
      !validDate(d.date) ||
      (d.scheduledDate && !validDate(d.scheduledDate)) ||
      !["confirmed", "planned"].includes(d.status)
    )
      throw Error("Confira os dados do aporte.");
    if (d.status === "confirmed" && d.date > today())
      throw Error(
        d.direction === "withdrawal"
          ? "Para confirmar a retirada, use uma data até hoje."
          : "Aportes futuros devem ficar como previstos.",
      );
    if (d.direction && !["deposit", "withdrawal"].includes(d.direction))
      throw Error("Tipo de movimentação inválido.");
    if (
      d.direction === "withdrawal" &&
      (d.status !== "confirmed" || d.transactionId)
    )
      throw Error(
        "A retirada apenas libera uma reserva confirmada, sem criar lançamento bancário.",
      );
    if (d.transactionId) {
      if (used.has(d.transactionId))
        throw Error(
          "Esta movimentação já está vinculada a outro aporte. Cada valor só pode ser reservado uma vez.",
        );
      used.add(d.transactionId);
      const tx = rows(doc, "transaction").find((t) => t.id === d.transactionId);
      if (
        !tx ||
        tx.data.type === "expense" ||
        tx.data.cardPayment ||
        d.amount > tx.data.amount ||
        (d.status === "confirmed" &&
          (tx.data.status !== "confirmed" || tx.data.date > today()))
      )
        throw Error(
          "Selecione uma entrada ou transferência confirmada com valor suficiente.",
        );
    }
  }
  for (const goal of objectives(doc)) {
    let balance = cents(positive(goal.data.saved));
    for (const e of confirmedMovements(doc, goal.id).sort(
      (a, b) =>
        a.data.date.localeCompare(b.data.date) ||
        Number(a.data.direction === "withdrawal") -
          Number(b.data.direction === "withdrawal"),
    )) {
      balance +=
        (e.data.direction === "withdrawal" ? -1 : 1) * cents(e.data.amount);
      if (balance < 0)
        throw Error(
          `A retirada supera o valor reservado em ${goal.data.name}. Confira também as datas e os aportes anteriores.`,
        );
    }
  }
  const after = totalReserved(doc),
    before = totalReserved(old);
  if (cents(after) > cents(before) && cents(after) > cents(capacity))
    throw Error(
      "O valor supera o dinheiro livre nas contas e investimentos, após as reservas e faturas. Revise o saldo ou as outras metas.",
    );
  for (const sourceId of new Set(
    contributions(doc)
      .map((e) => e.data.sourceId)
      .filter(Boolean),
  )) {
    const sum = sourceReserved(doc, sourceId);
    const previous = sourceReserved(old, sourceId);
    if (
      cents(sum) > cents(previous) &&
      cents(sum) > cents(sourceBalance(sourceId))
    )
      throw Error(
        "Esta origem não possui saldo suficiente para todas as reservas vinculadas.",
      );
  }
}
