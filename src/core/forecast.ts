import { addMonths, rows, today, type Document } from "./model";
import { accountBalance, cardOutstanding, financialAsOf } from "./finance";
import {
  objectives,
  reservedValue,
  roundMoney,
  validDate,
} from "./contributions";
import { targetValue } from "./saving-targets";
import { dependencyIds } from "./life";

export type ForecastWithdrawal = {
  id: string;
  month: number;
  amount: number;
  description: string;
};
export type ForecastInput = {
  start: string;
  months: number;
  initialCash: number;
  initialInvested: number;
  goods: number;
  liabilities: number;
  reserved: number;
  monthlyIncome: number;
  monthlyExpense: number;
  monthlyAllocation: number;
  annualIncomeGrowth: number;
  annualAllocationGrowth: number;
  annualInflation: number;
  annualReturn: number;
  incomeChange: number;
  expenseChange: number;
  expenseReduction: number;
  incomeLossStart: number;
  incomeLossMonths: number;
  incomeLossPercent: number;
  target: number;
  withdrawals: ForecastWithdrawal[];
};
export type ForecastPoint = {
  month: number;
  date: string;
  cash: number;
  invested: number;
  financial: number;
  netWorth: number;
  realNetWorth: number;
  freeFinancial: number;
  income: number;
  expense: number;
  withdrawal: number;
  allocation: number;
  requestedAllocation: number;
  investmentReturn: number;
  goalCapacity: number;
  inflationFactor: number;
  accumulatedIncome: number;
  accumulatedExpense: number;
  accumulatedReturns: number;
  accumulatedAllocations: number;
  accumulatedWithdrawals: number;
};
export type ForecastResult = {
  points: ForecastPoint[];
  last: ForecastPoint;
  reachedNominal: ForecastPoint | undefined;
  reachedReal: ForecastPoint | undefined;
  firstShortfall: ForecastPoint | undefined;
  unmetAllocation: number;
};
export type ForecastScenario = {
  id: string;
  name: string;
  input: ForecastInput;
};
const MAX_MONEY = 1e12;

export function validateForecast(v: ForecastInput) {
  if (!validDate(v.start)) throw Error("Escolha uma data inicial válida.");
  if (!Number.isInteger(v.months) || v.months < 1 || v.months > 600)
    throw Error("O período deve ter entre 1 e 600 meses inteiros.");
  const fields: (keyof ForecastInput)[] = [
    "initialCash",
    "initialInvested",
    "goods",
    "liabilities",
    "reserved",
    "monthlyIncome",
    "monthlyExpense",
    "monthlyAllocation",
    "expenseReduction",
    "target",
  ];
  for (const key of fields) {
    const value = v[key];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      Math.abs(value) > MAX_MONEY ||
      (key !== "initialCash" && value < 0)
    )
      throw Error(
        "Confira os valores: use números válidos, positivos e até R$ 1 trilhão. Apenas o saldo em contas pode ser negativo.",
      );
  }
  for (const key of [
    "annualIncomeGrowth",
    "annualAllocationGrowth",
    "annualReturn",
  ] as const)
    if (!Number.isFinite(v[key]) || v[key] <= -100 || v[key] > 100)
      throw Error("Taxas anuais devem ser maiores que −100% e de até 100%.");
  if (
    !Number.isFinite(v.annualInflation) ||
    v.annualInflation < 0 ||
    v.annualInflation > 100
  )
    throw Error("A inflação anual deve ficar entre 0% e 100%.");
  for (const key of ["incomeChange", "expenseChange"] as const)
    if (!Number.isFinite(v[key]) || v[key] < -100 || v[key] > 500)
      throw Error(
        "A mudança de renda ou despesa deve ficar entre −100% e 500%.",
      );
  if (
    !Number.isInteger(v.incomeLossStart) ||
    v.incomeLossStart < 1 ||
    v.incomeLossStart > 600 ||
    !Number.isInteger(v.incomeLossMonths) ||
    v.incomeLossMonths < 0 ||
    v.incomeLossMonths > 600 ||
    !Number.isFinite(v.incomeLossPercent) ||
    v.incomeLossPercent < 0 ||
    v.incomeLossPercent > 100
  )
    throw Error(
      "Confira o período de perda de renda e seu percentual (0% a 100%).",
    );
  if (!Array.isArray(v.withdrawals) || v.withdrawals.length > 120)
    throw Error("Use até 120 retiradas por cenário.");
  for (const w of v.withdrawals)
    if (
      !Number.isInteger(w.month) ||
      w.month < 1 ||
      w.month > 600 ||
      !Number.isFinite(w.amount) ||
      w.amount <= 0 ||
      w.amount > MAX_MONEY ||
      typeof w.description !== "string" ||
      w.description.length > 200
    )
      throw Error(
        "Cada retirada precisa de um mês de 1 a 600, uma descrição e um valor positivo válido.",
      );
}

/** Each row is the end of one complete future month. Cash flows occur after returns.
 * Allocations only transfer cash to investments; goal reserves remain a subset of wealth.
 * Debt and physical goods stay at their initial nominal value (no implicit amortisation).
 */
export function projectForecast(input: ForecastInput): ForecastResult {
  validateForecast(input);
  let cash = roundMoney(input.initialCash),
    invested = roundMoney(input.initialInvested);
  let accumulatedIncome = 0,
    accumulatedExpense = 0,
    accumulatedReturns = 0,
    accumulatedAllocations = 0,
    accumulatedWithdrawals = 0,
    unmetAllocation = 0;
  const rate = Math.pow(1 + input.annualReturn / 100, 1 / 12) - 1;
  const points: ForecastPoint[] = [];
  const makePoint = (
    month: number,
    values: Partial<ForecastPoint> = {},
  ): ForecastPoint => {
    const financial = roundMoney(cash + invested);
    const netWorth = roundMoney(financial + input.goods - input.liabilities);
    const inflationFactor = Math.pow(
      1 + input.annualInflation / 100,
      month / 12,
    );
    if (
      ![cash, invested, netWorth].every(
        (v) => Number.isFinite(v) && Math.abs(v) < 1e15,
      )
    )
      throw Error(
        "A projeção excedeu o limite de cálculo. Reduza o prazo ou as taxas.",
      );
    return {
      month,
      date: addMonths(input.start, month),
      cash,
      invested,
      financial,
      netWorth,
      realNetWorth: roundMoney(netWorth / inflationFactor),
      freeFinancial: roundMoney(financial - input.reserved),
      income: 0,
      expense: 0,
      withdrawal: 0,
      allocation: 0,
      requestedAllocation: 0,
      investmentReturn: 0,
      goalCapacity: 0,
      inflationFactor,
      accumulatedIncome,
      accumulatedExpense,
      accumulatedReturns,
      accumulatedAllocations,
      accumulatedWithdrawals,
      ...values,
    };
  };
  points.push(makePoint(0));
  for (let month = 1; month <= input.months; month++) {
    const elapsed = (month - 1) / 12;
    const incomeLoss =
      month >= input.incomeLossStart &&
      month < input.incomeLossStart + input.incomeLossMonths;
    const income = roundMoney(
      input.monthlyIncome *
        Math.pow(1 + input.annualIncomeGrowth / 100, elapsed) *
        (1 + input.incomeChange / 100) *
        (incomeLoss ? 1 - input.incomeLossPercent / 100 : 1),
    );
    const expense = roundMoney(
      Math.max(
        0,
        input.monthlyExpense *
          Math.pow(1 + input.annualInflation / 100, elapsed) *
          (1 + input.expenseChange / 100) -
          input.expenseReduction,
      ),
    );
    const withdrawal = roundMoney(
      input.withdrawals
        .filter((w) => w.month === month)
        .reduce((s, w) => s + w.amount, 0),
    );
    const investmentReturn = roundMoney(invested * rate);
    cash = roundMoney(cash + income - expense - withdrawal);
    invested = roundMoney(invested + investmentReturn);
    const requestedAllocation = roundMoney(
      input.monthlyAllocation *
        Math.pow(1 + input.annualAllocationGrowth / 100, elapsed),
    );
    const allocation = Math.min(requestedAllocation, Math.max(0, cash));
    cash = roundMoney(cash - allocation);
    invested = roundMoney(invested + allocation);
    unmetAllocation = roundMoney(
      unmetAllocation + requestedAllocation - allocation,
    );
    accumulatedIncome = roundMoney(accumulatedIncome + income);
    accumulatedExpense = roundMoney(accumulatedExpense + expense);
    accumulatedReturns = roundMoney(accumulatedReturns + investmentReturn);
    accumulatedAllocations = roundMoney(accumulatedAllocations + allocation);
    accumulatedWithdrawals = roundMoney(accumulatedWithdrawals + withdrawal);
    const goalCapacity =
      cash < 0
        ? 0
        : roundMoney(Math.max(0, income - expense - allocation - withdrawal));
    points.push(
      makePoint(month, {
        income,
        expense,
        withdrawal,
        allocation,
        requestedAllocation,
        investmentReturn,
        goalCapacity,
      }),
    );
  }
  return {
    points,
    last: points[points.length - 1],
    reachedNominal:
      input.target > 0
        ? points.find((p) => p.netWorth >= input.target)
        : undefined,
    reachedReal:
      input.target > 0
        ? points.find((p) => p.realNetWorth >= input.target)
        : undefined,
    firstShortfall: points.find((p) => p.cash < 0),
    unmetAllocation,
  };
}

export type ForecastContext = {
  input: ForecastInput;
  incomeBasis: string;
  historyMonths: number;
  partial: boolean;
  monthlyGoalPlan: number;
  completedGoalIds: string[];
  goals: {
    id: string;
    name: string;
    remaining: number;
    priority: number;
    deadline: string;
    dependsOn?: string[];
  }[];
};
/** Defaults use observed confirmed months; a month without records is unknown, not zero. */
export function forecastDefaults(
  doc: Document,
  asOf = today(),
): ForecastContext {
  doc = financialAsOf(doc, asOf);
  const month = asOf.slice(0, 7);
  const fullMonths = [3, 2, 1].map((n) => addMonths(asOf, -n, 1).slice(0, 7));
  const confirmed = rows(doc, "transaction").filter(
    (e) =>
      e.data.status === "confirmed" &&
      e.data.date <= asOf &&
      ["income", "expense"].includes(e.data.type) &&
      !e.data.cardPayment,
  );
  const observedMonths = fullMonths.filter((candidate) =>
    confirmed.some((e) => e.data.date.startsWith(candidate)),
  );
  const hasObservedHistory = observedMonths.length > 0;
  const currentObserved = confirmed.some((e) => e.data.date.startsWith(month));
  const basis = hasObservedHistory ? observedMonths : [month];
  const average = (type: string) =>
    roundMoney(
      confirmed
        .filter(
          (e) =>
            e.data.type === type && basis.includes(e.data.date.slice(0, 7)),
        )
        .reduce((s, e) => s + Number(e.data.amount || 0), 0) / basis.length,
    );
  const assets = rows(doc, "asset");
  const sumAsset = (types: string[]) =>
    roundMoney(
      assets
        .filter((a) => types.includes(a.data.type))
        .reduce((s, a) => s + Math.max(0, Number(a.data.amount) || 0), 0),
    );
  const allGoals = objectives(doc);
  const goals = allGoals
    .filter((g) => !g.data.archived)
    .map((g) => ({
      id: g.id,
      name: String(g.data.name || "Horizonte"),
      remaining: roundMoney(
        Math.max(0, targetValue(g) - reservedValue(doc, g, asOf)),
      ),
      priority: Number(g.data.priority) || 0,
      dependsOn: dependencyIds(g),
      deadline: String(
        g.kind === "trip" ? g.data.start || "" : g.data.deadline || "",
      ),
    }))
    .filter((g) => g.remaining > 0)
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (a.deadline || "9999").localeCompare(b.deadline || "9999") ||
        a.id.localeCompare(b.id),
    );
  return {
    input: {
      start: asOf,
      months: 60,
      initialCash: roundMoney(
        rows(doc, "account").reduce(
          (s, a) => s + accountBalance(doc, a.id, asOf),
          0,
        ),
      ),
      initialInvested: sumAsset(["fixed", "variable", "other"]),
      goods: sumAsset(["goods"]),
      liabilities: roundMoney(
        sumAsset(["debt"]) +
          rows(doc, "card").reduce((s, c) => s + cardOutstanding(doc, c.id), 0),
      ),
      reserved: roundMoney(
        allGoals.reduce((s, g) => s + reservedValue(doc, g, asOf), 0),
      ),
      monthlyIncome: average("income"),
      monthlyExpense: average("expense"),
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
    },
    incomeBasis: hasObservedHistory
      ? `${fullMonths[0]} a ${fullMonths[2]} · ${observedMonths.length} de 3 meses com registros`
      : `${month} · mês atual incompleto`,
    historyMonths: hasObservedHistory
      ? observedMonths.length
      : currentObserved
        ? 1
        : 0,
    partial: observedMonths.length < 3,
    monthlyGoalPlan: roundMoney(
      allGoals
        .filter((g) => !g.data.archived)
        .reduce(
          (s, g) => s + Math.max(0, Number(g.data.plan?.monthly) || 0),
          0,
        ),
    ),
    completedGoalIds: allGoals
      .filter((g) => reservedValue(doc, g, asOf) >= targetValue(g))
      .map((g) => g.id),
    goals,
  };
}

/** Virtual prioritised distribution only: does not spend cash or change any persisted goal. */
export function forecastGoalImpact(
  result: ForecastResult,
  goals: ForecastContext["goals"],
  completedGoalIds: string[] = [],
) {
  const remaining = goals.map((g) => ({ ...g, projected: 0, completion: "" }));
  const completed = new Set(completedGoalIds);
  for (const p of result.points.slice(1)) {
    let budget = p.goalCapacity;
    const eligibleAtStart = new Set(completed);
    for (const g of remaining) {
      if (g.completion || g.dependsOn?.some((id) => !eligibleAtStart.has(id)))
        continue;
      const take = Math.min(budget, Math.max(0, g.remaining - g.projected));
      g.projected = roundMoney(g.projected + take);
      budget = roundMoney(budget - take);
      if (!g.completion && g.projected >= g.remaining) {
        g.completion = p.date;
        completed.add(g.id);
      }
      if (budget <= 0) break;
    }
  }
  return remaining;
}

export function freedomEstimate(
  monthlyExpense: number,
  annualWithdrawalPercent: number,
  capital: number,
) {
  if (
    ![monthlyExpense, annualWithdrawalPercent, capital].every(
      Number.isFinite,
    ) ||
    monthlyExpense < 0 ||
    capital < 0 ||
    annualWithdrawalPercent <= 0 ||
    annualWithdrawalPercent > 100
  )
    throw Error(
      "Informe despesas e patrimônio positivos e uma retirada anual maior que zero e de até 100%.",
    );
  const target = roundMoney(
    (monthlyExpense * 12) / (annualWithdrawalPercent / 100),
  );
  const monthlyHypothetical = roundMoney(
    (capital * annualWithdrawalPercent) / 100 / 12,
  );
  return {
    target,
    monthlyHypothetical,
    coverage:
      monthlyExpense > 0 ? (monthlyHypothetical / monthlyExpense) * 100 : null,
  };
}
