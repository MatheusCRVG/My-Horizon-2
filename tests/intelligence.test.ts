import { describe, it, expect } from "vitest";
import { emptyDocument, type Entity, type Document } from "../src/core/model";
import {
  assistantAnswer,
  budgetAnalysis,
  horizonScore,
  pulseSnapshot,
  pulseChanges,
  savingCapacity,
  spendingSignals,
} from "../src/core/intelligence";
import { reservationIntegrity } from "../src/core/reservations";
import { totals } from "../src/core/finance";
import { dashboardLayout, workspaceChange } from "../src/core/workspace";
import {
  occurrences,
  validatePlan,
  defaultPlan,
} from "../src/core/contributions";
const e = (id: string, kind: Entity["kind"], data: Entity["data"]): Entity => ({
  id,
  kind,
  data,
  vector: { test: 1 },
  updatedAt: "2026-10-01T12:00:00Z",
});
const doc = (entities: Entity[] = []): Document => ({
  ...emptyDocument(),
  entities,
});
const tx = (
  id: string,
  type: string,
  amount: number,
  date = "2026-10-05",
  extra: Record<string, unknown> = {},
) =>
  e(id, "transaction", {
    description: id,
    type,
    amount,
    date,
    status: "confirmed",
    accountId: "a",
    payment: "pix",
    category: type === "income" ? "Salário" : "Lazer",
    ...extra,
  });
describe("local intelligence and account preferences", () => {
  it("detects reservations merged from two offline devices without discarding their history", () => {
    const d = doc([
      e("a", "account", { name: "Conta", balance: 100, date: "2026-01-01" }),
      e("g1", "goal", { name: "A", target: 100, saved: 0 }),
      e("g2", "goal", { name: "B", target: 100, saved: 0 }),
      e("c1", "contribution", {
        goalId: "g1",
        amount: 80,
        date: "2026-10-01",
        status: "confirmed",
        description: "A",
        sourceId: "a",
      }),
      e("c2", "contribution", {
        goalId: "g2",
        amount: 80,
        date: "2026-10-01",
        status: "confirmed",
        description: "B",
        sourceId: "a",
      }),
    ]);
    const before = JSON.stringify(d);
    expect(reservationIntegrity(d)).not.toBe("");
    expect(JSON.stringify(d)).toBe(before);
    d.entities.push(
      e("release", "contribution", {
        goalId: "g1",
        direction: "withdrawal",
        amount: 60,
        date: "2026-10-02",
        status: "confirmed",
        description: "Liberar",
      }),
    );
    expect(reservationIntegrity(d)).toBe("");
  });
  it("excludes future cash and valuations while keeping card obligations from a known purchase", () => {
    const d = doc([
      e("a", "account", { name: "Conta", balance: 1000, date: "2026-01-01" }),
      e("c", "card", { name: "Cartão", closing: 5, due: 20 }),
      tx("later", "income", 1000, "2026-10-25"),
      tx("card", "expense", 200, "2026-11-20", {
        payment: "credit",
        purchaseDate: "2026-10-05",
        cardId: "c",
      }),
      e("future-asset", "asset", {
        type: "fixed",
        amount: 10000,
        date: "2026-11-01",
      }),
    ]);
    expect(totals(d, "2026-10", "", "", "2026-10-10")).toMatchObject({
      income: 0,
      balance: 1000,
      invested: 0,
      committed: 200,
      netWorth: 800,
    });
  });
  it("limits savings by cash, earmarked funds, cards and planned expenses without own transfers as income", () => {
    const d = doc([
      e("a", "account", { name: "Conta", balance: 1000, date: "2026-01-01" }),
      e("b", "account", { name: "Outra", balance: 0, date: "2026-01-01" }),
      tx("salary", "income", 2000),
      tx("spend", "expense", 500),
      tx("own", "transfer", 400, "2026-10-06", { targetAccountId: "b" }),
      e("g", "goal", { name: "Viagem", saved: 500, target: 5000 }),
      tx("upcoming", "expense", 300, "2026-10-27", { status: "planned" }),
    ]);
    expect(savingCapacity(d, "2026-10")).toEqual({
      planned: 300,
      available: 2000,
      surplus: 1500,
      prudent: 1200,
    });
    d.entities.push(
      tx("bill", "expense", 900, "2026-10-10", {
        payment: "credit",
        cardId: "c",
      }),
      e("c", "card", { name: "Cartão", closing: 1, due: 15 }),
    );
    expect(savingCapacity(d, "2026-10").prudent).toBe(300);
  });
  it("separates realized and predicted budget and compares prior month", () => {
    const d = doc([
      e("budget", "budget", { category: "Lazer", limit: 500 }),
      tx("old", "expense", 150, "2026-09-01"),
      tx("now", "expense", 200),
      tx("plan", "expense", 400, "2026-10-25", { status: "planned" }),
      tx("own", "transfer", 999),
    ]);
    expect(budgetAnalysis(d, "2026-10")[0]).toMatchObject({
      spent: 200,
      previous: 150,
      planned: 400,
    });
  });
  it("requires real history before identifying an unusual expense and excludes installments from subscriptions", () => {
    const history = Array.from({ length: 5 }, (_, i) =>
      tx(
        `past${i}`,
        "expense",
        100,
        `2026-09-${String(i + 1).padStart(2, "0")}`,
      ),
    );
    const d = doc([
      ...history,
      tx("unusual", "expense", 400),
      ...["08", "09", "10"].map((m) =>
        tx("Installment" + m, "expense", 100, `2026-${m}-05`, {
          description: "Loja",
          installment: "1/12",
        }),
      ),
    ]);
    expect(
      spendingSignals(d, "2026-10-22").unusual.map((x) => x.entity.id),
    ).toContain("unusual");
    expect(spendingSignals(d, "2026-10-22").subscriptions).toHaveLength(0);
    expect(
      spendingSignals(doc([tx("single", "expense", 5000)]), "2026-10-22")
        .unusual,
    ).toHaveLength(0);
  });
  it("does not attribute financial health to an empty vault", () => {
    expect(horizonScore(doc(), "2026-10-22").score).toBeNull();
  });
  it("does not invent absent expense history or penalize contributions not yet due", () => {
    const d = doc([
      tx("income", "income", 6000, "2026-09-01"),
      tx("expense", "expense", 3000, "2026-09-02"),
      e("reserve", "goal", { name: "Reserva", saved: 6000, target: 30000 }),
      e("plan", "goal", {
        name: "Viagem",
        saved: 0,
        target: 10000,
        plan: {
          mode: "monthly",
          monthly: 500,
          firstDate: "2026-10-28",
          effective: "2026-10-22",
          deadline: "",
          months: 12,
          extras: [],
        },
      }),
    ]);
    const result = horizonScore(d, "2026-10-22");
    expect(result.score).toBeNull();
    expect(
      result.factors.find((f) => f.label === "Reserva de emergência")?.earned,
    ).toBeCloseTo(25 / 3);
    expect(
      result.factors.some((f) => f.label === "Regularidade dos aportes"),
    ).toBe(false);
  });
  it("respects the reference date and keeps digits in names of different objectives", () => {
    const d = doc([
      e("a", "account", { name: "Conta", balance: 0, date: "2026-01-01" }),
      tx("future", "income", 1000, "2026-10-20"),
      e("g1", "goal", { name: "Viagem 2027", target: 1000, saved: 100 }),
      e("g2", "goal", { name: "Viagem 2028", target: 2000, saved: 200 }),
    ]);
    expect(pulseSnapshot(d, "2026-10-10").balance).toBe(0);
    expect(pulseSnapshot(d, "2026-10-10").transactionIds).toEqual([]);
    expect(
      assistantAnswer(
        d,
        "Quanto preciso aportar para Viagem 2028?",
        "2026-10-10",
      ).title,
    ).toBe("Viagem 2028");
  });
  it("Pulse compares actual reserved values and confirmed records against the previous snapshot", () => {
    const d = doc([
      e("a", "account", { name: "Conta", balance: 1000, date: "2026-01-01" }),
      e("goal", "goal", { name: "Reserva", saved: 0, target: 1000 }),
    ]);
    const before = pulseSnapshot(d, "2026-10-22");
    d.entities.push(
      tx("salary", "income", 100),
      e("deposit", "contribution", {
        goalId: "goal",
        amount: 50,
        date: "2026-10-10",
        status: "confirmed",
        description: "Aporte",
      }),
    );
    const events = pulseChanges(d, before, "2026-10-22");
    expect(events.map((x) => x.id)).toEqual([
      "transactions",
      "balance",
      "goal",
    ]);
    expect(pulseChanges(d, null, "2026-10-22")).toEqual([]);
  });
  it("assistant performs supported what-if arithmetic without writing to the document", () => {
    const d = doc([
        tx("income", "income", 1000),
        tx("expense", "expense", 400),
      ]),
      before = JSON.stringify(d);
    expect(
      assistantAnswer(d, "E se meu salário aumentar 20%?", "2026-10-22").text,
    ).toContain("1.200,00");
    expect(
      assistantAnswer(d, "E se meu salário aumentar 20%?", "2026-10-22").text,
    ).toContain("800,00");
    expect(JSON.stringify(d)).toBe(before);
  });
  it("saved dashboard ordering tolerates unknown module IDs and allows an empty personalized layout", () => {
    const d = doc([
      e("my-horizon:workspace", "simulation", {
        tab: "workspace",
        dashboard: ["activity", "unknown", "activity", "pulse"],
      }),
    ]);
    expect(dashboardLayout(d)).toEqual(["activity", "pulse"]);
    expect(workspaceChange(d, { dashboard: [] }).data.dashboard).toEqual([]);
  });
  it("growing contributions adjust at an anniversary and are still planned occurrences", () => {
    const events = occurrences(
      [
        {
          id: "growing",
          amount: 500,
          frequency: "monthly",
          date: "2026-01-31",
          interval: 1,
          annualGrowth: 10,
          description: "Crescente",
        },
      ],
      "2026-01-01",
      "2027-02-28",
    );
    expect(events[11].amount).toBe(500);
    expect(events[12].amount).toBe(550);
    expect(events[13].date).toBe("2027-02-28");
    expect(events[13].amount).toBe(550);
    const plan = defaultPlan(e("goal", "goal", { target: 1000 }));
    plan.mode = "monthly";
    plan.extras = [
      {
        id: "bad",
        amount: 100,
        date: "2026-01-01",
        interval: 1,
        frequency: "monthly",
        description: "bad",
        annualGrowth: -10,
      },
    ];
    expect(() => validatePlan(plan)).toThrow();
  });
});
