import {
  addMonths,
  cents,
  fromCents,
  monthsUntil,
  rows,
  today,
  type Document,
  type Entity,
} from "./model";
import { totalReserved } from "./contributions";
export function accountBalance(
  doc: Document,
  accountId: string,
  asOf = today(),
) {
  const account = rows(doc, "account").find((e) => e.id === accountId);
  if (!account || (account.data.date && account.data.date > asOf)) return 0;
  let balance = cents(Number(account?.data.balance ?? 0));
  for (const t of rows(doc, "transaction")) {
    const d = t.data;
    if (
      d.status !== "confirmed" ||
      d.date > asOf ||
      (account.data.date && d.date < account.data.date)
    )
      continue;
    const a = cents(d.amount);
    if (d.type === "transfer") {
      if (d.accountId === accountId) balance -= a;
      if (d.targetAccountId === accountId) balance += a;
    } else if (d.accountId === accountId && d.payment !== "credit")
      balance += d.type === "income" ? a : -a;
  }
  return fromCents(balance);
}
export function invoiceMonth(date: string, closing: number, due: number) {
  const day = Number(date.slice(8));
  const base = addMonths(date, day > closing ? 1 : 0, 1);
  return addMonths(base, due <= closing ? 1 : 0, due);
}
export function splitInstallments(amount: number, n: number) {
  if (!Number.isInteger(n) || n < 1 || n > 120)
    throw Error("Quantidade de parcelas inválida.");
  const total = cents(amount),
    base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) =>
    fromCents(base + (i < total % n ? 1 : 0)),
  );
}
export function scheduleTransaction(
  data: Record<string, any>,
  cards: Entity[],
) {
  const count = Math.max(
    1,
    Math.min(120, Number(data.installments || data.occurrences || 1)),
  );
  const credit = data.payment === "credit" && data.type === "expense";
  const card = cards.find((c) => c.id === data.cardId);
  if (credit && !card) throw Error("Selecione um cartão cadastrado.");
  const first = credit
    ? invoiceMonth(
        data.date,
        Number(card!.data.closing),
        Number(card!.data.due),
      )
    : data.date;
  const installments = credit
    ? splitInstallments(Number(data.amount), count)
    : Array(count).fill(Number(data.amount));
  const group = crypto.randomUUID();
  return installments.map((amount, i) => ({
    id: `${group}:${i}`,
    kind: "transaction" as const,
    data: {
      ...data,
      amount,
      date: addMonths(first, i),
      purchaseDate: credit ? data.date : undefined,
      installments: undefined,
      occurrences: undefined,
      frequency: !credit && count > 1 ? "monthly" : undefined,
      group,
      installment: credit ? `${i + 1}/${count}` : undefined,
      status: credit ? data.status : i === 0 ? data.status : "planned",
    },
  }));
}
export function invoice(doc: Document, cardId: string, month: string) {
  const purchases = rows(doc, "transaction").filter(
    (t) =>
      t.data.cardId === cardId &&
      t.data.payment === "credit" &&
      t.data.type === "expense" &&
      t.data.status === "confirmed" &&
      t.data.date.startsWith(month),
  );
  const total = fromCents(
    purchases.reduce((s, t) => s + cents(t.data.amount), 0),
  );
  const paid = rows(doc, "transaction")
    .filter(
      (t) =>
        t.data.cardId === cardId &&
        t.data.cardPayment &&
        t.data.invoiceMonth === month &&
        t.data.status === "confirmed",
    )
    .reduce((s, t) => s + cents(t.data.amount), 0);
  return {
    purchases,
    total,
    paid: fromCents(paid),
    remaining: Math.max(0, fromCents(cents(total) - paid)),
  };
}
export function cardOutstanding(doc: Document, cardId: string) {
  const months = new Set(
    rows(doc, "transaction")
      .filter((t) => t.data.cardId === cardId && t.data.payment === "credit")
      .map((t) => t.data.date.slice(0, 7)),
  );
  return [...months].reduce((s, m) => s + invoice(doc, cardId, m).remaining, 0);
}
export function totals(
  doc: Document,
  month: string,
  accountId = "",
  category = "",
  asOf = today(),
) {
  doc = financialAsOf(doc, asOf);
  const selected = rows(doc, "transaction").filter(
    (t) =>
      t.data.date.startsWith(month) &&
      (!accountId || t.data.accountId === accountId) &&
      (!category || t.data.category === category) &&
      t.data.status === "confirmed",
  );
  const income = fromCents(
    selected
      .filter((t) => t.data.type === "income")
      .reduce((s, t) => s + cents(t.data.amount), 0),
  );
  const expense = fromCents(
    selected
      .filter((t) => t.data.type === "expense")
      .reduce((s, t) => s + cents(t.data.amount), 0),
  );
  const accounts = rows(doc, "account").filter(
    (a) => !accountId || a.id === accountId,
  );
  const balance = accounts.reduce(
    (s, a) => s + accountBalance(doc, a.id, asOf),
    0,
  );
  const assets = rows(doc, "asset");
  const invested = assets
    .filter((a) => ["fixed", "variable", "other"].includes(a.data.type))
    .reduce((s, a) => s + Number(a.data.amount), 0);
  const debts = assets
    .filter((a) => a.data.type === "debt")
    .reduce((s, a) => s + Number(a.data.amount), 0);
  const goods = assets
    .filter((a) => a.data.type === "goods")
    .reduce((s, a) => s + Number(a.data.amount), 0);
  const committed = rows(doc, "card").reduce(
    (s, c) => s + cardOutstanding(doc, c.id),
    0,
  );
  const allocated = totalReserved(doc, asOf);
  const byCategory = Object.entries(
    selected
      .filter((t) => t.data.type === "expense")
      .reduce(
        (o, t) => {
          o[t.data.category] =
            (o[t.data.category] || 0) + Number(t.data.amount);
          return o;
        },
        {} as Record<string, number>,
      ),
  ).map(([name, value]) => ({ name, value }));
  return {
    income,
    expense,
    saving: income - expense,
    savingRate: income ? ((income - expense) / income) * 100 : 0,
    balance,
    available: balance - allocated - committed,
    invested,
    debts,
    committed,
    netWorth: balance + invested + goods - debts - committed,
    byCategory,
  };
}
export function projectCash(
  doc: Document,
  months = 12,
  accountId = "",
  category = "",
) {
  let balance = rows(doc, "account")
    .filter((a) => !accountId || a.id === accountId)
    .reduce((s, a) => s + accountBalance(doc, a.id), 0);
  const now = today();
  return Array.from({ length: months }, (_, i) => {
    const month = addMonths(now, i, 1).slice(0, 7);
    let incoming = 0,
      outgoing = 0;
    for (const t of rows(doc, "transaction")) {
      const d = t.data;
      if (d.status === "cancelled" || (d.date <= now && d.status !== "planned"))
        continue;
      const overdue = d.status === "planned" && d.date <= now;
      if (overdue ? i !== 0 : !d.date.startsWith(month)) continue;
      if (category && d.category !== category) continue;
      if (d.type === "transfer") {
        if (accountId) {
          if (d.accountId === accountId) outgoing += Number(d.amount);
          if (d.targetAccountId === accountId) incoming += Number(d.amount);
        } else if (d.cardPayment) outgoing += Number(d.amount);
        continue;
      }
      if (accountId && d.accountId !== accountId) continue;
      if (d.payment === "credit" && d.status === "confirmed") continue;
      if (d.type === "income") incoming += Number(d.amount);
      else outgoing += Number(d.amount);
    }
    for (const card of rows(doc, "card")) {
      const billingMonths = new Set(
        rows(doc, "transaction")
          .filter(
            (t) =>
              t.data.cardId === card.id &&
              t.data.payment === "credit" &&
              t.data.status === "confirmed",
          )
          .map((t) => t.data.date.slice(0, 7)),
      );
      for (const billingMonth of billingMonths) {
        if (i === 0 ? billingMonth > month : billingMonth !== month) continue;
        const bill = invoice(doc, card.id, billingMonth);
        const filtered = bill.purchases
          .filter(
            (t) =>
              (!accountId || t.data.accountId === accountId) &&
              (!category || t.data.category === category),
          )
          .reduce((s, t) => s + Number(t.data.amount), 0);
        outgoing += bill.total ? bill.remaining * (filtered / bill.total) : 0;
      }
    }
    balance += incoming - outgoing;
    return {
      month,
      label: new Date(month + "-01T12:00:00").toLocaleDateString("pt-BR", {
        month: "short",
        year: "2-digit",
      }),
      income: incoming,
      expense: outgoing,
      balance,
    };
  });
}
export function historicalWorth(doc: Document, months = 6) {
  const now = today();
  return Array.from({ length: months }, (_, i) => {
    const m = addMonths(now, i - months + 1, 1);
    const end = addMonths(m, 1, 1);
    const date = new Date(new Date(end + "T12:00:00").getTime() - 86400000)
      .toISOString()
      .slice(0, 10);
    const balance = rows(doc, "account").reduce(
      (s, a) => s + accountBalance(doc, a.id, date < now ? date : now),
      0,
    );
    const assets = rows(doc, "asset")
      .filter((a) => a.data.date <= date)
      .reduce(
        (s, a) => s + (a.data.type === "debt" ? -1 : 1) * Number(a.data.amount),
        0,
      );
    const liability =
      rows(doc, "transaction")
        .filter(
          (t) =>
            t.data.payment === "credit" &&
            t.data.status === "confirmed" &&
            (t.data.purchaseDate ?? t.data.date) <= date,
        )
        .reduce((s, t) => s + Number(t.data.amount), 0) -
      rows(doc, "transaction")
        .filter(
          (t) =>
            t.data.cardPayment &&
            t.data.status === "confirmed" &&
            t.data.date <= date,
        )
        .reduce((s, t) => s + Number(t.data.amount), 0);
    return {
      label: new Date(m + "T12:00:00").toLocaleDateString("pt-BR", {
        month: "short",
      }),
      value: balance + assets - Math.max(0, liability),
    };
  });
}
export function payment(principal: number, monthlyRate: number, n: number) {
  if (n <= 0) return 0;
  if (monthlyRate === 0) return principal / n;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
}
export function compound(
  initial: number,
  contribution: number,
  annual: number,
  inflation: number,
  months: number,
) {
  const r = Math.pow(1 + annual / 100, 1 / 12) - 1;
  let nominal = initial;
  return Array.from({ length: months + 1 }, (_, i) => {
    if (i) nominal = nominal * (1 + r) + contribution;
    return {
      month: i,
      nominal,
      real: nominal / Math.pow(1 + inflation / 100, i / 12),
    };
  });
}
export function tripCost(d: Record<string, any>, factor = 1) {
  const days = Math.max(
    1,
    Math.round(
      (new Date(d.end + "T12:00:00").getTime() -
        new Date(d.start + "T12:00:00").getTime()) /
        86400000,
    ) + 1,
  );
  const nights = days - 1;
  const people = Number(d.people);
  const base =
    Number(d.flights) * people +
    Number(d.hotel) * nights +
    Number(d.food) * days * people +
    Number(d.transport) * days +
    Number(d.tours) * people +
    Number(d.insurance) * people +
    Number(d.shopping) +
    Number(d.other);
  const total =
    base * Number(d.exchange) * (1 + Number(d.margin) / 100) * factor;
  const missing = Math.max(0, total - Number(d.saved));
  return {
    days,
    nights,
    total,
    missing,
    monthly: missing / monthsUntil(d.start),
  };
}
export function purchaseComparison(d: Record<string, any>) {
  const price = Number(d.price),
    n = Number(d.months),
    rate = Number(d.rate) / 100,
    discount = Number(d.discount) / 100;
  const cash = price * (1 - discount),
    installment = payment(price, rate, n),
    total = installment * n,
    opportunity = cash * (Math.pow(1 + Number(d.returnRate) / 100, n) - 1);
  const saving = Number(d.monthlySaving);
  const needed = Math.max(0, cash - Number(d.saved));
  let months = 0;
  const savingsRate = Number(d.returnRate) / 100;
  if (saving > 0 || (Number(d.saved) > 0 && savingsRate > 0)) {
    let accumulated = Number(d.saved);
    while (accumulated < cash && months < 1200) {
      accumulated = accumulated * (1 + savingsRate) + saving;
      months++;
    }
    if (months === 1200 && accumulated < cash) months = Infinity;
  } else months = needed > 0 ? Infinity : 0;
  const present = Array.from(
    { length: n },
    (_, i) => installment / Math.pow(1 + Number(d.returnRate) / 100, i + 1),
  ).reduce((s, x) => s + x, 0);
  return {
    cash,
    installment,
    total,
    interest: total - price,
    opportunity,
    present,
    months,
    impact:
      Number(d.freeBudget) > 0 ? (installment / Number(d.freeBudget)) * 100 : 0,
    goalDelay: saving > 0 ? Math.ceil(total / saving) : Infinity,
  };
}
export function vehicleCost(d: Record<string, any>) {
  const financed = Math.max(0, Number(d.price) - Number(d.down));
  const installment = payment(financed, Number(d.rate) / 100, Number(d.months));
  const running =
    Number(d.ipva) / 12 +
    Number(d.insurance) / 12 +
    Number(d.fuel) +
    Number(d.maintenance) +
    Number(d.parking) +
    Number(d.other);
  const horizon = Number(d.horizon);
  const depreciation =
    Number(d.price) *
    (1 - Math.pow(1 - Number(d.depreciation) / 100, horizon / 12));
  const paidMonths = Math.min(horizon, Number(d.months));
  const rate = Number(d.rate) / 100;
  const remainingDebt = Math.max(
    0,
    rate === 0
      ? financed - installment * paidMonths
      : financed * Math.pow(1 + rate, paidMonths) -
          (installment * (Math.pow(1 + rate, paidMonths) - 1)) / rate,
  );
  return {
    installment,
    running,
    monthly: installment + running,
    annual: (installment + running) * 12,
    total:
      Number(d.down) +
      installment * Math.min(horizon, Number(d.months)) +
      running * horizon,
    depreciation,
    remainingDebt,
    economic:
      installment * Math.min(horizon, Number(d.months)) -
      financed +
      remainingDebt +
      running * horizon +
      depreciation,
  };
}
export function housingCost(d: Record<string, any>) {
  const monthly = [
    "rent",
    "condo",
    "energy",
    "water",
    "internet",
    "food",
    "transport",
    "unexpected",
  ].reduce((s, k) => s + Number(d[k] || 0), 0);
  const initial = ["furniture", "deposit", "moving"].reduce(
    (s, k) => s + Number(d[k] || 0),
    0,
  );
  return {
    monthly,
    initial,
    reserve: initial + monthly * Number(d.reserveMonths),
    minimum: monthly / 0.7,
    left: Number(d.income) - monthly,
    difference: monthly - Number(d.current),
  };
}

export function financialAsOf(doc: Document, asOf: string): Document {
  return {
    ...doc,
    entities: doc.entities.filter((e) => {
      if (
        (e.kind === "account" || e.kind === "asset") &&
        e.data.date &&
        e.data.date > asOf
      )
        return false;
      if (e.kind === "transaction" && e.data.status === "confirmed") {
        // Cartões já comprados continuam como obrigações, mesmo com fatura futura.
        const effective =
          e.data.payment === "credit" && e.data.purchaseDate
            ? e.data.purchaseDate
            : e.data.date;
        return effective <= asOf;
      }
      return !(
        e.kind === "contribution" &&
        e.data.status === "confirmed" &&
        e.data.date > asOf
      );
    }),
  };
}
