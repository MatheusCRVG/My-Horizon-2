import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDocument, type Entity } from "../src/core/model";
import {
  dependencyIds,
  lifePlan,
  projectPriorityBudget,
  validateDependencies,
} from "../src/core/life";

const make = (
  id: string,
  data: Entity["data"] = {},
  kind: Entity["kind"] = "goal",
): Entity => ({
  id,
  kind,
  data: { name: id, target: 200, saved: 0, deadline: "", ...data },
  vector: { a: 1 },
  updatedAt: "2026-10-22T12:00:00Z",
});
const savingPlan = (firstDate = "2026-11-22") => ({
  mode: "monthly",
  monthly: 100,
  months: 12,
  firstDate,
  effective: "2026-10-22",
  deadline: "",
  extras: [],
});
const document = (...entities: Entity[]) => ({ ...emptyDocument(), entities });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("horizon dependencies", () => {
  it("accepts independent old goals without requiring data migration", () => {
    const g = make("old");
    expect(dependencyIds(g)).toEqual([]);
    expect(lifePlan(document(g))[0]).toMatchObject({
      completed: false,
      baseCompletion: "",
      completion: "",
      blocked: false,
    });
    expect(g.data.dependsOn).toBeUndefined();
  });
  it("rejects self references, cycles, duplicates and missing or deleted prerequisites", () => {
    const a = make("a"),
      b = make("b", { dependsOn: ["a"] }),
      c = make("c", { dependsOn: ["b"] });
    const d = document(a, b, c, { ...make("deleted"), deleted: true });
    expect(() => validateDependencies(d, "a", ["a"])).toThrow(/dele mesmo/);
    expect(() => validateDependencies(d, "a", ["c"])).toThrow(/ciclo/);
    expect(() => validateDependencies(d, "a", ["missing"])).toThrow(/removido/);
    expect(() => validateDependencies(d, "a", ["deleted"])).toThrow(/removido/);
    expect(() => validateDependencies(d, "a", ["b", "b"])).toThrow(
      /duas vezes/,
    );
    expect(() => validateDependencies(d, "unknown", [])).toThrow(/disponível/);
    expect(() => validateDependencies(d, "c", ["a"])).not.toThrow();
  });
  it("does not prevent editing an unrelated chain because of a legacy dangling reference", () => {
    const d = document(
      make("a"),
      make("b"),
      make("legacy", { dependsOn: ["missing"] }),
    );
    expect(() => validateDependencies(d, "b", ["a"])).not.toThrow();
    expect(() => validateDependencies(d, "b", ["legacy"])).toThrow();
  });
  it("reads a legacy cycle without infinite recursion or invented dates", () => {
    const nodes = lifePlan(
      document(
        make("a", { plan: savingPlan(), dependsOn: ["b"] }),
        make("b", { plan: savingPlan(), dependsOn: ["a"] }),
      ),
    );
    expect(nodes.every((n) => n.blocked && !n.completion)).toBe(true);
    expect(
      projectPriorityBudget(nodes, 200).every(
        (n) => n.blocked && !n.completion,
      ),
    ).toBe(true);
  });
});

describe("derived life estimates", () => {
  it("shifts the existing plan only when a valid prerequisite completes after its first contribution", () => {
    const a = make("a", { plan: savingPlan() });
    const b = make("b", { target: 100, plan: savingPlan(), dependsOn: ["a"] });
    const nodes = lifePlan(document(a, b));
    expect(nodes.find((n) => n.id === "a")?.completion).toBe("2026-12-22");
    expect(nodes.find((n) => n.id === "b")).toMatchObject({
      baseCompletion: "2026-11-22",
      completion: "2026-12-23",
      delayDays: 31,
      depth: 1,
    });
    expect(b.data.plan.firstDate).toBe("2026-11-22");
  });
  it("does not shift a plan that already starts after its prerequisite", () => {
    const nodes = lifePlan(
      document(
        make("a", { target: 100, plan: savingPlan() }),
        make("b", {
          target: 100,
          plan: savingPlan("2027-02-22"),
          dependsOn: ["a"],
        }),
      ),
    );
    expect(nodes.find((n) => n.id === "b")).toMatchObject({
      completion: "2027-02-22",
      delayDays: 0,
    });
  });
  it("does not infer a completion date from an expired deadline or an unplanned prerequisite", () => {
    const nodes = lifePlan(
      document(
        make("a", { deadline: "2020-01-01" }),
        make("b", { plan: savingPlan(), dependsOn: ["a"] }),
      ),
    );
    expect(nodes.find((n) => n.id === "a")?.completion).toBe("");
    expect(nodes.find((n) => n.id === "b")).toMatchObject({
      blocked: true,
      completion: "",
    });
  });
  it("distinguishes confirmed completion dates from undocumented initial reserves", () => {
    const confirmed = make("confirmed", { target: 100 });
    const legacy = make("legacy", { target: 100, saved: 150 });
    const contribution = make(
      "deposit",
      {
        goalId: "confirmed",
        amount: 100,
        status: "confirmed",
        date: "2026-10-10",
      },
      "contribution",
    );
    const nodes = lifePlan(document(confirmed, legacy, contribution));
    expect(nodes.find((n) => n.id === "confirmed")).toMatchObject({
      completed: true,
      completedDate: "2026-10-10",
    });
    expect(nodes.find((n) => n.id === "legacy")).toMatchObject({
      completed: true,
      completedDate: "",
      percent: 150,
    });
  });
  it("treats a completed prerequisite as fulfilled, including archived completed goals", () => {
    const nodes = lifePlan(
      document(
        make("a", { target: 100, saved: 100, archived: true }),
        make("b", { plan: savingPlan(), dependsOn: ["a"] }),
      ),
    );
    expect(nodes.find((n) => n.id === "b")).toMatchObject({
      blocked: false,
      completion: "2026-12-22",
      delayDays: 0,
    });
    const unfinished = lifePlan(
      document(
        make("a", { archived: true }),
        make("b", { plan: savingPlan(), dependsOn: ["a"] }),
      ),
    );
    expect(unfinished.find((n) => n.id === "b")).toMatchObject({
      blocked: true,
      completion: "",
    });
  });
  it("preserves trip cost scenarios, saved balances, photos and existing plan data", () => {
    const trip = make(
      "trip",
      {
        start: "2027-03-01",
        end: "2027-03-02",
        people: 1,
        flights: 200,
        hotel: 0,
        food: 0,
        transport: 0,
        tours: 0,
        insurance: 0,
        shopping: 0,
        other: 0,
        exchange: 1,
        margin: 0,
        scenario: "comfort",
        saved: 60,
        plan: savingPlan(),
        cover: {
          type: "gallery",
          image: "travel-coast",
          x: 50,
          y: 50,
          zoom: 1,
        },
      },
      "trip",
    );
    const before = JSON.stringify(trip);
    const node = lifePlan(document(trip))[0];
    expect(node.target).toBe(260);
    expect(node.saved).toBe(60);
    expect(node.remaining).toBe(200);
    expect(node.completion).toBe("2026-12-22");
    expect(JSON.stringify(trip)).toBe(before);
  });
});

describe("one shared hypothetical budget", () => {
  it("allocates one pool by priority without duplicating money or modifying real contributions", () => {
    const d = document(
      make("a", { target: 100, priority: 3 }),
      make("b", { target: 100, priority: 1 }),
    );
    const before = JSON.stringify(d);
    const nodes = lifePlan(d);
    const p = projectPriorityBudget(nodes, 100, "2026-10-22", 3);
    expect(p.find((n) => n.id === "a")?.completion).toBe("2026-11-22");
    expect(p.find((n) => n.id === "b")?.completion).toBe("2026-12-22");
    expect(p.reduce((sum, n) => sum + n.allocated, 0)).toBe(200);
    expect(JSON.stringify(d)).toBe(before);
  });
  it("shows the effect of changing priorities", () => {
    const d = document(
      make("a", { target: 100, priority: 1 }),
      make("b", { target: 100, priority: 3 }),
    );
    const p = projectPriorityBudget(lifePlan(d), 100, "2026-10-22", 3);
    expect(p.find((n) => n.id === "b")?.completion).toBe("2026-11-22");
    expect(p.find((n) => n.id === "a")?.completion).toBe("2026-12-22");
  });
  it("can fund dependent goals without existing individual plans, unlocking them next month", () => {
    const nodes = lifePlan(
      document(
        make("a", { target: 100 }),
        make("b", { target: 100, priority: 3, dependsOn: ["a"] }),
      ),
    );
    const p = projectPriorityBudget(nodes, 200, "2026-10-22", 3);
    expect(p.find((n) => n.id === "a")?.completion).toBe("2026-11-22");
    expect(p.find((n) => n.id === "b")?.completion).toBe("2026-12-22");
    expect(p.find((n) => n.id === "b")?.blocked).toBe(false);
  });
  it("does not infer impossible dates for zero budgets, blocked chains, or invalid input", () => {
    const nodes = lifePlan(
      document(make("a", { dependsOn: ["missing"] }), make("b")),
    );
    expect(projectPriorityBudget(nodes, 0).every((n) => !n.completion)).toBe(
      true,
    );
    expect(
      projectPriorityBudget(nodes, 1000).find((n) => n.id === "a"),
    ).toMatchObject({ completion: "", allocated: 0, blocked: true });
    expect(() => projectPriorityBudget(nodes, -1)).toThrow();
    expect(() => projectPriorityBudget(nodes, NaN)).toThrow();
    expect(() =>
      projectPriorityBudget(nodes, 100, "2026-10-22", 601),
    ).toThrow();
  });
});
