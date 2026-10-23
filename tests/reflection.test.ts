import { describe, expect, it } from "vitest";
import {
  annualReflection,
  provenMilestones,
  reflectionRecords,
  validateReflectionRecord,
  wealthObservations,
} from "../src/core/reflection";
import { emptyDocument, type Entity } from "../src/core/model";
const e = (id: string, kind: Entity["kind"], data: Entity["data"]): Entity => ({
  id,
  kind,
  data,
  vector: { t: 1 },
  updatedAt: "2026-10-22T12:00:00Z",
});
const doc = (...entities: Entity[]) => ({ ...emptyDocument(), entities });
const goal = (id = "g", target = 10000, saved = 0) =>
  e(id, "goal", { name: id, target, saved });
const movement = (
  id: string,
  amount: number,
  date: string,
  direction = "deposit",
  goalId = "g",
) =>
  e(id, "contribution", {
    goalId,
    amount,
    date,
    direction,
    status: "confirmed",
  });
const tx = (
  id: string,
  type: string,
  amount: number,
  date: string,
  status = "confirmed",
) => e(id, "transaction", { description: id, type, amount, date, status });

describe("annual financial reflection", () => {
  it("respects annual boundaries, status and today, excluding own transfers and future records", () => {
    const d = doc(
      tx("before", "income", 999, "2025-12-31"),
      tx("income", "income", 1000, "2026-01-01"),
      tx("expense", "expense", 300, "2026-10-22"),
      tx("transfer", "transfer", 5000, "2026-08-01"),
      tx("future", "income", 888, "2026-11-01"),
      tx("planned", "income", 777, "2026-01-01", "planned"),
      tx("cancelled", "expense", 777, "2026-01-01", "cancelled"),
      tx("next-year", "income", 999, "2027-01-01"),
    );
    const result = annualReflection(d, 2026, "2026-10-22");
    expect(result.income).toBe(1000);
    expect(result.expense).toBe(300);
    expect(result.saving).toBe(700);
    expect(annualReflection(d, 2025, "2026-10-22").income).toBe(999);
    expect(annualReflection(d, 2027, "2026-10-22").income).toBe(0);
  });
  it("reports gross deposits and withdrawals separately, never counts initial or planned reserves as annual contributions", () => {
    const d = doc(
      goal("g", 10000, 5000),
      movement("old", 2000, "2025-12-31"),
      movement("new", 1000, "2026-01-01"),
      movement("withdrawal", 300, "2026-08-01", "withdrawal"),
      e("planned", "contribution", {
        goalId: "g",
        date: "2026-07-01",
        amount: 999,
        status: "planned",
      }),
    );
    const result = annualReflection(d, 2026, "2026-10-22");
    expect(result.deposits).toBe(1000);
    expect(result.withdrawals).toBe(300);
    expect(result.netDeposits).toBe(700);
    expect(result.income).toBe(0);
    expect(result.expense).toBe(0);
  });
  it("dates goal completion from crossing the current target, preserving later withdrawal history", () => {
    const d = doc(
      goal("g", 1000, 100),
      movement("first", 500, "2025-12-31"),
      movement("reach", 400, "2026-02-01"),
      movement("out", 200, "2026-04-01", "withdrawal"),
      movement("reach-again", 200, "2026-05-01"),
    );
    const result = annualReflection(d, 2026, "2026-10-22");
    expect(result.completed).toHaveLength(1);
    expect(result.completed[0]).toMatchObject({
      goalId: "g",
      date: "2026-02-01",
      amount: 1000,
    });
    d.entities[0].data.target = 2000;
    expect(annualReflection(d, 2026, "2026-10-22").completed).toHaveLength(0);
  });
  it("does not invent a completion date for an already completed undated initial balance", () => {
    const d = doc(goal("g", 1000, 1500), movement("later", 100, "2026-01-05"));
    expect(annualReflection(d, 2026, "2026-10-22").completed).toHaveLength(0);
    expect(
      provenMilestones(d, "2026-10-22").filter(
        (m) => m.basis === "net-deposits",
      ),
    ).toHaveLength(0);
  });
  it("proves global thresholds with dated net deposits only, and records each first crossing once", () => {
    const d = doc(
      goal("g", 50000, 100000),
      movement("first", 900, "2025-11-01"),
      movement("out", 400, "2025-12-01", "withdrawal"),
      movement("thousand", 500, "2026-01-02"),
      movement("ten-thousand", 9000, "2026-03-01"),
      movement("back", 1000, "2026-04-01", "withdrawal"),
      movement("again", 1000, "2026-05-01"),
    );
    const milestones = annualReflection(d, 2026, "2026-10-22").automatic;
    expect(milestones).toHaveLength(2);
    expect(milestones.map((m) => [m.amount, m.date])).toEqual([
      [1000, "2026-01-02"],
      [10000, "2026-03-01"],
    ]);
  });
  it("uses only persisted wealth observations and never reconstructs history from today's balances", () => {
    const d = doc(
      e("bank", "account", {
        name: "Bank",
        balance: 50000,
        date: "2020-01-01",
      }),
      goal(),
    );
    const result = annualReflection(d, 2025, "2026-10-22");
    expect(result.observations).toEqual([]);
    expect(result.wealthChange).toBeNull();
    d.entities.push(
      e("one", "simulation", {
        tab: "wealth-snapshot",
        at: "2026-01-10T15:00:00Z",
        balance: 10000,
        netWorth: 12000,
      }),
    );
    expect(annualReflection(d, 2026, "2026-10-22").wealthChange).toBeNull();
    d.entities.push(
      e("two", "simulation", {
        tab: "wealth-snapshot",
        at: "2026-10-20T15:00:00Z",
        balance: 11000,
        netWorth: 13050.35,
      }),
    );
    expect(annualReflection(d, 2026, "2026-10-22").wealthChange).toBe(1050.35);
    expect(annualReflection(d, 2026, "2026-10-22").observations).toHaveLength(
      2,
    );
  });
  it("classifies observation dates in Brazil and ignores invalid or future observations", () => {
    const d = doc(
      e("brazil-december", "simulation", {
        tab: "wealth-snapshot",
        at: "2026-01-01T01:00:00Z",
        balance: 100,
        netWorth: 200,
      }),
      e("invalid", "simulation", {
        tab: "wealth-snapshot",
        at: "not-a-date",
        balance: 100,
        netWorth: 200,
      }),
      e("future", "simulation", {
        tab: "wealth-snapshot",
        at: "2026-12-31T12:00:00Z",
        balance: 100,
        netWorth: 200,
      }),
      e("missing-value", "simulation", {
        tab: "wealth-snapshot",
        at: "2026-08-01T12:00:00Z",
        balance: null,
        netWorth: null,
      }),
      e("impossible-date", "simulation", {
        tab: "wealth-snapshot",
        at: "2026-02-30T12:00:00Z",
        balance: 100,
        netWorth: 200,
      }),
    );
    expect(wealthObservations(d, 2025, "2026-10-22")[0].date).toBe(
      "2025-12-31",
    );
    expect(wealthObservations(d, 2026, "2026-10-22")).toHaveLength(0);
  });
  it("includes dated manual achievements without treating them as money or automatic proof", () => {
    const manual = e("manual", "simulation", {
      tab: "milestone",
      name: "Minha conquista",
      date: "2026-08-10",
      description: "Uma lembrança",
      cover: { type: "icon", x: 50, y: 50, zoom: 1 },
    });
    const note = e("note", "simulation", {
      tab: "journal",
      name: "Uma decisão",
      date: "2026-08-11",
      description: "Revisar meus hábitos",
    });
    const d = doc(manual, note);
    const before = JSON.stringify(d),
      result = annualReflection(d, 2026, "2026-10-22");
    expect(result.manual).toEqual([manual]);
    expect(result.automatic).toHaveLength(0);
    expect(result.deposits).toBe(0);
    expect(reflectionRecords(d, "journal")).toEqual([note]);
    expect(JSON.stringify(d)).toBe(before);
  });
  it("validates dates and text and respects tombstones", () => {
    const deleted = {
      ...e("gone", "simulation", {
        tab: "journal",
        name: "Gone",
        date: "2026-01-01",
      }),
      deleted: true,
    };
    expect(reflectionRecords(doc(deleted), "journal")).toEqual([]);
    expect(() =>
      validateReflectionRecord(
        { name: "Title", date: "2026-02-30", description: "A note" },
        "2026-10-22",
      ),
    ).toThrow();
    expect(() =>
      validateReflectionRecord(
        { name: "Title", date: "2026-11-01", description: "A note" },
        "2026-10-22",
      ),
    ).toThrow();
    expect(() =>
      validateReflectionRecord(
        { name: " ", date: "2026-01-01", description: "A note" },
        "2026-10-22",
      ),
    ).toThrow();
    expect(() =>
      validateReflectionRecord(
        { name: "Title", date: "2026-01-01", description: "A note" },
        "2026-10-22",
      ),
    ).not.toThrow();
    expect(() => annualReflection(doc(), 0, "2026-10-22")).toThrow();
  });
});
