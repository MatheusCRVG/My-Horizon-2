import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  estimateHorizon,
  newHorizonPlanner,
  plannerFor,
  reviseHorizonBudget,
  validateHorizonPlanner,
  type HorizonPlanner,
} from "../src/core/horizon-planning";
import { emptyDocument, type Document, type Entity } from "../src/core/model";
import { reservedValue, type SavingPlan } from "../src/core/contributions";
import { resolvePlan } from "../src/core/plan-resolution";
import { savingSummary, targetValue } from "../src/core/saving-targets";
import {
  assertEditRevision,
  editDocument,
  goalMovementRevision,
  mergeDocuments,
} from "../src/core/merge";

const asOf = "2026-10-22";
const entity = (
  id: string,
  kind: Entity["kind"],
  data: Entity["data"],
  vector = { a: 1 },
): Entity => ({
  id,
  kind,
  data,
  vector,
  updatedAt: asOf + "T12:00:00Z",
});
const document = (...entities: Entity[]): Document => ({
  ...emptyDocument(),
  entities,
});
const travel = (
  patch: Partial<Extract<HorizonPlanner, { type: "travel" }>> = {},
): Extract<HorizonPlanner, { type: "travel" }> => ({
  version: 1,
  type: "travel",
  city: "Recife",
  state: "PE",
  country: "Brasil",
  date: "2027-01-22",
  days: 3,
  people: 2,
  transport: "plane",
  transportCost: 500,
  transportUnit: "person",
  nights: 2,
  nightly: 300,
  foodDaily: 50,
  tours: 200,
  local: 100,
  additional: 50,
  contingencyMode: "percent",
  contingency: 10,
  ...patch,
});
const car = (value = 650): HorizonPlanner => ({
  version: 1,
  type: "car",
  model: "Meu carro",
  vehicle: value,
  initialCosts: 0,
  buffer: 0,
});
const plan = (patch: Partial<SavingPlan> = {}): SavingPlan => ({
  mode: "monthly",
  monthly: 100,
  months: 4,
  firstDate: "2026-11-22",
  deadline: "2026-12-22",
  effective: "2026-10-01",
  extras: [],
  ...patch,
});
const goal = (patch: Entity["data"] = {}) =>
  entity("goal", "goal", {
    name: "Meu horizonte",
    target: 450,
    saved: 100,
    deadline: "2026-12-22",
    plan: plan(),
    description: "Uma conquista",
    featured: true,
    dashboardOrder: 2,
    cover: { type: "gallery", image: "car-road", x: 35, y: 65, zoom: 1.2 },
    ...patch,
  });
const deposit = (id = "deposit", amount = 200, patch: Entity["data"] = {}) =>
  entity(id, "contribution", {
    goalId: "goal",
    amount,
    status: "confirmed",
    date: "2026-10-01",
    description: id,
    extra: true,
    ...patch,
  });
const fundedDocument = (g = goal()) =>
  document(
    g,
    deposit(),
    deposit("withdrawal", 50, { direction: "withdrawal", date: "2026-10-05" }),
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(asOf + "T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("personal horizon cost estimates", () => {
  it("separates travel costs per person from group costs and nights from days", () => {
    const perPerson = estimateHorizon(travel());
    const group = estimateHorizon(travel({ transportUnit: "group" }));
    expect(perPerson.lines.map((l) => l.amount)).toEqual([
      1000, 600, 300, 200, 100, 50, 225,
    ]);
    expect(perPerson.total).toBe(2475);
    expect(group.lines.map((l) => l.amount)).toEqual([
      500, 600, 300, 200, 100, 50, 175,
    ]);
    expect(group.total).toBe(1925);
    // Tours, local transport and extras are group totals; they never multiply by travellers.
    expect(group.lines.slice(3, 6).map((l) => l.amount)).toEqual(
      perPerson.lines.slice(3, 6).map((l) => l.amount),
    );
  });
  it("allows a day trip with zero hotel nights and includes round-trip car costs once", () => {
    const p = travel({
      days: 1,
      nights: 0,
      people: 4,
      transport: "car",
      transportUnit: "group",
      transportCost: 300,
      nightly: 1000,
      foodDaily: 25,
      tours: 0,
      local: 0,
      additional: 0,
      contingency: 0,
    });
    expect(estimateHorizon(p).total).toBe(400);
    expect(estimateHorizon(p).lines[1].amount).toBe(0);
  });
  it("applies percentage or fixed contingency once, without compounding or multiplying the fixed amount", () => {
    expect(estimateHorizon(travel({ contingency: 10 })).total).toBe(2475);
    expect(
      estimateHorizon(travel({ contingencyMode: "amount", contingency: 100 }))
        .total,
    ).toBe(2350);
    expect(estimateHorizon(travel({ contingency: 0 })).total).toBe(2250);
    expect(estimateHorizon(travel({ contingency: 100 })).total).toBe(4500);
  });
  it("rounds component amounts to centavos before multiplying and rounds contingency to one cent", () => {
    const p = travel({
      transportCost: 10.01,
      people: 3,
      nightly: 0.1,
      foodDaily: 0.33,
      tours: 0.1,
      local: 0.2,
      additional: 0.3,
      contingency: 2.5,
    });
    const estimated = estimateHorizon(p);
    expect(estimated.lines.map((l) => l.amount)).toEqual([
      30.03, 0.2, 2.97, 0.1, 0.2, 0.3, 0.85,
    ]);
    expect(estimated.total).toBe(34.65);
    // Round 0.105 to 0.11 before multiplying: 3 × 0.11 + 2 × 0.11 + 9 × 0.11.
    expect(
      estimateHorizon(
        travel({
          transportCost: 0.105,
          people: 3,
          nightly: 0.105,
          foodDaily: 0.105,
          tours: 0,
          local: 0,
          additional: 0,
          contingency: 0,
        }),
      ).total,
    ).toBe(1.54);
  });
  it("keeps the full car target separate from the money already reserved", () => {
    const g = goal({ target: 50000, saved: 20000 });
    const d = document(
      g,
      deposit("deposit", 5000),
      deposit("withdrawal", 2000, {
        direction: "withdrawal",
        date: "2026-10-05",
      }),
    );
    const p: HorizonPlanner = {
      version: 1,
      type: "car",
      model: "Carro",
      vehicle: 50000,
      initialCosts: 2000,
      buffer: 1000,
    };
    const data = reviseHorizonBudget(d, g, p, false, asOf);
    const updated = { ...g, data },
      next = {
        ...d,
        entities: d.entities.map((e) => (e.id === g.id ? updated : e)),
      };
    expect(data.target).toBe(53000);
    expect(reservedValue(next, updated, asOf)).toBe(23000);
    expect(targetValue(updated)).toBe(53000);
    expect(savingSummary(next, updated, asOf).remaining).toBe(30000);
  });
  it("calculates savings from base plus monthly contributions, or uses an explicit final target", () => {
    const p: HorizonPlanner = {
      version: 1,
      type: "savings",
      purpose: "Poupar",
      method: "period",
      base: 1000.1,
      monthly: 500.2,
      months: 12,
      desired: 99999,
    };
    expect(estimateHorizon(p).total).toBe(7002.5);
    expect(
      estimateHorizon({ ...p, method: "target", desired: 12345.67 }).total,
    ).toBe(12345.67);
    expect(estimateHorizon({ ...p, monthly: 0, base: 2500 }).total).toBe(2500);
  });
  it("estimates reserve coverage and generic cost items without introducing returns", () => {
    expect(
      estimateHorizon({
        version: 1,
        type: "reserve",
        essentialMonthly: 2000,
        coverage: 6,
        buffer: 500,
      }).total,
    ).toBe(12500);
    expect(
      estimateHorizon({
        version: 1,
        type: "items",
        items: [
          { id: "a", name: "Curso", amount: 1.1 },
          { id: "b", name: "Materiais", amount: 2.2 },
          { id: "c", name: "Outros", amount: 0.3 },
        ],
      }).total,
    ).toBe(3.6);
  });
  it("provides category-specific defaults and reads planner snapshots without mutating goals", () => {
    expect(newHorizonPlanner("savings", 123)).toMatchObject({
      type: "savings",
      base: 123,
      months: 12,
    });
    expect(newHorizonPlanner("reserve")).toMatchObject({
      type: "reserve",
      coverage: 6,
    });
    expect(newHorizonPlanner("travel")).toMatchObject({
      type: "travel",
      people: 1,
      nights: 0,
    });
    expect(newHorizonPlanner("study").type).toBe("items");
    expect(plannerFor(goal())).toBeUndefined();
    const p = car();
    expect(plannerFor(goal({ planner: p }))).toEqual(p);
    expect(plannerFor(goal({ planner: { ...p, version: 2 } }))).toBeUndefined();
  });
  it("rejects invalid money, quantities, enums, empty item lists and excessive totals", () => {
    const invalid: unknown[] = [
      travel({ transportCost: -1 }),
      travel({ foodDaily: NaN }),
      travel({ tours: Infinity }),
      travel({ local: 1e9 + 0.01 }),
      travel({ days: 0 }),
      travel({ days: 1.5 }),
      travel({ days: 731 }),
      travel({ people: 101 }),
      travel({ nights: -1 }),
      travel({ nights: 731 }),
      travel({ contingency: 101 }),
      travel({ contingency: -1 }),
      { ...travel(), transportUnit: "unknown" },
      { ...travel(), contingencyMode: "unknown" },
      { ...travel(), version: 2 },
      { ...car(), vehicle: 1e9, initialCosts: 0.01 },
      {
        version: 1,
        type: "savings",
        method: "period",
        monthly: 1,
        months: 601,
        base: 0,
      },
      {
        version: 1,
        type: "reserve",
        essentialMonthly: 100,
        coverage: 0,
        buffer: 0,
      },
      {
        version: 1,
        type: "reserve",
        essentialMonthly: 100,
        coverage: 61,
        buffer: 0,
      },
      { version: 1, type: "items", items: [] },
      {
        version: 1,
        type: "items",
        items: Array.from({ length: 41 }, (_, i) => ({
          id: String(i),
          name: "Item",
          amount: 1,
        })),
      },
    ];
    for (const p of invalid)
      expect(() => estimateHorizon(p as HorizonPlanner)).toThrow();
  });
  it("requires meaningful descriptions, a valid travel date and a positive confirmed target", () => {
    for (const p of [
      travel({ city: " " }),
      travel({ country: " " }),
      travel({ date: "2027-02-30" }),
      { ...car(), model: " " },
      { ...newHorizonPlanner("savings"), monthly: 500 },
      {
        version: 1,
        type: "items",
        items: [{ id: "a", name: " ", amount: 100 }],
      },
      car(0),
    ])
      expect(() => validateHorizonPlanner(p as HorizonPlanner)).toThrow();
    expect(validateHorizonPlanner(travel({ date: "" })).total).toBe(2475);
  });
});

describe("reviewing an existing horizon budget", () => {
  it("changes the target explicitly while preserving cover, saved baseline, movements and planner history", () => {
    const oldPlanner = car(450),
      oldHistory = { at: "2026-09-01T12:00:00Z", target: 400, planner: null };
    const g = goal({ planner: oldPlanner, plannerHistory: [oldHistory] });
    const d = fundedDocument(g),
      original = JSON.stringify(d);
    const data = reviseHorizonBudget(d, g, car(650), false, asOf);
    expect(data).toMatchObject({
      target: 650,
      saved: 100,
      cover: g.data.cover,
      description: g.data.description,
      featured: true,
      dashboardOrder: 2,
    });
    expect(data.plan).toEqual(g.data.plan);
    expect(data.plannerHistory).toEqual([
      oldHistory,
      { at: asOf + "T12:00:00.000Z", target: 450, planner: oldPlanner },
    ]);
    expect(JSON.stringify(d)).toBe(original);
    expect(reservedValue(d, g, asOf)).toBe(250);
    expect(d.entities.filter((e) => e.kind === "contribution")).toHaveLength(2);
  });
  it("preserves a fixed monthly amount and recalculates the completion estimate from remaining money", () => {
    const d = fundedDocument(),
      g = d.entities[0];
    const data = reviseHorizonBudget(d, g, car(650), true, asOf);
    expect(data.plan.monthly).toBe(100);
    expect(data.plan.deadline).toBe("2027-02-22");
    expect(data.planHistory).toEqual([g.data.plan]);
    const updated = { ...g, data },
      next = {
        ...d,
        entities: d.entities.map((e) => (e.id === g.id ? updated : e)),
      };
    expect(savingSummary(next, updated, asOf).saved).toBe(250);
    expect(savingSummary(next, updated, asOf).completion).toBe("2027-02-22");
  });
  it("preserves a fixed number of months and recalculates monthly funding only once", () => {
    const g = goal({ plan: plan({ mode: "months", monthly: 50, months: 4 }) }),
      d = fundedDocument(g);
    const data = reviseHorizonBudget(d, g, car(650), true, asOf);
    expect(data.plan).toMatchObject({
      mode: "months",
      months: 4,
      deadline: "2027-02-22",
      monthly: 100,
    });
    expect(g.data.plan.monthly).toBe(50);
  });
  it("preserves a fixed deadline and accounts for confirmed deposits and withdrawals", () => {
    const g = goal({ plan: plan({ mode: "date", monthly: 50 }) }),
      d = fundedDocument(g);
    const data = reviseHorizonBudget(d, g, car(650), true, asOf);
    expect(data.plan).toMatchObject({
      mode: "date",
      deadline: "2026-12-22",
      monthly: 200,
    });
    expect(data.saved).toBe(100);
  });
  it("keeps a manual planned contribution in the forecast without treating it as already saved", () => {
    const d = fundedDocument(),
      g = d.entities[0];
    d.entities.push(
      deposit("future", 100, { status: "planned", date: "2026-12-22" }),
    );
    const data = reviseHorizonBudget(d, g, car(650), true, asOf);
    expect(reservedValue(d, g, asOf)).toBe(250);
    expect(data.plan.deadline).toBe("2027-01-22");
    expect(d.entities.find((e) => e.id === "future")?.data.status).toBe(
      "planned",
    );
  });
  it("aligns a reviewed travel date with a deadline-based contribution plan", () => {
    const g = goal({ plan: plan({ mode: "date" }) }),
      d = fundedDocument(g);
    const p = travel({
      days: 1,
      nights: 0,
      people: 1,
      transportCost: 1000,
      nightly: 0,
      foodDaily: 0,
      tours: 0,
      local: 0,
      additional: 0,
      contingency: 0,
    });
    const data = reviseHorizonBudget(d, g, p, true, asOf);
    expect(data.target).toBe(1000);
    expect(data.deadline).toBe("2027-01-22");
    expect(data.plan).toMatchObject({
      mode: "date",
      deadline: "2027-01-22",
      monthly: 250,
    });
  });
  it("clears an explicitly removed travel date and leaves a plan untouched when adaptation is disabled", () => {
    const g = goal({ planner: travel() }),
      d = fundedDocument(g);
    const data = reviseHorizonBudget(d, g, travel({ date: "" }), false, asOf);
    expect(data.deadline).toBe("");
    expect(data.plan).toEqual(g.data.plan);
  });
  it("handles completed targets and zero monthly deposits without inventing impossible dates", () => {
    const d = fundedDocument(),
      g = d.entities[0];
    const completed = reviseHorizonBudget(d, g, car(200), true, asOf);
    expect(completed.plan.deadline).toBe(asOf);
    const zero = goal({ plan: plan({ monthly: 0 }) });
    expect(
      reviseHorizonBudget(fundedDocument(zero), zero, car(650), true, asOf).plan
        .deadline,
    ).toBe("");
    expect(() =>
      reviseHorizonBudget(d, { ...g, kind: "trip" }, car(650), true, asOf),
    ).toThrow();
  });
  it("recalculates a partially paid current slot without counting its saved amount twice", () => {
    const g = goal({
      target: 1200,
      saved: 0,
      plan: plan({ mode: "date", monthly: 500, months: 3, firstDate: asOf }),
    });
    const d = document(
      g,
      deposit("partial", 200, {
        date: asOf,
        extra: false,
        streamId: "primary",
        scheduledDate: asOf,
      }),
    );
    const data = reviseHorizonBudget(d, g, car(1200), true, asOf);
    expect(data.plan.monthly).toBe(400);
    const updated = { ...g, data },
      next = {
        ...d,
        entities: d.entities.map((e) => (e.id === g.id ? updated : e)),
      };
    const summary = savingSummary(next, updated, asOf);
    expect(summary.saved).toBe(200);
    expect(summary.required).toBe(400);
    expect(summary.completion).toBe("2026-12-22");
    expect(
      summary.projection.find((row) => row.month === "2026-12")?.balance,
    ).toBe(1200);
    expect(d.entities.filter((e) => e.kind === "contribution")).toHaveLength(1);
  });
  it("uses water filling when the partial current payment exceeds the newly required monthly amount", () => {
    const g = goal({
      target: 1200,
      saved: 0,
      plan: plan({ mode: "date", monthly: 1000, months: 3, firstDate: asOf }),
    });
    const d = document(
      g,
      deposit("partial", 800, {
        date: asOf,
        extra: false,
        streamId: "primary",
        scheduledDate: asOf,
      }),
    );
    const data = reviseHorizonBudget(d, g, car(1200), true, asOf);
    // Current month's R$800 already exceed the new R$200; only Nov/Dec need R$200 each.
    expect(data.plan.monthly).toBe(200);
    const updated = { ...g, data },
      next = {
        ...d,
        entities: d.entities.map((e) => (e.id === g.id ? updated : e)),
      };
    const summary = savingSummary(next, updated, asOf);
    expect(summary.saved).toBe(800);
    expect(
      summary.projection.find((row) => row.month === "2026-10")?.monthly,
    ).toBe(0);
    expect(
      summary.projection.find((row) => row.month === "2026-12")?.balance,
    ).toBe(1200);
    expect(summary.completion).toBe("2026-12-22");
  });
  it("rejects an expired deadline without silently replacing the existing R$500 monthly amount with zero", () => {
    const expired = plan({
      mode: "date",
      monthly: 500,
      firstDate: "2026-01-22",
      deadline: "2026-03-22",
    });
    const g = goal({ target: 1200, saved: 0, plan: expired }),
      d = document(g),
      before = JSON.stringify(d);
    expect(() => resolvePlan(expired, 1200, 0, asOf)).toThrow();
    expect(() => reviseHorizonBudget(d, g, car(1200), true, asOf)).toThrow();
    expect(expired.monthly).toBe(500);
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe("safe budget review across concurrent edits", () => {
  it("keeps movement revisions deterministic across entity and vector key order", () => {
    const a = deposit();
    a.vector = { phone: 2, desktop: 1 };
    const b = deposit("b", 50, { status: "planned" });
    const first = document(goal(), a, b),
      second = document(b, { ...a, vector: { desktop: 1, phone: 2 } }, goal());
    expect(goalMovementRevision(first, "goal")).toBe(
      goalMovementRevision(second, "goal"),
    );
    second.entities.push(deposit("unrelated", 10, { goalId: "another-goal" }));
    expect(goalMovementRevision(first, "goal")).toBe(
      goalMovementRevision(second, "goal"),
    );
  });
  it("accepts an unchanged goal revision and does not block ordinary legacy edits without a precondition", () => {
    const d = fundedDocument(),
      g = d.entities[0],
      token = goalMovementRevision(d, g.id);
    expect(() => assertEditRevision(d, g.id, g.vector, token)).not.toThrow();
    expect(() => assertEditRevision(d, g.id)).not.toThrow();
  });
  it("rejects newer, older, concurrent, removed and deleted goal revisions", () => {
    const d = fundedDocument(),
      g = d.entities[0];
    const expectedVectors: Entity["vector"][] = [{ a: 0 }, { a: 2 }, { b: 1 }];
    for (const expected of expectedVectors)
      expect(() => assertEditRevision(d, g.id, expected)).toThrow();
    expect(() =>
      assertEditRevision(
        { ...d, entities: d.entities.filter((e) => e.id !== g.id) },
        g.id,
        g.vector,
      ),
    ).toThrow();
    expect(() =>
      assertEditRevision(
        {
          ...d,
          entities: d.entities.map((e) =>
            e.id === g.id ? { ...e, deleted: true } : e,
          ),
        },
        g.id,
        g.vector,
      ),
    ).toThrow();
  });
  it("rejects a review if a contribution is inserted, edited, deleted, or confirmed while it was open", () => {
    const d = fundedDocument(),
      g = d.entities[0],
      token = goalMovementRevision(d, g.id);
    const old = d.entities.find((e) => e.id === "deposit")!;
    const changes = [
      editDocument(d, deposit("new", 20), "phone"),
      editDocument(d, { ...old, data: { ...old.data, amount: 250 } }, "phone"),
      editDocument(d, { ...old, deleted: true }, "phone"),
      editDocument(
        d,
        { ...old, data: { ...old.data, status: "planned" } },
        "phone",
      ),
    ];
    for (const changed of changes)
      expect(() => assertEditRevision(changed, g.id, g.vector, token)).toThrow(
        /histórico/i,
      );
    const planned = editDocument(
      d,
      { ...old, data: { ...old.data, status: "planned" } },
      "desktop",
    );
    const plannedRevision = goalMovementRevision(planned, g.id);
    const confirmed = editDocument(
      planned,
      { ...old, data: { ...old.data, status: "confirmed" } },
      "phone",
    );
    expect(() =>
      assertEditRevision(confirmed, g.id, g.vector, plannedRevision),
    ).toThrow(/histórico/i);
    expect(() =>
      assertEditRevision(
        editDocument(d, deposit("other", 20, { goalId: "unrelated" }), "phone"),
        g.id,
        g.vector,
        token,
      ),
    ).not.toThrow();
  });
  it("rejects an unresolved conflict on the goal while allowing unrelated conflicts", () => {
    const d = fundedDocument(),
      g = d.entities[0];
    const local = editDocument(
      d,
      { ...g, data: { ...g.data, target: 500 } },
      "desktop",
    );
    const remote = editDocument(
      d,
      { ...g, data: { ...g.data, target: 600 } },
      "phone",
    );
    const merged = mergeDocuments(local, remote),
      current = merged.entities.find((e) => e.id === g.id)!;
    expect(merged.conflicts).toHaveLength(1);
    expect(() => assertEditRevision(merged, g.id, current.vector)).toThrow();
    const unrelated = {
      ...d,
      conflicts: [
        {
          id: "other-conflict",
          local: goal({ name: "Outro" }),
          remote: goal({ name: "Outro remoto" }),
        },
      ].map((c) => ({
        ...c,
        local: { ...c.local, id: "other" },
        remote: { ...c.remote, id: "other" },
      })),
    };
    expect(() =>
      assertEditRevision(
        unrelated,
        g.id,
        g.vector,
        goalMovementRevision(d, g.id),
      ),
    ).not.toThrow();
  });
  it("rejects an unresolved contribution conflict even when merge retains the expected local movement vector", () => {
    const initial = fundedDocument(),
      g = initial.entities[0],
      movement = initial.entities.find((e) => e.id === "deposit")!;
    const local = editDocument(
      initial,
      { ...movement, data: { ...movement.data, amount: 250 } },
      "desktop",
    );
    const remote = editDocument(
      initial,
      { ...movement, data: { ...movement.data, amount: 300 } },
      "phone",
    );
    const token = goalMovementRevision(local, g.id),
      merged = mergeDocuments(local, remote);
    expect(merged.conflicts).toHaveLength(1);
    expect(goalMovementRevision(merged, g.id)).toBe(token);
    expect(() => assertEditRevision(merged, g.id, g.vector, token)).toThrow();
  });
});
