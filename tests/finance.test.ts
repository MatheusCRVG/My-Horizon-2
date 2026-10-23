import { describe, it, expect } from "vitest";
import {
  accountBalance,
  invoiceMonth,
  splitInstallments,
  scheduleTransaction,
  totals,
  invoice,
  cardOutstanding,
  payment,
  compound,
  purchaseComparison,
  vehicleCost,
  housingCost,
  tripCost,
  projectCash,
} from "../src/core/finance";
import { emptyDocument, addMonths, type Entity } from "../src/core/model";
const e = (id: string, kind: Entity["kind"], data: Entity["data"]): Entity => ({
  id,
  kind,
  data,
  vector: { a: 1 },
  updatedAt: "2026-01-01T00:00:00Z",
});
describe("ledger invariants", () => {
  it("transfers conserve aggregate cash and do not become income or expenses", () => {
    const d = emptyDocument();
    d.entities = [
      e("a", "account", { balance: 1000, date: "2020-01-01" }),
      e("b", "account", { balance: 100, date: "2020-01-01" }),
      e("t", "transaction", {
        date: "2026-01-01",
        amount: 150,
        type: "transfer",
        accountId: "a",
        targetAccountId: "b",
        status: "confirmed",
      }),
    ];
    expect(accountBalance(d, "a")).toBe(850);
    expect(accountBalance(d, "b")).toBe(250);
    expect(totals(d, "2026-01")).toMatchObject({
      income: 0,
      expense: 0,
      balance: 1100,
    });
  });
  it("planned, cancelled and future cash movements do not alter current balances", () => {
    const d = emptyDocument();
    d.entities = [
      e("a", "account", { balance: 500, date: "2020-01-01" }),
      ...["planned", "cancelled", "confirmed"].map((status, i) =>
        e("t" + i, "transaction", {
          date: i === 2 ? "2099-01-01" : "2026-01-01",
          amount: 100,
          type: "expense",
          status,
          accountId: "a",
        }),
      ),
    ];
    expect(accountBalance(d, "a", "2026-10-01")).toBe(500);
  });
  it("opening balances apply from their stated date", () => {
    const d = emptyDocument();
    d.entities = [
      e("a", "account", { balance: 500, date: "2026-02-01" }),
      e("t", "transaction", {
        date: "2026-01-01",
        amount: 100,
        type: "income",
        status: "confirmed",
        accountId: "a",
      }),
    ];
    expect(accountBalance(d, "a", "2026-01-01")).toBe(0);
    expect(accountBalance(d, "a", "2026-03-01")).toBe(500);
  });
  it("installments distribute rounding in cents without loss", () => {
    const parts = splitInstallments(100, 3);
    expect(parts).toEqual([33.34, 33.33, 33.33]);
    expect(parts.reduce((a, b) => a + Math.round(b * 100), 0)).toBe(10000);
    expect(() => splitInstallments(100, 0)).toThrow();
  });
  it("billing accounts for closing date, following-month due date and leap days", () => {
    expect(invoiceMonth("2026-10-02", 3, 10)).toBe("2026-10-10");
    expect(invoiceMonth("2026-10-04", 3, 10)).toBe("2026-11-10");
    expect(invoiceMonth("2026-12-25", 20, 5)).toBe("2027-02-05");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
  });
  it("card purchase and invoice payment count expenses once and liabilities correctly", () => {
    const d = emptyDocument();
    d.entities = [
      e("bank", "account", { balance: 1000, date: "2020-01-01" }),
      e("card", "card", { closing: 3, due: 10, limit: 1000 }),
    ];
    const scheduled = scheduleTransaction(
      {
        description: "Compra",
        amount: 300,
        date: "2026-10-01",
        type: "expense",
        payment: "credit",
        status: "confirmed",
        cardId: "card",
        accountId: "bank",
        installments: 3,
      },
      [d.entities[1]],
    );
    d.entities.push(...scheduled.map((s) => e(s.id, s.kind, s.data)));
    expect(totals(d, "2026-10").expense).toBe(100);
    expect(cardOutstanding(d, "card")).toBe(300);
    expect(accountBalance(d, "bank", "2026-12-01")).toBe(1000);
    d.entities.push(
      e("pay", "transaction", {
        type: "transfer",
        cardPayment: true,
        cardId: "card",
        accountId: "bank",
        invoiceMonth: "2026-10",
        date: "2026-10-10",
        amount: 100,
        status: "confirmed",
      }),
    );
    expect(totals(d, "2026-10").expense).toBe(100);
    expect(invoice(d, "card", "2026-10").remaining).toBe(0);
    expect(cardOutstanding(d, "card")).toBe(200);
    expect(accountBalance(d, "bank", "2026-12-01")).toBe(900);
  });
  it("goals allocate existing assets without adding net worth", () => {
    const d = emptyDocument();
    d.entities = [
      e("a", "account", { balance: 1000, date: "2020-01-01" }),
      e("g", "goal", { saved: 200, target: 500 }),
      e("asset", "asset", { type: "fixed", amount: 500 }),
      e("debt", "asset", { type: "debt", amount: 100 }),
    ];
    expect(totals(d, "2026-10")).toMatchObject({
      balance: 1000,
      available: 800,
      netWorth: 1400,
      invested: 500,
      debts: 100,
    });
  });
  it("recurring entries keep future events planned and preserve the day after February", () => {
    const s = scheduleTransaction(
      {
        description: "Aluguel",
        date: "2026-01-31",
        amount: 500,
        type: "expense",
        payment: "pix",
        status: "confirmed",
        occurrences: 3,
      },
      [],
    );
    expect(s.map((e) => e.data.date)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    expect(s.map((e) => e.data.status)).toEqual([
      "confirmed",
      "planned",
      "planned",
    ]);
  });
});
describe("planning mathematics", () => {
  it("short vehicle horizons retain the remaining loan principal", () => {
    const r = vehicleCost({
      price: 12000,
      down: 0,
      months: 12,
      rate: 0,
      ipva: 0,
      insurance: 0,
      fuel: 0,
      maintenance: 0,
      parking: 0,
      other: 0,
      depreciation: 0,
      horizon: 6,
    });
    expect(r.remainingDebt).toBe(6000);
    expect(r.total).toBe(6000);
    expect(r.economic).toBe(0);
  });
  it("forecasts overdue unpaid bills and expenses instead of dropping them", () => {
    const d = emptyDocument();
    d.entities = [
      e("a", "account", { balance: 1000, date: "2020-01-01" }),
      e("c", "card", { closing: 3, due: 10, limit: 1000 }),
      e("x", "transaction", {
        description: "Unpaid",
        type: "expense",
        amount: 50,
        accountId: "a",
        payment: "pix",
        status: "planned",
        date: "2020-01-01",
      }),
      e("y", "transaction", {
        description: "Old credit",
        type: "expense",
        amount: 100,
        accountId: "a",
        cardId: "c",
        payment: "credit",
        status: "confirmed",
        date: "2020-01-10",
        purchaseDate: "2020-01-01",
      }),
    ];
    expect(projectCash(d, 1)[0].balance).toBe(850);
  });
  it("zero-rate loan and compound interest do not divide by zero", () => {
    expect(payment(1200, 0, 12)).toBe(100);
    expect(compound(1000, 100, 0, 0, 12).at(-1)).toEqual({
      month: 12,
      nominal: 2200,
      real: 2200,
    });
  });
  it("uses effective monthly rate and deflates purchasing power", () => {
    const r = compound(1000, 0, 12, 6, 12).at(-1)!;
    expect(r.nominal).toBeCloseTo(1120, 6);
    expect(r.real).toBeCloseTo(1120 / 1.06, 6);
  });
  it("compares cash, financing, opportunity and saving without affecting a ledger", () => {
    const r = purchaseComparison({
      price: 1000,
      discount: 10,
      months: 10,
      rate: 0,
      saved: 0,
      monthlySaving: 100,
      returnRate: 0,
      freeBudget: 500,
    });
    expect(r).toMatchObject({
      cash: 900,
      installment: 100,
      total: 1000,
      interest: 0,
      months: 9,
      impact: 20,
      present: 1000,
    });
  });
  it("vehicle operating and financing costs are separated", () => {
    const r = vehicleCost({
      price: 12000,
      down: 0,
      months: 12,
      rate: 0,
      ipva: 1200,
      insurance: 1200,
      fuel: 100,
      maintenance: 100,
      parking: 0,
      other: 0,
      depreciation: 10,
      horizon: 12,
    });
    expect(r.monthly).toBe(1400);
    expect(r.total).toBe(16800);
    expect(r.economic).toBeCloseTo(6000);
  });
  it("moving reserve includes setup and months of living costs", () => {
    const r = housingCost({
      rent: 1000,
      condo: 100,
      energy: 100,
      water: 0,
      internet: 0,
      food: 0,
      transport: 0,
      unexpected: 0,
      furniture: 3000,
      deposit: 2000,
      moving: 1000,
      reserveMonths: 6,
      income: 2000,
      current: 500,
    });
    expect(r).toMatchObject({
      monthly: 1200,
      initial: 6000,
      reserve: 13200,
      left: 800,
      difference: 700,
    });
  });
  it("trip costs multiply only per-person items and use inclusive days and nights", () => {
    const r = tripCost({
      start: "2027-01-01",
      end: "2027-01-03",
      people: 2,
      flights: 500,
      hotel: 100,
      food: 10,
      transport: 10,
      tours: 20,
      insurance: 10,
      shopping: 0,
      other: 0,
      exchange: 2,
      margin: 10,
      saved: 0,
    });
    expect(r.days).toBe(3);
    expect(r.nights).toBe(2);
    expect(r.total).toBeCloseTo((1000 + 200 + 60 + 30 + 40 + 20) * 2 * 1.1);
  });
  it("empty projection has no invented income", () =>
    expect(
      projectCash(emptyDocument(), 60).every(
        (m) => m.income === 0 && m.expense === 0 && m.balance === 0,
      ),
    ).toBe(true));
});
