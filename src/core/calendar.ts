import { accountBalance, invoice } from "./finance";
import {
  fundedOccurrences,
  manualPlannedStreams,
  monthEnd,
  nextDay,
  objectives,
  positive,
  remainingOccurrences,
  roundMoney,
  totalReserved,
  validDate,
} from "./contributions";
import { savingSummary } from "./saving-targets";
import {
  addMonths,
  cents,
  fromCents,
  rows,
  today,
  type Document,
} from "./model";

export type CalendarEvent = {
  id: string;
  date: string;
  originalDate: string;
  title: string;
  amount: number;
  cashImpact: number;
  allocation: number;
  type:
    "income" | "expense" | "transfer" | "invoice" | "contribution" | "opening";
  status: "confirmed" | "planned";
  overdue: boolean;
  transactionId?: string;
  goalId?: string;
  category?: string;
  credit?: boolean;
  billingDate?: string;
};
export type CalendarDay = {
  date: string;
  balance: number;
  unreserved: number;
  income: number;
  outgoing: number;
  allocation: number;
  estimated: boolean;
  events: CalendarEvent[];
};

/** The calendar projects existing dated records, never expands transaction recurrences. */
export function calendarEvents(
  doc: Document,
  from: string,
  to: string,
  asOf = today(),
  accountId = "",
): CalendarEvent[] {
  if (![from, to, asOf].every(validDate) || from > to) return [];
  const events: CalendarEvent[] = [];
  const accounts = rows(doc, "account");
  const accountIds = new Set(accounts.map((a) => a.id));
  const transactions = rows(doc, "transaction");
  const add = (event: CalendarEvent) => {
    if (event.date >= from && event.date <= to) events.push(event);
  };
  for (const tx of transactions) {
    const d = tx.data;
    if (
      !["confirmed", "planned"].includes(d.status) ||
      !validDate(d.date) ||
      !Number.isFinite(Number(d.amount)) ||
      Number(d.amount) <= 0 ||
      !["income", "expense", "transfer"].includes(d.type)
    )
      continue;
    if (
      accountId &&
      d.accountId !== accountId &&
      d.targetAccountId !== accountId
    )
      continue;
    if (
      !accountId &&
      !accountIds.has(d.accountId) &&
      !accountIds.has(d.targetAccountId)
    )
      continue;
    const overdue = d.status === "planned" && d.date < asOf;
    const date = overdue ? asOf : d.date;
    // Confirmed credit expenses are represented by the unpaid invoice below.
    // Historical purchase records remain visible without creating a bank debit.
    if (
      d.payment === "credit" &&
      d.type === "expense" &&
      d.status === "confirmed"
    ) {
      const purchaseDate = validDate(d.purchaseDate) ? d.purchaseDate : d.date;
      add({
        id: tx.id,
        date: purchaseDate,
        originalDate: purchaseDate,
        title: `${d.description}${d.installment ? ` · Parcela ${d.installment}` : ""}`,
        amount: roundMoney(positive(d.amount)),
        cashImpact: 0,
        allocation: 0,
        type: "expense",
        status: "confirmed",
        overdue: false,
        transactionId: tx.id,
        category: d.category,
        credit: true,
        billingDate: d.date,
      });
      continue;
    }
    const amount = roundMoney(Number(d.amount));
    let cashImpact = 0;
    const source = accounts.find((a) => a.id === d.accountId);
    const destination = accounts.find((a) => a.id === d.targetAccountId);
    const activeOnDate = (account: typeof source) =>
      !!account && (!account.data.date || account.data.date <= d.date);
    if (d.type === "transfer") {
      const debit =
        (accountId ? d.accountId === accountId : accountIds.has(d.accountId)) &&
        activeOnDate(source);
      const credit =
        (accountId
          ? d.targetAccountId === accountId
          : accountIds.has(d.targetAccountId)) && activeOnDate(destination);
      cashImpact = (credit ? amount : 0) - (debit ? amount : 0);
    } else if (activeOnDate(source))
      cashImpact = (d.type === "income" ? 1 : -1) * amount;
    add({
      id: tx.id,
      date,
      originalDate: d.date,
      title: d.description || "Movimentação",
      amount,
      cashImpact,
      allocation: 0,
      type: d.cardPayment ? "invoice" : d.type,
      status: d.status,
      overdue,
      transactionId: tx.id,
      category: d.category,
    });
  }
  for (const card of rows(doc, "card")) {
    const billingMonths = new Set(
      transactions
        .filter(
          (tx) =>
            tx.data.cardId === card.id &&
            tx.data.payment === "credit" &&
            tx.data.status === "confirmed" &&
            validDate(tx.data.date),
        )
        .map((tx) => String(tx.data.date).slice(0, 7)),
    );
    for (const month of billingMonths) {
      const bill = invoice(doc, card.id, month);
      const due = addMonths(
        `${month}-01`,
        0,
        Math.min(31, Math.max(1, Number(card.data.due) || 1)),
      );
      const date = due < asOf ? asOf : due;
      const explicit = fromCents(
        transactions
          .filter(
            (tx) =>
              tx.data.cardId === card.id &&
              tx.data.cardPayment &&
              tx.data.invoiceMonth === month &&
              tx.data.status === "planned" &&
              validDate(tx.data.date),
          )
          .reduce((sum, tx) => sum + cents(positive(tx.data.amount)), 0),
      );
      const outstanding = roundMoney(Math.max(0, bill.remaining - explicit));
      if (!outstanding) continue;
      const sourceId = card.data.accountId || bill.purchases[0]?.data.accountId;
      if (accountId && sourceId !== accountId) continue;
      add({
        id: `invoice:${card.id}:${month}`,
        date,
        originalDate: due,
        title: `Fatura ${card.data.name} · ${month.slice(5)}/${month.slice(0, 4)}`,
        amount: outstanding,
        cashImpact: -outstanding,
        allocation: 0,
        type: "invoice",
        status: "planned",
        overdue: due < asOf,
      });
    }
  }
  for (const account of accounts) {
    if (accountId && account.id !== accountId) continue;
    if (!validDate(account.data.date) || account.data.date <= asOf) continue;
    const amount = Number(account.data.balance);
    if (!Number.isFinite(amount)) continue;
    add({
      id: `opening:${account.id}`,
      date: account.data.date,
      originalDate: account.data.date,
      title: `Saldo de abertura · ${account.data.name}`,
      amount: Math.abs(amount),
      cashImpact: amount,
      allocation: 0,
      type: "opening",
      status: "confirmed",
      overdue: false,
    });
  }
  // A goal allocation changes unreserved money, never bank cash or income.
  // With an account filter its source cannot safely be inferred from a plan.
  if (!accountId)
    for (const goal of objectives(doc)) {
      if (goal.data.archived) continue;
      const summary = savingSummary(doc, goal, asOf);
      if (summary.remaining <= 0) continue;
      const manual = manualPlannedStreams(doc, goal.id);
      const plan = {
        ...summary.plan,
        extras: [
          ...(summary.plan.extras ?? []),
          ...manual.map((stream) => ({
            ...stream,
            date: stream.date < asOf ? asOf : stream.date,
          })),
        ],
      };
      const pending = remainingOccurrences(
        plan,
        asOf,
        to,
        fundedOccurrences(doc, goal.id, asOf),
      );
      let left = summary.remaining;
      for (const [index, occurrence] of pending.entries()) {
        const amount = roundMoney(Math.min(left, occurrence.amount));
        left = roundMoney(left - amount);
        if (!amount) continue;
        const originalDate =
          manual.find((stream) => stream.id === occurrence.streamId)?.date ??
          occurrence.date;
        add({
          id: `contribution:${goal.id}:${occurrence.streamId}:${occurrence.date}:${index}`,
          date: occurrence.date,
          originalDate,
          title: `Aporte · ${goal.data.name}`,
          amount,
          cashImpact: 0,
          allocation: amount,
          type: "contribution",
          status: "planned",
          overdue: originalDate < asOf,
          goalId: goal.id,
        });
      }
    }
  return events.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
}

export function calendarMonth(
  doc: Document,
  month: string,
  asOf = today(),
  accountId = "",
) {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    Number(month.slice(0, 4)) < 1900 ||
    Number(month.slice(0, 4)) > 2200 ||
    !validDate(asOf)
  )
    throw Error("Escolha um mês e uma data válidos.");
  const first = `${month}-01`,
    last = monthEnd(month);
  const projectionStart = asOf < first ? asOf : first;
  const events = calendarEvents(doc, projectionStart, last, asOf, accountId);
  const cashAt = (date: string) =>
    roundMoney(
      rows(doc, "account")
        .filter((a) => !accountId || a.id === accountId)
        .reduce((sum, a) => sum + accountBalance(doc, a.id, date), 0),
    );
  let balance = cashAt(asOf),
    allocation = accountId ? 0 : totalReserved(doc, asOf);
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events)
    byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);
  const days: CalendarDay[] = [];
  for (let date = projectionStart; date <= last; date = nextDay(date)) {
    const entries = byDate.get(date) ?? [];
    if (date < asOf) balance = cashAt(date);
    else {
      balance = roundMoney(
        balance +
          entries.reduce(
            (sum, event) =>
              sum +
              (event.status === "planned" || event.date > asOf
                ? event.cashImpact
                : 0),
            0,
          ),
      );
      allocation = roundMoney(
        allocation + entries.reduce((sum, event) => sum + event.allocation, 0),
      );
    }
    if (date < first) continue;
    const reserved = accountId
      ? 0
      : date < asOf
        ? totalReserved(doc, date)
        : allocation;
    days.push({
      date,
      balance,
      unreserved: roundMoney(balance - reserved),
      income: roundMoney(
        entries
          .filter((e) => e.type === "income")
          .reduce((s, e) => s + e.amount, 0),
      ),
      outgoing: roundMoney(
        entries
          .filter((e) => e.cashImpact < 0 && e.type !== "transfer")
          .reduce((s, e) => s - e.cashImpact, 0),
      ),
      allocation: roundMoney(entries.reduce((s, e) => s + e.allocation, 0)),
      estimated: date >= asOf,
      events: entries,
    });
  }
  const weeks: {
    from: string;
    to: string;
    balance: number;
    income: number;
    outgoing: number;
    allocation: number;
  }[] = [];
  for (const day of days) {
    const monday = (new Date(`${day.date}T12:00:00Z`).getUTCDay() + 6) % 7;
    if (!weeks.length || monday === 0)
      weeks.push({
        from: day.date,
        to: day.date,
        balance: day.balance,
        income: 0,
        outgoing: 0,
        allocation: 0,
      });
    const week = weeks[weeks.length - 1];
    week.to = day.date;
    week.balance = day.balance;
    week.income = roundMoney(week.income + day.income);
    week.outgoing = roundMoney(week.outgoing + day.outgoing);
    week.allocation = roundMoney(week.allocation + day.allocation);
  }
  return {
    days,
    weeks,
    events: events.filter((e) => e.date >= first),
    closing: days.at(-1)?.balance ?? cashAt(asOf),
    minimum: Math.min(
      ...(days.some((d) => d.estimated)
        ? days.filter((d) => d.estimated)
        : days
      ).map((d) => d.balance),
    ),
    income: roundMoney(days.reduce((s, d) => s + d.income, 0)),
    outgoing: roundMoney(days.reduce((s, d) => s + d.outgoing, 0)),
    allocation: roundMoney(days.reduce((s, d) => s + d.allocation, 0)),
    shortfalls: days.filter((d) => d.estimated && d.balance < 0),
  };
}

export function essentialExpenseAverage(
  doc: Document,
  selectedCategories: string[],
  months = 3,
  asOf = today(),
) {
  const count = Math.min(24, Math.max(1, Math.floor(months) || 3));
  const periods = Array.from({ length: count }, (_, i) =>
    addMonths(asOf, i - count, 1).slice(0, 7),
  );
  const expenses = rows(doc, "transaction").filter(
    (tx) =>
      tx.data.type === "expense" &&
      tx.data.status === "confirmed" &&
      selectedCategories.includes(tx.data.category) &&
      validDate(tx.data.date) &&
      Number.isFinite(Number(tx.data.amount)) &&
      Number(tx.data.amount) > 0 &&
      periods.includes(String(tx.data.date).slice(0, 7)),
  );
  const total = fromCents(
    expenses.reduce((sum, tx) => sum + cents(positive(tx.data.amount)), 0),
  );
  const observedPeriods = periods.filter((period) =>
    expenses.some((tx) => tx.data.date.startsWith(period)),
  );
  return {
    average: observedPeriods.length
      ? roundMoney(total / observedPeriods.length)
      : null,
    total,
    periods,
    observedPeriods,
    partial: observedPeriods.length < periods.length,
    count: expenses.length,
  };
}
