import { describe, it, expect, vi, afterEach } from "vitest";
import { emptyDocument, type Entity } from "../src/core/model";
import {
  reservedValue,
  totalReserved,
  validateContributions,
  sourceReserved,
  contributionSeries,
} from "../src/core/contributions";
import { totals } from "../src/core/finance";
import { savingSummary } from "../src/core/saving-targets";
const e = (id: string, kind: Entity["kind"], data: Entity["data"]): Entity => ({
  id,
  kind,
  data,
  vector: { t: 1 },
  updatedAt: "2026-10-22T12:00:00Z",
});
const goal = () =>
  e("g", "goal", { name: "Meu horizonte", target: 1000, saved: 100 });
const movement = (
  id: string,
  amount: number,
  direction = "deposit",
  date = "2026-10-22",
) =>
  e(id, "contribution", {
    goalId: "g",
    amount,
    direction,
    date,
    status: "confirmed",
    description: id,
    sourceId: direction === "deposit" ? "bank" : "",
  });
afterEach(() => vi.useRealTimers());
describe("horizon movements and preservation", () => {
  it("withdrawals release a reservation without changing income, expenses or wealth", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
    const d = emptyDocument(),
      g = goal();
    d.entities = [
      g,
      e("bank", "account", { balance: 700, date: "2020-01-01" }),
      movement("deposit", 200),
      movement("withdrawal", 150, "withdrawal"),
    ];
    expect(reservedValue(d, g)).toBe(150);
    expect(totals(d, "2026-10")).toMatchObject({
      balance: 700,
      income: 0,
      expense: 0,
      netWorth: 700,
      available: 550,
    });
    expect(
      contributionSeries(d, [g], "2026-10-01", "2026-10-31")[0],
    ).toMatchObject({ deposits: 200, withdrawn: 150, actual: 50 });
  });
  it("rejects withdrawing money that did not exist at the recorded date", () => {
    const g = goal(),
      old = emptyDocument();
    old.entities = [g];
    const d = {
      ...old,
      entities: [
        g,
        movement("deposit", 300, "deposit", "2026-01-10"),
        movement("withdraw", 200, "withdrawal", "2026-01-05"),
      ],
    };
    expect(() => validateContributions(d, old, 1000, () => 1000)).toThrow(
      /retirada supera/,
    );
  });
  it("recalculates edits and deletions and blocks removing funding already withdrawn", () => {
    const g = goal(),
      old = emptyDocument();
    g.data.saved = 0;
    old.entities = [
      g,
      movement("deposit", 500, "deposit", "2026-01-01"),
      movement("withdraw", 400, "withdrawal", "2026-01-02"),
    ];
    const bad = {
      ...old,
      entities: [g, { ...old.entities[1], deleted: true }, old.entities[2]],
    };
    expect(() => validateContributions(bad, old, 1000, () => 1000)).toThrow(
      /retirada supera/,
    );
    const deletedWithdrawal = {
      ...old,
      entities: [g, old.entities[1], { ...old.entities[2], deleted: true }],
    };
    expect(reservedValue(deletedWithdrawal, g)).toBe(500);
  });
  it("allows source money released by a withdrawal to be reserved again", () => {
    const g = goal(),
      old = emptyDocument();
    g.data.saved = 0;
    old.entities = [
      g,
      movement("deposit", 500, "deposit", "2026-01-01"),
      movement("withdraw", 200, "withdrawal", "2026-01-02"),
    ];
    const next = {
      ...old,
      entities: [
        ...old.entities,
        movement("again", 200, "deposit", "2026-01-03"),
      ],
    };
    expect(sourceReserved(old, "bank")).toBe(300);
    expect(sourceReserved(next, "bank")).toBe(500);
    expect(() =>
      validateContributions(next, old, 500, () => 500),
    ).not.toThrow();
  });
  it("archiving keeps the funds reserved, and overfunding reports the excess", () => {
    const g = goal(),
      d = emptyDocument();
    g.data.saved = 1100;
    g.data.archived = true;
    d.entities = [g];
    expect(totalReserved(d)).toBe(1100);
    expect(savingSummary(d, g)).toMatchObject({
      saved: 1100,
      remaining: 0,
      excess: 100,
    });
  });
  it("an objective without a deadline does not acquire one from a forecast", () => {
    const g = goal(),
      d = emptyDocument();
    g.data.plan = {
      mode: "monthly",
      monthly: 100,
      firstDate: "2026-11-22",
      deadline: "2027-07-22",
      months: 12,
      effective: "2026-10-22",
      extras: [],
    };
    d.entities = [g];
    expect(savingSummary(d, g)).toMatchObject({ desired: "", required: null });
  });
});
