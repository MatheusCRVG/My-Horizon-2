import { describe, expect, it } from "vitest";
import {
  calendarEvents,
  calendarMonth,
  essentialExpenseAverage,
} from "../src/core/calendar";
import { emptyDocument, type Entity } from "../src/core/model";

const asOf = "2026-10-22";
const entity = (
  id: string,
  kind: Entity["kind"],
  data: Entity["data"],
): Entity => ({
  id,
  kind,
  data,
  vector: { test: 1 },
  updatedAt: `${asOf}T12:00:00Z`,
});
const bank = (id = "a", balance = 1000) =>
  entity(id, "account", { name: id, balance, date: "2026-01-01" });
const tx = (id: string, data: Record<string, unknown>) =>
  entity(id, "transaction", {
    description: id,
    accountId: "a",
    type: "expense",
    status: "planned",
    amount: 100,
    date: "2026-10-25",
    ...data,
  });
const doc = (...entities: Entity[]) => ({ ...emptyDocument(), entities });

describe("financial calendar", () => {
  it("uses confirmed balances and only dated future or planned records, without expanding recurrences", () => {
    const d = doc(
      bank(),
      tx("past", { date: "2026-10-10", status: "confirmed", amount: 200 }),
      tx("salary", {
        date: "2026-10-24",
        type: "income",
        amount: 1000,
        frequency: "monthly",
      }),
      tx("bill", { date: "2026-10-25", amount: 300 }),
      tx("cancelled", { status: "cancelled", amount: 999 }),
      tx("future-confirmed", {
        date: "2026-10-28",
        status: "confirmed",
        amount: 50,
      }),
    );
    const result = calendarMonth(d, "2026-10", asOf);
    expect(result.days.find((day) => day.date === asOf)?.balance).toBe(800);
    expect(result.closing).toBe(1450);
    expect(result.days.find((day) => day.date === "2026-10-25")?.balance).toBe(
      1500,
    );
    expect(calendarMonth(d, "2026-11", asOf).income).toBe(0);
    expect(calendarMonth(d, "2026-11", asOf).closing).toBe(1450);
    expect(result.events.some((event) => event.id === "cancelled")).toBe(false);
  });
  it("keeps own transfers cash-neutral in the aggregate and changes each filtered account once", () => {
    const d = doc(
      bank(),
      bank("b", 500),
      tx("own", { type: "transfer", targetAccountId: "b", amount: 300 }),
    );
    expect(calendarMonth(d, "2026-10", asOf).closing).toBe(1500);
    expect(calendarMonth(d, "2026-10", asOf).income).toBe(0);
    expect(calendarMonth(d, "2026-10", asOf).outgoing).toBe(0);
    expect(calendarMonth(d, "2026-10", asOf, "a").closing).toBe(700);
    expect(calendarMonth(d, "2026-10", asOf, "b").closing).toBe(800);
  });
  it("includes unpaid invoices and planned explicit payments only once, including partial payments", () => {
    const card = entity("c", "card", {
      name: "Cartão",
      due: 28,
      closing: 15,
      accountId: "a",
    });
    const d = doc(
      bank(),
      card,
      tx("purchase", {
        status: "confirmed",
        payment: "credit",
        cardId: "c",
        amount: 400,
        date: "2026-10-28",
      }),
      tx("paid", {
        type: "transfer",
        cardPayment: true,
        cardId: "c",
        invoiceMonth: "2026-10",
        amount: 100,
        status: "confirmed",
        date: "2026-10-20",
      }),
      tx("scheduled", {
        type: "transfer",
        cardPayment: true,
        cardId: "c",
        invoiceMonth: "2026-10",
        amount: 150,
        date: "2026-10-27",
      }),
    );
    const result = calendarMonth(d, "2026-10", asOf);
    expect(result.events.find((e) => e.id.startsWith("invoice:"))?.amount).toBe(
      150,
    );
    expect(result.closing).toBe(600);
    expect(result.days.find((day) => day.date === "2026-10-27")?.balance).toBe(
      750,
    );
    expect(result.outgoing).toBe(400);
  });
  it("never debits an invoice twice when its full payment is already confirmed with a future date", () => {
    const d = doc(
      bank(),
      entity("c", "card", { name: "Card", due: 28 }),
      tx("purchase", {
        payment: "credit",
        cardId: "c",
        status: "confirmed",
        date: "2026-10-28",
        amount: 400,
      }),
      tx("payment", {
        type: "transfer",
        cardPayment: true,
        cardId: "c",
        invoiceMonth: "2026-10",
        amount: 400,
        status: "confirmed",
        date: "2026-10-28",
      }),
    );
    const result = calendarMonth(d, "2026-10", asOf);
    expect(
      result.events.filter((e) => e.id.startsWith("invoice:")),
    ).toHaveLength(0);
    expect(result.closing).toBe(600);
  });
  it("moves an overdue commitment to today once and reports insufficient cash without changing records", () => {
    const d = doc(
      bank("a", 50),
      tx("late", { amount: 100, date: "2026-09-03", frequency: "monthly" }),
    );
    const before = JSON.stringify(d);
    const result = calendarMonth(d, "2026-10", asOf);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      date: asOf,
      originalDate: "2026-09-03",
      overdue: true,
    });
    expect(result.shortfalls[0].date).toBe(asOf);
    expect(result.closing).toBe(-50);
    expect(calendarMonth(d, "2026-11", asOf).events).toHaveLength(0);
    expect(calendarMonth(d, "2026-11", asOf).closing).toBe(-50);
    expect(JSON.stringify(d)).toBe(before);
  });
  it("shows goal plans as allocations without reducing bank balances or repeating confirmed deposits", () => {
    const goal = entity("g", "goal", {
      name: "Reserva",
      target: 1000,
      saved: 0,
      plan: {
        mode: "monthly",
        monthly: 200,
        months: 5,
        firstDate: "2026-10-25",
        deadline: "2027-02-25",
        effective: asOf,
        extras: [],
      },
    });
    const d = doc(bank(), goal);
    const result = calendarMonth(d, "2026-10", asOf);
    expect(result.allocation).toBe(200);
    expect(result.closing).toBe(1000);
    expect(result.days.at(-1)?.unreserved).toBe(800);
    d.entities.push(
      entity("deposit", "contribution", {
        goalId: "g",
        amount: 200,
        status: "confirmed",
        date: asOf,
        streamId: "primary",
        scheduledDate: "2026-10-25",
      }),
    );
    const confirmed = calendarMonth(d, "2026-10", asOf);
    expect(confirmed.allocation).toBe(0);
    expect(confirmed.closing).toBe(1000);
    expect(confirmed.days.at(-1)?.unreserved).toBe(800);
    expect(
      calendarMonth(d, "2026-10", asOf, "a").events.some(
        (event) => event.type === "contribution",
      ),
    ).toBe(false);
  });
  it("caps future allocations at the target and excludes archived goal plans", () => {
    const plan = {
      mode: "monthly",
      monthly: 700,
      months: 5,
      firstDate: "2026-10-25",
      deadline: "2027-02-25",
      effective: asOf,
      extras: [],
    };
    const d = doc(
      bank(),
      entity("g", "goal", { name: "One", saved: 100, target: 1000, plan }),
      entity("archive", "goal", {
        name: "Old",
        saved: 50,
        target: 1000,
        plan,
        archived: true,
      }),
    );
    const events = calendarEvents(d, asOf, "2026-12-31", asOf).filter(
      (event) => event.type === "contribution",
    );
    expect(events.map((event) => event.amount)).toEqual([700, 200]);
    expect(events.every((event) => event.goalId === "g")).toBe(true);
    expect(calendarMonth(d, "2026-10", asOf).days.at(-1)?.unreserved).toBe(150);
  });
  it("carries a manually planned overdue allocation once without repeating old recurring installments", () => {
    const d = doc(
      bank(),
      entity("g", "goal", {
        name: "Reserve",
        target: 1000,
        saved: 0,
        plan: {
          mode: "monthly",
          monthly: 100,
          months: 10,
          firstDate: "2026-08-05",
          deadline: "2027-05-05",
          effective: "2026-08-01",
          extras: [],
        },
      }),
      entity("late-allocation", "contribution", {
        goalId: "g",
        amount: 75,
        status: "planned",
        date: "2026-09-01",
        description: "One pending deposit",
      }),
    );
    const result = calendarMonth(d, "2026-10", asOf);
    expect(result.allocation).toBe(75);
    expect(
      result.events.find((event) => event.type === "contribution"),
    ).toMatchObject({ date: asOf, originalDate: "2026-09-01", overdue: true });
    expect(calendarMonth(d, "2026-11", asOf).allocation).toBe(100);
  });
  it("uses civil dates, leap years, clamped invoice due dates and historical daily balances", () => {
    const d = doc(
      bank(),
      tx("historical", {
        date: "2026-02-10",
        amount: 100,
        status: "confirmed",
      }),
    );
    const historical = calendarMonth(d, "2026-02", asOf);
    expect(historical.days).toHaveLength(28);
    expect(historical.days[8].balance).toBe(1000);
    expect(historical.days[9].balance).toBe(900);
    expect(calendarMonth(d, "2028-02", asOf).days).toHaveLength(29);
    const withCard = doc(
      bank(),
      entity("c", "card", { name: "Card", due: 31 }),
      tx("february", {
        date: "2028-02-15",
        amount: 200,
        status: "confirmed",
        payment: "credit",
        cardId: "c",
      }),
    );
    expect(
      calendarMonth(withCard, "2028-02", asOf).events.find(
        (event) => event.type === "invoice",
      )?.date,
    ).toBe("2028-02-29");
    expect(() => calendarMonth(d, "2026-13", asOf)).toThrow();
    expect(calendarEvents(d, "2026-02-30", "2026-03-01", asOf)).toEqual([]);
  });
  it("includes a future opening balance without counting it as income", () => {
    const d = doc(
      entity("new", "account", {
        name: "New",
        date: "2026-11-10",
        balance: 1000,
      }),
    );
    const result = calendarMonth(d, "2026-11", asOf);
    expect(result.days[8].balance).toBe(0);
    expect(result.days[9].balance).toBe(1000);
    expect(result.income).toBe(0);
  });
  it("calculates the explicit average of essential confirmed expenses over full months", () => {
    const d = doc(
      bank(),
      tx("july", {
        category: "Moradia",
        date: "2026-07-05",
        amount: 900,
        status: "confirmed",
      }),
      tx("september", {
        category: "Moradia",
        date: "2026-09-05",
        amount: 1200,
        status: "confirmed",
      }),
      tx("this-month", {
        category: "Moradia",
        date: "2026-10-05",
        amount: 999,
        status: "confirmed",
      }),
      tx("not-essential", {
        category: "Lazer",
        date: "2026-09-05",
        amount: 999,
        status: "confirmed",
      }),
      tx("planned", { category: "Moradia", date: "2026-09-05", amount: 999 }),
      tx("transfer", {
        category: "Moradia",
        date: "2026-09-05",
        type: "transfer",
        amount: 999,
        status: "confirmed",
      }),
    );
    expect(essentialExpenseAverage(d, ["Moradia"], 3, asOf)).toEqual({
      average: 1050,
      total: 2100,
      periods: ["2026-07", "2026-08", "2026-09"],
      observedPeriods: ["2026-07", "2026-09"],
      partial: true,
      count: 2,
    });
  });
  it("reports one observed month out of three and never interprets missing history as zero spending", () => {
    const d = doc(
      bank(),
      tx("one-month", {
        category: "Moradia",
        date: "2026-09-10",
        amount: 3000,
        status: "confirmed",
      }),
    );
    const average = essentialExpenseAverage(d, ["Moradia"], 3, asOf);
    expect(average.average).toBe(3000);
    expect(average.observedPeriods).toEqual(["2026-09"]);
    expect(average.partial).toBe(true);
    expect(average.average! * 6).toBe(18000);
    const unknown = essentialExpenseAverage(doc(bank()), ["Moradia"], 3, asOf);
    expect(unknown.average).toBeNull();
    expect(unknown.observedPeriods).toEqual([]);
    expect(unknown.partial).toBe(true);
  });
  it("places confirmed credit purchases on the purchase date, with no bank debit until the invoice", () => {
    const d = doc(
      bank(),
      entity("c", "card", { name: "Card", due: 10 }),
      tx("purchase", {
        type: "expense",
        payment: "credit",
        cardId: "c",
        amount: 300,
        purchaseDate: "2026-10-05",
        date: "2026-11-10",
        status: "confirmed",
      }),
    );
    const october = calendarMonth(d, "2026-10", asOf);
    expect(
      october.events.find((event) => event.id === "purchase"),
    ).toMatchObject({
      date: "2026-10-05",
      credit: true,
      billingDate: "2026-11-10",
      cashImpact: 0,
    });
    expect(october.outgoing).toBe(0);
    expect(october.closing).toBe(1000);
    const november = calendarMonth(d, "2026-11", asOf);
    expect(
      november.events.filter((event) => event.type === "invoice"),
    ).toHaveLength(1);
    expect(november.outgoing).toBe(300);
    expect(november.closing).toBe(700);
  });
  it("deduplicates invoice payments using each record rounded to cents", () => {
    const d = doc(
      bank(),
      entity("c", "card", { name: "Card", due: 28 }),
      tx("purchase", {
        payment: "credit",
        cardId: "c",
        amount: 1,
        status: "confirmed",
        date: "2026-10-28",
      }),
      tx("payment-1", {
        type: "transfer",
        cardPayment: true,
        cardId: "c",
        invoiceMonth: "2026-10",
        amount: 0.005,
        date: "2026-10-27",
      }),
      tx("payment-2", {
        type: "transfer",
        cardPayment: true,
        cardId: "c",
        invoiceMonth: "2026-10",
        amount: 0.005,
        date: "2026-10-27",
      }),
    );
    const result = calendarMonth(d, "2026-10", asOf);
    expect(
      result.events.find((event) => event.id.startsWith("invoice:"))?.amount,
    ).toBe(0.98);
    expect(result.outgoing).toBe(1);
    expect(result.closing).toBe(999);
  });
});
