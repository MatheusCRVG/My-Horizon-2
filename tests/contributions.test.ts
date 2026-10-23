import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emptyDocument, documentSchema, type Entity } from "../src/core/model";
import {
  contributions,
  occurrences,
  planStreams,
  projectSavings,
  requiredMonthly,
  reservedValue,
  totalReserved,
  fundedOccurrences,
  remainingOccurrences,
  validateContributions,
  validatePlan,
  revisedPlan,
  contributionSeries,
  type SavingPlan,
} from "../src/core/contributions";
import { savingSummary, targetValue } from "../src/core/saving-targets";
import { totals } from "../src/core/finance";
const make = (
  id: string,
  kind: Entity["kind"],
  data: Entity["data"],
): Entity => ({
  id,
  kind,
  data,
  vector: { test: 1 },
  updatedAt: "2026-10-22T12:00:00Z",
});
const plan = (): SavingPlan => ({
  mode: "months",
  monthly: 500,
  months: 12,
  firstDate: "2026-11-22",
  deadline: "2027-10-22",
  effective: "2026-10-22",
  extras: [],
});
const goal = () =>
  make("g", "goal", {
    name: "Reserva",
    target: 6000,
    saved: 0,
    deadline: "2027-10-22",
    plan: plan(),
  });
const contribution = (
  id: string,
  amount: number,
  other: Record<string, unknown> = {},
) =>
  make(id, "contribution", {
    goalId: "g",
    amount,
    date: "2026-10-22",
    description: id,
    status: "confirmed",
    ...other,
  });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-22T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());
describe("integrated saving plans", () => {
  it("includes a manually planned deposit in projections but not in the actual reserve", () => {
    const g = goal();
    g.data.plan = { ...plan(), monthly: 0 };
    const doc = emptyDocument();
    doc.entities = [
      g,
      contribution("future", 6000, { status: "planned", date: "2026-12-22" }),
    ];
    expect(reservedValue(doc, g)).toBe(0);
    expect(savingSummary(doc, g).completion).toBe("2026-12-22");
    expect(
      contributionSeries(doc, [g], "2026-10-01", "2026-12-31").at(-1),
    ).toMatchObject({ planned: 6000, actual: 0 });
  });
  it("retains the manual plan baseline after confirmation and does not duplicate a linked schedule", () => {
    const g = goal();
    g.data.plan = {
      ...plan(),
      extras: [
        {
          id: "extra",
          amount: 1000,
          description: "Extra",
          frequency: "once",
          date: "2026-12-22",
          interval: 1,
        },
      ],
    };
    const doc = emptyDocument();
    doc.entities = [
      g,
      contribution("manual", 900, {
        wasPlanned: true,
        plannedAmount: 1000,
        plannedDate: "2026-12-22",
      }),
      contribution("linked", 1000, {
        status: "planned",
        date: "2026-12-22",
        streamId: "extra",
        scheduledDate: "2026-12-22",
      }),
    ];
    const series = contributionSeries(doc, [g], "2026-10-01", "2026-12-31");
    expect(series.at(-1)).toMatchObject({
      planned: 2500,
      accumulatedActual: 900,
    });
    expect(reservedValue(doc, g)).toBe(900);
  });
  it("does not forecast a planned extra twice when it is confirmed ahead of its scheduled date", () => {
    const g = goal();
    g.data.plan = {
      ...plan(),
      extras: [
        {
          id: "december",
          description: "Extra",
          amount: 1000,
          date: "2026-12-22",
          frequency: "once",
          interval: 1,
        },
      ],
    };
    const doc = emptyDocument();
    doc.entities = [
      g,
      contribution("extra", 1000, {
        extra: true,
        streamId: "december",
        scheduledDate: "2026-12-22",
      }),
    ];
    const future = remainingOccurrences(
      g.data.plan,
      "2026-10-22",
      "2027-10-22",
      fundedOccurrences(doc, g.id),
    );
    expect(future.some((e) => e.streamId === "december")).toBe(false);
    expect(savingSummary(doc, g).completion).toBe("2027-08-22");
    expect(savingSummary(doc, g).required).toBe(416.67);
  });
  it("rounds fixed monthly durations up and uses the amount already reserved", () => {
    const r = projectSavings({
      target: 6001,
      initial: 1000,
      streams: planStreams(plan()),
      start: "2026-10-22",
    });
    expect(r.completion).toBe("2027-09-22");
    expect(r.monthsToTarget).toBe(11);
    expect(requiredMonthly(6000, 1000, plan(), "2026-10-22")).toBe(416.67);
  });
  it("keeps the required monthly amount stable when planned deposits are made and time advances", () => {
    const p = plan();
    expect(requiredMonthly(6000, 0, p, "2026-10-22")).toBe(500);
    expect(requiredMonthly(6000, 500, p, "2026-11-22", 500)).toBe(500);
    expect(requiredMonthly(6000, 500, p, "2026-11-23", 500)).toBe(500);
    expect(requiredMonthly(6000, 1000, p, "2026-12-22", 500)).toBe(500);
    expect(
      requiredMonthly(
        6000,
        1000,
        { ...p, deadline: "2027-05-22" },
        "2026-12-23",
        500,
      ),
    ).toBe(1000);
  });
  it("supports both extra-deposit effects without rewriting the realized history", () => {
    const g = goal(),
      doc = emptyDocument();
    doc.entities = [
      g,
      contribution("extra", 1000, { extra: true, effect: "advance" }),
    ];
    const before = savingSummary(doc, g);
    expect(before.completion).toBe("2027-08-22");
    expect(before.required).toBe(416.67);
    const lowered = {
      ...g,
      data: revisedPlan(g, { ...plan(), monthly: before.required! }),
    };
    expect(savingSummary(doc, lowered).completion).toBe("2027-10-22");
    expect(contributions(doc)).toHaveLength(1);
    const edited = {
      ...doc,
      entities: [g, contribution("extra", 500, { extra: true })],
    };
    expect(savingSummary(edited, g).required).toBe(458.34);
    const removed = {
      ...doc,
      entities: [g, { ...contribution("extra", 1000), deleted: true }],
    };
    expect(savingSummary(removed, g).required).toBe(500);
    expect(reservedValue(removed, g)).toBe(0);
  });
  it("includes only dated occurrences in the inclusive period, preserving monthly anchors", () => {
    const streams = [
      {
        id: "monthly",
        description: "m",
        date: "2026-01-31",
        frequency: "monthly" as const,
        amount: 100,
        interval: 1,
      },
      {
        id: "weekly",
        description: "w",
        date: "2026-02-01",
        end: "2026-02-15",
        frequency: "weekly" as const,
        amount: 25,
        interval: 1,
      },
      {
        id: "extra",
        description: "x",
        date: "2026-04-01",
        frequency: "once" as const,
        amount: 900,
        interval: 1,
      },
    ];
    const events = occurrences(streams, "2026-01-31", "2026-03-31");
    expect(
      events.filter((e) => e.streamId === "monthly").map((e) => e.date),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(events.filter((e) => e.streamId === "weekly")).toHaveLength(3);
    expect(events.reduce((s, e) => s + e.amount, 0)).toBe(375);
    expect(
      occurrences(streams, "2026-02-02", "2026-02-14").map((e) => e.date),
    ).toEqual(["2026-02-08"]);
  });
  it("separates initial balance, confirmed deposits, planned deposits, and hypothetical returns", () => {
    const g = goal(),
      doc = emptyDocument();
    g.data.saved = 1000;
    doc.entities = [
      g,
      contribution("confirmed", 500),
      contribution("planned", 700, { status: "planned" }),
      contribution("future", 500, { date: "2099-01-01" }),
    ];
    expect(reservedValue(doc, g)).toBe(1500);
    const r = projectSavings({
      target: 6000,
      initial: 1000,
      streams: planStreams(plan()),
      start: "2026-10-22",
      months: 3,
    });
    expect(r.data.at(-1)).toMatchObject({
      initial: 1000,
      contributions: 1000,
      interest: 0,
      balance: 2000,
    });
    const withReturn = projectSavings({
      target: 6000,
      initial: 1000,
      streams: [],
      start: "2026-10-01",
      months: 2,
      monthlyRate: 1,
    });
    expect(withReturn.balance).toBe(1020.1);
    expect(withReturn.totalContributed).toBe(0);
    const partial = projectSavings({
      target: 6000,
      initial: 1000,
      streams: planStreams(plan()),
      start: "2026-10-22",
      until: "2026-11-20",
      months: 3,
      monthlyRate: 1,
    });
    expect(partial.totalContributed).toBe(0);
    expect(partial.balance).toBe(1000);
  });
  it("handles completion, zero deposits, expired dates and invalid inputs without impossible forecasts", () => {
    expect(requiredMonthly(6000, 6000, plan(), "2028-01-01")).toBe(0);
    expect(requiredMonthly(6000, 0, plan(), "2028-01-01")).toBeNull();
    expect(
      projectSavings({
        target: 6000,
        initial: 0,
        streams: [],
        start: "2026-10-22",
      }).completion,
    ).toBeNull();
    expect(
      projectSavings({
        target: 1000,
        initial: 1000,
        streams: [],
        start: "2026-10-22",
      }),
    ).toMatchObject({ completion: "2026-10-22", monthsToTarget: 0 });
    expect(() => validatePlan({ ...plan(), monthly: NaN })).toThrow();
    expect(() => validatePlan({ ...plan(), months: 1.5 })).toThrow();
    expect(() =>
      projectSavings({ target: 1, initial: 0, streams: [], months: 0 }),
    ).toThrow();
  });
  it("counts reservations from both trips and goals exactly once and never creates ledger income", () => {
    const doc = emptyDocument(),
      g = goal();
    g.data.saved = 1000;
    const trip = make("trip", "trip", { saved: 500 });
    doc.entities = [
      make("bank", "account", { balance: 10000, date: "2020-01-01" }),
      g,
      trip,
      contribution("deposit", 500),
    ];
    expect(totalReserved(doc)).toBe(2000);
    expect(totals(doc, "2026-10")).toMatchObject({
      income: 0,
      expense: 0,
      balance: 10000,
      available: 8000,
    });
    expect(documentSchema.parse(doc).entities).toHaveLength(4);
  });
  it("rejects reuse of a linked movement and insufficient global or source balances", () => {
    const old = emptyDocument();
    old.entities = [
      goal(),
      make("g2", "goal", { saved: 0, target: 6000 }),
      make("tx", "transaction", {
        type: "transfer",
        amount: 1000,
        status: "confirmed",
        date: "2026-10-22",
      }),
    ];
    const first = {
      ...old,
      entities: [
        ...old.entities,
        contribution("a", 800, { transactionId: "tx", sourceId: "bank" }),
      ],
    };
    expect(() =>
      validateContributions(first, old, 1000, () => 1000),
    ).not.toThrow();
    expect(() => validateContributions(first, old, 500, () => 1000)).toThrow(
      /supera/,
    );
    expect(() => validateContributions(first, old, 1000, () => 500)).toThrow(
      /origem/,
    );
    const duplicate = {
      ...first,
      entities: [
        ...first.entities,
        contribution("b", 200, { goalId: "g2", transactionId: "tx" }),
      ],
    };
    expect(() =>
      validateContributions(duplicate, first, 1000, () => 1000),
    ).toThrow(/já está vinculada/);
    const future = {
      ...old,
      entities: [
        ...old.entities,
        contribution("future", 100, { date: "2099-01-01" }),
      ],
    };
    expect(() => validateContributions(future, old, 1000, () => 1000)).toThrow(
      /futuros/,
    );
  });
  it("preserves realized trip deposits when changing the cost scenario and uses the travel date", () => {
    const trip = make("trip", "trip", {
      name: "Viagem",
      start: "2027-02-22",
      end: "2027-02-22",
      people: 1,
      exchange: 1,
      margin: 0,
      flights: 1000,
      hotel: 0,
      food: 0,
      transport: 0,
      tours: 0,
      insurance: 0,
      shopping: 0,
      other: 0,
      saved: 0,
      plan: plan(),
      scenario: "economy",
    });
    const doc = emptyDocument();
    doc.entities = [trip, contribution("c", 100, { goalId: "trip" })];
    expect(targetValue(trip)).toBe(800);
    expect(savingSummary(doc, trip).required).toBe(175);
    const comfort = { ...trip, data: { ...trip.data, scenario: "comfort" } };
    expect(savingSummary(doc, comfort)).toMatchObject({
      target: 1300,
      saved: 100,
      remaining: 1200,
      required: 300,
    });
  });
  it("keeps plan revisions in their effective periods and filters realized history by objective", () => {
    const g = goal();
    const oldPlan = {
      ...plan(),
      firstDate: "2026-09-22",
      effective: "2026-09-01",
      monthly: 500,
    };
    g.data.planHistory = [oldPlan];
    g.data.plan = {
      ...plan(),
      firstDate: "2026-09-22",
      effective: "2026-10-01",
      monthly: 300,
    };
    const doc = emptyDocument();
    doc.entities = [
      g,
      contribution("c", 250),
      contribution("other", 999, { goalId: "other" }),
    ];
    const series = contributionSeries(doc, [g], "2026-09-01", "2026-10-22");
    expect(series.map((r) => r.planned)).toEqual([500, 300]);
    expect(series.at(-1)).toMatchObject({
      actual: 250,
      accumulatedPlanned: 800,
      accumulatedActual: 250,
    });
  });
});
