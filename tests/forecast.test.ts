import { describe, expect, it } from "vitest";
import { emptyDocument, type Entity } from "../src/core/model";
import {
  forecastDefaults,
  forecastGoalImpact,
  freedomEstimate,
  projectForecast,
  validateForecast,
  type ForecastInput,
} from "../src/core/forecast";
import { lifePlan, projectPriorityBudget } from "../src/core/life";

const input = (patch: Partial<ForecastInput> = {}): ForecastInput => ({
  start: "2026-01-31",
  months: 12,
  initialCash: 1000,
  initialInvested: 0,
  goods: 0,
  liabilities: 0,
  reserved: 0,
  monthlyIncome: 2000,
  monthlyExpense: 1500,
  monthlyAllocation: 0,
  annualIncomeGrowth: 0,
  annualAllocationGrowth: 0,
  annualInflation: 0,
  annualReturn: 0,
  incomeChange: 0,
  expenseChange: 0,
  expenseReduction: 0,
  incomeLossStart: 1,
  incomeLossMonths: 0,
  incomeLossPercent: 100,
  target: 0,
  withdrawals: [],
  ...patch,
});
const entity = (
  id: string,
  kind: Entity["kind"],
  data: Entity["data"],
): Entity => ({
  id,
  kind,
  data,
  vector: { a: 1 },
  updatedAt: "2026-10-22T12:00:00Z",
});

describe("monthly financial forecast", () => {
  it("conserves principal at zero rates and uses complete future months", () => {
    const p = projectForecast(input());
    expect(p.points).toHaveLength(13);
    expect(p.points[1].date).toBe("2026-02-28");
    expect(p.points[2].date).toBe("2026-03-31");
    expect(p.last.financial).toBe(7000);
    expect(p.last.realNetWorth).toBe(7000);
    expect(p.last.accumulatedIncome).toBe(24000);
    expect(p.last.accumulatedExpense).toBe(18000);
  });
  it("treats investment contributions as internal allocations, never as a second expense", () => {
    const plain = projectForecast(input());
    const invested = projectForecast(
      input({
        monthlyAllocation: 500,
        reserved: 2000,
        goods: 10000,
        liabilities: 3000,
      }),
    );
    expect(invested.last.financial).toBe(plain.last.financial);
    expect(invested.last.cash).toBe(1000);
    expect(invested.last.invested).toBe(6000);
    expect(invested.last.netWorth).toBe(14000);
    expect(invested.last.freeFinancial).toBe(5000);
    expect(invested.last.accumulatedExpense).toBe(18000);
    expect(invested.last.goalCapacity).toBe(0);
  });
  it("uses equivalent annual return and gives new allocations returns from the following month", () => {
    const p = projectForecast(
      input({
        months: 12,
        initialCash: 0,
        initialInvested: 1000,
        monthlyIncome: 0,
        monthlyExpense: 0,
        annualReturn: 12,
      }),
    );
    expect(p.last.invested).toBeCloseTo(1120, 0);
    const endOfMonth = projectForecast(
      input({
        months: 1,
        initialCash: 1000,
        monthlyIncome: 0,
        monthlyExpense: 0,
        annualReturn: 100,
        monthlyAllocation: 1000,
      }),
    );
    expect(endOfMonth.last.investmentReturn).toBe(0);
    expect(endOfMonth.last.financial).toBe(1000);
  });
  it("discounts purchasing power without treating inflation as an additional cash withdrawal", () => {
    const p = projectForecast(
      input({
        initialCash: 1200,
        monthlyIncome: 0,
        monthlyExpense: 0,
        annualInflation: 20,
      }),
    );
    expect(p.last.financial).toBe(1200);
    expect(p.last.realNetWorth).toBe(1000);
    expect(p.last.accumulatedExpense).toBe(0);
  });
  it("inflates expenses gradually and allows negative investment returns", () => {
    const p = projectForecast(
      input({
        months: 13,
        initialInvested: 1000,
        annualReturn: -50,
        annualInflation: 10,
        annualIncomeGrowth: 20,
      }),
    );
    expect(p.points[1].expense).toBe(1500);
    expect(p.points[13].expense).toBe(1650);
    expect(p.points[13].income).toBe(2400);
    expect(p.points[12].invested).toBeCloseTo(500, 0);
  });
  it("does not invent investment money when the cash account is insufficient", () => {
    const p = projectForecast(
      input({
        months: 2,
        initialCash: 100,
        monthlyIncome: 0,
        monthlyExpense: 150,
        monthlyAllocation: 300,
        initialInvested: 1000,
      }),
    );
    expect(p.points[1].cash).toBe(-50);
    expect(p.firstShortfall?.month).toBe(1);
    expect(p.last.invested).toBe(1000);
    expect(p.last.cash).toBe(-200);
    expect(p.unmetAllocation).toBe(600);
    expect(p.last.goalCapacity).toBe(0);
  });
  it("limits allocations to available cash and preserves existing deficits", () => {
    const p = projectForecast(
      input({
        months: 1,
        initialCash: 100,
        monthlyIncome: 0,
        monthlyExpense: 0,
        monthlyAllocation: 300,
      }),
    );
    expect(p.last.allocation).toBe(100);
    expect(p.last.invested).toBe(100);
    expect(p.last.cash).toBe(0);
    expect(p.unmetAllocation).toBe(200);
    expect(
      projectForecast(input({ initialCash: -10 })).firstShortfall?.month,
    ).toBe(0);
  });
  it("applies temporary loss only inside its selected inclusive-start exclusive-end window", () => {
    const p = projectForecast(
      input({
        months: 4,
        incomeLossStart: 2,
        incomeLossMonths: 2,
        incomeLossPercent: 50,
      }),
    );
    expect(p.points.slice(1).map((r) => r.income)).toEqual([
      2000, 1000, 1000, 2000,
    ]);
    expect(p.last.financial).toBe(1000);
  });
  it("counts withdrawals once, ignores occurrences outside the period, and caps cost reduction at zero", () => {
    const p = projectForecast(
      input({
        months: 2,
        expenseReduction: 2000,
        withdrawals: [
          { id: "a", month: 2, amount: 300, description: "Retirada" },
          { id: "b", month: 3, amount: 900, description: "Fora do prazo" },
        ],
      }),
    );
    expect(p.last.accumulatedExpense).toBe(0);
    expect(p.last.accumulatedWithdrawals).toBe(300);
    expect(p.last.financial).toBe(4700);
  });
  it("compares nominal and real target dates including the existing goal and no achievable target", () => {
    const reached = projectForecast(input({ target: 2000 }));
    expect(reached.reachedNominal?.month).toBe(2);
    expect(projectForecast(input({ target: 1000 })).reachedReal?.month).toBe(0);
    const inflated = projectForecast(
      input({
        target: 2000,
        annualInflation: 100,
        monthlyExpense: 0,
        monthlyIncome: 100,
      }),
    );
    expect(inflated.reachedNominal?.month).toBe(10);
    expect(inflated.reachedReal).toBeUndefined();
    expect(
      projectForecast(input({ target: 1e9 })).reachedNominal,
    ).toBeUndefined();
  });
  it("does not mutate any scenario input and supports 600 months without hidden nonzero rates", () => {
    const v = input({ months: 600 });
    const before = JSON.stringify(v);
    expect(projectForecast(v).last.financial).toBe(301000);
    expect(JSON.stringify(v)).toBe(before);
  });
  it("rejects invalid rates, dates, money, horizons and numeric overflows", () => {
    for (const patch of [
      { months: 0 },
      { months: 601 },
      { months: 1.5 },
      { annualReturn: -100 },
      { annualIncomeGrowth: NaN },
      { initialCash: Infinity },
      { monthlyIncome: -1 },
      { annualInflation: -1 },
      { incomeChange: -101 },
      { start: "2026-02-30" },
      { incomeLossMonths: 2.5 },
      { withdrawals: [{ id: "x", month: 1, amount: 0, description: "x" }] },
    ])
      expect(() => validateForecast(input(patch))).toThrow();
    expect(() =>
      projectForecast(
        input({ months: 600, annualIncomeGrowth: 100, monthlyIncome: 1e12 }),
      ),
    ).toThrow(/limite/);
  });
});

describe("forecast integration without duplicated wealth", () => {
  it("derives confirmed balances, separates investments, goods and debt and never adds reservations", () => {
    const d = emptyDocument();
    d.entities = [
      entity("cash", "account", { balance: 1000, date: "2026-01-01" }),
      entity("other", "account", { balance: 1000, date: "2026-01-01" }),
      entity("investment", "asset", { type: "fixed", amount: 5000 }),
      entity("home", "asset", { type: "goods", amount: 10000 }),
      entity("debt", "asset", { type: "debt", amount: 3000 }),
      entity("goal", "goal", {
        name: "Reserva",
        target: 1000,
        saved: 600,
        priority: 3,
        plan: { monthly: 100 },
      }),
      entity("transfer", "transaction", {
        type: "transfer",
        date: "2026-10-01",
        status: "confirmed",
        accountId: "cash",
        targetAccountId: "other",
        amount: 100,
      }),
      entity("income", "transaction", {
        type: "income",
        date: "2026-09-01",
        status: "confirmed",
        accountId: "cash",
        amount: 3000,
      }),
      entity("expense", "transaction", {
        type: "expense",
        date: "2026-09-01",
        status: "confirmed",
        accountId: "cash",
        amount: 900,
      }),
      entity("planned", "transaction", {
        type: "income",
        date: "2026-10-01",
        status: "planned",
        accountId: "cash",
        amount: 100000,
      }),
    ];
    const c = forecastDefaults(d, "2026-10-22");
    expect(c.input.initialCash).toBe(4100);
    expect(c.input.initialInvested).toBe(5000);
    expect(c.input.goods).toBe(10000);
    expect(c.input.liabilities).toBe(3000);
    expect(c.input.reserved).toBe(600);
    expect(c.input.monthlyIncome).toBe(3000);
    expect(c.input.monthlyExpense).toBe(900);
    expect(c.monthlyGoalPlan).toBe(100);
    expect(projectForecast(c.input).points[0].netWorth).toBe(16100);
    expect(c.goals[0].remaining).toBe(400);
    expect(c.input.annualReturn).toBe(0);
  });
  it("explains missing history rather than introducing example income", () => {
    const c = forecastDefaults(emptyDocument(), "2026-10-22");
    expect(c.input.monthlyIncome).toBe(0);
    expect(c.input.monthlyExpense).toBe(0);
    expect(c.historyMonths).toBe(0);
    expect(c.partial).toBe(true);
  });
  it("uses one observed month without diluting income or expenses over unknown months", () => {
    const d = emptyDocument();
    d.entities = [
      entity("income", "transaction", {
        status: "confirmed",
        type: "income",
        date: "2026-09-01",
        amount: 6000,
      }),
      entity("expense", "transaction", {
        status: "confirmed",
        type: "expense",
        date: "2026-09-05",
        amount: 3000,
      }),
    ];
    const c = forecastDefaults(d, "2026-10-22");
    expect(c.input.monthlyIncome).toBe(6000);
    expect(c.input.monthlyExpense).toBe(3000);
    expect(c.historyMonths).toBe(1);
    expect(c.partial).toBe(true);
    expect(c.incomeBasis).toContain("1 de 3 meses com registros");
  });
  it("averages only observed complete months, or uses the current month explicitly as partial", () => {
    const d = emptyDocument();
    d.entities = [
      entity("jul", "transaction", {
        status: "confirmed",
        type: "income",
        date: "2026-07-01",
        amount: 4000,
      }),
      entity("sep", "transaction", {
        status: "confirmed",
        type: "income",
        date: "2026-09-01",
        amount: 6000,
      }),
    ];
    const two = forecastDefaults(d, "2026-10-22");
    expect(two.input.monthlyIncome).toBe(5000);
    expect(two.historyMonths).toBe(2);
    expect(two.partial).toBe(true);
    d.entities = [
      entity("current", "transaction", {
        status: "confirmed",
        type: "income",
        date: "2026-10-01",
        amount: 5000,
      }),
    ];
    const current = forecastDefaults(d, "2026-10-22");
    expect(current.input.monthlyIncome).toBe(5000);
    expect(current.incomeBasis).toContain("mês atual incompleto");
    expect(current.historyMonths).toBe(1);
    expect(current.partial).toBe(true);
  });
  it("uses assets and card liabilities as of the reference date, retaining already purchased future invoices", () => {
    const d = emptyDocument();
    d.entities = [
      entity("cash", "account", { balance: 1000, date: "2026-01-01" }),
      entity("invested", "asset", {
        type: "fixed",
        amount: 500,
        date: "2026-10-01",
      }),
      entity("future-investment", "asset", {
        type: "fixed",
        amount: 100000,
        date: "2027-01-01",
      }),
      entity("future-house", "asset", {
        type: "goods",
        amount: 100000,
        date: "2027-01-01",
      }),
      entity("future-debt", "asset", {
        type: "debt",
        amount: 100000,
        date: "2027-01-01",
      }),
      entity("card", "card", { limit: 100000 }),
      entity("bought", "transaction", {
        type: "expense",
        payment: "credit",
        status: "confirmed",
        cardId: "card",
        amount: 300,
        purchaseDate: "2026-10-01",
        date: "2026-12-10",
      }),
      entity("not-bought", "transaction", {
        type: "expense",
        payment: "credit",
        status: "confirmed",
        cardId: "card",
        amount: 700,
        purchaseDate: "2026-12-01",
        date: "2026-12-10",
      }),
    ];
    const c = forecastDefaults(d, "2026-10-22");
    expect(c.input.initialCash).toBe(1000);
    expect(c.input.initialInvested).toBe(500);
    expect(c.input.goods).toBe(0);
    expect(c.input.liabilities).toBe(300);
    expect(c.input.monthlyExpense).toBe(0);
    expect(projectForecast(c.input).points[0].netWorth).toBe(1200);
  });
  it("allocates the virtual savings pool sequentially without spending it twice or mutating goals", () => {
    const goals = [
      { id: "a", name: "Primeira", remaining: 750, priority: 3, deadline: "" },
      { id: "b", name: "Segunda", remaining: 500, priority: 1, deadline: "" },
    ];
    const before = JSON.stringify(goals);
    const result = projectForecast(input({ months: 3 }));
    const impact = forecastGoalImpact(result, goals);
    expect(impact[0].completion).toBe("2026-03-31");
    expect(impact[1].completion).toBe("2026-04-30");
    expect(impact.map((g) => g.projected)).toEqual([750, 500]);
    expect(result.last.financial).toBe(2500);
    expect(JSON.stringify(goals)).toBe(before);
  });
  it("respects dependencies with the same next-month convention as the Life budget", () => {
    const d = emptyDocument();
    d.entities = [
      entity("a", "goal", {
        name: "Primeira",
        target: 100,
        saved: 0,
        priority: 1,
      }),
      entity("b", "goal", {
        name: "Segunda",
        target: 100,
        saved: 0,
        priority: 3,
        dependsOn: ["a"],
      }),
    ];
    const context = forecastDefaults(d, "2026-10-22");
    const result = projectForecast({
      ...context.input,
      months: 3,
      monthlyIncome: 200,
    });
    const impact = forecastGoalImpact(
      result,
      context.goals,
      context.completedGoalIds,
    );
    const life = projectPriorityBudget(
      lifePlan(d, "2026-10-22"),
      200,
      "2026-10-22",
      3,
    );
    expect(impact.find((g) => g.id === "a")?.completion).toBe("2026-11-22");
    expect(impact.find((g) => g.id === "b")?.completion).toBe("2026-12-22");
    for (const g of impact)
      expect(g.completion).toBe(life.find((n) => n.id === g.id)?.completion);
    expect(impact.reduce((sum, g) => sum + g.projected, 0)).toBe(200);
  });
  it("does not invent goal dates for cycles or missing prerequisites, but recognises completed ones", () => {
    const result = projectForecast(input());
    const goals = [
      {
        id: "a",
        name: "A",
        remaining: 100,
        priority: 2,
        deadline: "",
        dependsOn: ["b"],
      },
      {
        id: "b",
        name: "B",
        remaining: 100,
        priority: 1,
        deadline: "",
        dependsOn: ["a"],
      },
    ];
    expect(
      forecastGoalImpact(result, goals).every(
        (g) => !g.completion && g.projected === 0,
      ),
    ).toBe(true);
    expect(
      forecastGoalImpact(
        result,
        [{ ...goals[0], dependsOn: ["completed"] }],
        ["completed"],
      )[0].completion,
    ).toBe("2026-02-28");
    expect(
      forecastGoalImpact(result, [{ ...goals[0], dependsOn: ["missing"] }])[0]
        .completion,
    ).toBe("");
  });
  it("calculates an explicit hypothetical freedom target and rejects zero withdrawal promises", () => {
    expect(freedomEstimate(3000, 4, 900000)).toEqual({
      target: 900000,
      monthlyHypothetical: 3000,
      coverage: 100,
    });
    expect(freedomEstimate(0, 4, 1000).coverage).toBeNull();
    expect(() => freedomEstimate(1000, 0, 100000)).toThrow();
  });
});
