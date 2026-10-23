import { addMonths, today, type Document, type Entity } from "./model";
import {
  confirmedMovements,
  fundedOccurrences,
  manualPlannedStreams,
  nextDay,
  objectives,
  remainingOccurrences,
  roundMoney,
  validDate,
} from "./contributions";
import { savingSummary } from "./saving-targets";

export type LifeNode = {
  goal: Entity;
  id: string;
  name: string;
  priority: number;
  dependsOn: string[];
  target: number;
  saved: number;
  remaining: number;
  percent: number;
  completed: boolean;
  completedDate: string;
  desired: string;
  baseCompletion: string;
  completion: string;
  start: string;
  delayDays: number;
  blocked: boolean;
  reason: string;
  depth: number;
  monthlyPlanned: number;
};
export const dependencyIds = (goal: Entity): string[] =>
  Array.isArray(goal.data.dependsOn)
    ? [
        ...new Set(
          goal.data.dependsOn.filter(
            (id: unknown): id is string => typeof id === "string",
          ),
        ),
      ]
    : [];
const daysBetween = (from: string, to: string) =>
  Math.max(
    0,
    Math.round(
      (Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) /
        86400000,
    ),
  );
const after = (date: string) => nextDay(date, 1);

/** Validates only the edited chain, tolerating unrelated legacy records. No write is performed. */
export function validateDependencies(
  doc: Document,
  goalId: string,
  ids: string[],
) {
  const all = objectives(doc);
  const byId = new Map(all.map((g) => [g.id, g]));
  if (!byId.has(goalId))
    throw Error("Este horizonte não está mais disponível.");
  if (
    !Array.isArray(ids) ||
    ids.some((id) => typeof id !== "string") ||
    ids.length > 100
  )
    throw Error("Selecione até 100 horizontes como pré-requisitos.");
  if (new Set(ids).size !== ids.length)
    throw Error("Um pré-requisito não pode aparecer duas vezes.");
  if (ids.includes(goalId))
    throw Error("Um horizonte não pode depender dele mesmo.");
  const path = new Set<string>();
  const finished = new Set<string>();
  const visit = (id: string) => {
    if (path.size >= 500)
      throw Error(
        "A sequência é muito longa. Organize até 500 níveis de dependências.",
      );
    if (path.has(id))
      throw Error("Essa dependência criaria um ciclo entre horizontes.");
    if (finished.has(id)) return;
    const goal = byId.get(id);
    if (!goal)
      throw Error(
        "Um pré-requisito foi removido ou não existe. Revise as dependências.",
      );
    path.add(id);
    for (const dependency of id === goalId ? ids : dependencyIds(goal))
      visit(dependency);
    path.delete(id);
    finished.add(id);
  };
  visit(goalId);
}

function knownCompletion(
  doc: Document,
  goal: Entity,
  target: number,
  asOf: string,
) {
  let balance = Number(goal.data.saved) || 0;
  if (balance >= target) return "";
  let completion = "";
  for (const movement of confirmedMovements(doc, goal.id, asOf).sort(
    (a, b) =>
      a.data.date.localeCompare(b.data.date) ||
      Number(a.data.direction === "withdrawal") -
        Number(b.data.direction === "withdrawal"),
  )) {
    balance = roundMoney(
      balance +
        (movement.data.direction === "withdrawal" ? -1 : 1) *
          Number(movement.data.amount),
    );
    if (!completion && balance >= target) completion = movement.data.date;
  }
  return completion;
}

/** Uses the existing saving engine. Dependencies only shift an estimate, never its real plan. */
export function lifePlan(doc: Document, asOf = today()): LifeNode[] {
  if (!validDate(asOf)) throw Error("Data de referência inválida.");
  const nodes = objectives(doc).map((goal): LifeNode => {
    const s = savingSummary(doc, goal, asOf);
    const completed = s.remaining === 0;
    const streams = {
      ...s.plan,
      extras: [...(s.plan.extras ?? []), ...manualPlannedStreams(doc, goal.id)],
    };
    const next = completed
      ? undefined
      : remainingOccurrences(
          streams,
          asOf,
          addMonths(asOf, 600),
          fundedOccurrences(doc, goal.id, asOf),
        )[0];
    return {
      goal,
      id: goal.id,
      name: String(goal.data.name || "Horizonte"),
      priority: Number(goal.data.priority) || 0,
      dependsOn: dependencyIds(goal),
      target: s.target,
      saved: s.saved,
      remaining: s.remaining,
      percent: s.target > 0 ? (s.saved / s.target) * 100 : 100,
      completed,
      completedDate: completed
        ? knownCompletion(doc, goal, s.target, asOf)
        : "",
      desired: s.desired,
      baseCompletion: completed ? "" : s.completion || "",
      completion: completed ? "" : s.completion || "",
      start: next?.date || asOf,
      delayDays: 0,
      blocked: false,
      reason: "",
      depth: 0,
      monthlyPlanned: s.monthlyPlanned,
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const done = new Set<string>(),
    visiting = new Set<string>();
  const resolve = (node: LifeNode): LifeNode => {
    if (done.has(node.id)) return node;
    if (node.completed) {
      done.add(node.id);
      return node;
    }
    if (visiting.has(node.id))
      return {
        ...node,
        blocked: true,
        completion: "",
        reason: "Dependências em ciclo. Revise a sequência.",
      };
    if (visiting.size >= 500)
      return {
        ...node,
        blocked: true,
        completion: "",
        reason: "Sequência muito longa para estimar. Revise as dependências.",
      };
    visiting.add(node.id);
    let earliest = node.start;
    for (const id of node.dependsOn) {
      const dependency = byId.get(id);
      if (!dependency) {
        node.blocked = true;
        node.reason = "Um pré-requisito foi removido ou não existe.";
        continue;
      }
      const previous = resolve(dependency);
      node.depth = Math.max(
        node.depth,
        Math.min(nodes.length, previous.depth + 1),
      );
      if (previous.completed) continue;
      if (previous.goal.data.archived) {
        node.blocked = true;
        node.reason = "Um pré-requisito está arquivado sem concluir.";
        continue;
      }
      if (previous.blocked || !previous.completion) {
        node.blocked = true;
        node.reason = previous.blocked
          ? "A sequência precisa de revisão antes de estimar uma data."
          : "Um pré-requisito ainda não tem previsão de conclusão.";
        continue;
      }
      const next = after(previous.completion);
      if (next > earliest) earliest = next;
    }
    visiting.delete(node.id);
    node.delayDays = daysBetween(node.start, earliest);
    node.completion =
      node.blocked || !node.baseCompletion
        ? ""
        : nextDay(node.baseCompletion, node.delayDays);
    if (!node.baseCompletion && !node.reason)
      node.reason = "Configure aportes para obter uma estimativa.";
    done.add(node.id);
    return node;
  };
  for (const node of nodes) resolve(node);
  return nodes.sort(
    (a, b) =>
      b.priority - a.priority ||
      (a.desired || "9999").localeCompare(b.desired || "9999") ||
      a.id.localeCompare(b.id),
  );
}

export type PriorityProjection = {
  id: string;
  allocated: number;
  start: string;
  completion: string;
  blocked: boolean;
};
/** A finite shared hypothetical budget. Finishing a prerequisite unlocks another goal next month. */
export function projectPriorityBudget(
  nodes: LifeNode[],
  monthlyBudget: number,
  asOf = today(),
  months = 120,
): PriorityProjection[] {
  if (
    !Number.isFinite(monthlyBudget) ||
    monthlyBudget < 0 ||
    monthlyBudget > 1e12 ||
    !validDate(asOf) ||
    !Number.isInteger(months) ||
    months < 1 ||
    months > 600
  )
    throw Error(
      "Use um orçamento mensal válido e um período entre 1 e 600 meses.",
    );
  const sorted = nodes
    .filter((n) => !n.goal.data.archived)
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (a.desired || "9999").localeCompare(b.desired || "9999") ||
        a.id.localeCompare(b.id),
    );
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const runnable = new Map<string, boolean>();
  const canRun = (id: string, path = new Set<string>()): boolean => {
    if (runnable.has(id)) return runnable.get(id)!;
    const node = byId.get(id);
    if (!node || path.has(id) || path.size >= 500) return false;
    if (node.completed) return true;
    if (node.goal.data.archived) return false;
    const result = node.dependsOn.every((dependency) =>
      canRun(dependency, new Set([...path, id])),
    );
    runnable.set(id, result);
    return result;
  };
  const state = new Map(
    nodes.map((n) => [
      n.id,
      {
        id: n.id,
        allocated: 0,
        start: "",
        completion: n.completed ? n.completedDate || asOf : "",
        blocked: !canRun(n.id),
      },
    ]),
  );
  for (let month = 1; month <= months; month++) {
    let budget = roundMoney(monthlyBudget);
    const date = addMonths(asOf, month);
    const eligibleAtStart = new Set(
      nodes.filter((n) => !!state.get(n.id)?.completion).map((n) => n.id),
    );
    for (const node of sorted) {
      const goal = state.get(node.id)!;
      if (
        node.completed ||
        goal.completion ||
        node.dependsOn.some((id) => !eligibleAtStart.has(id))
      )
        continue;
      // Missing/cyclic prerequisites stay blocked, but a missing individual saving plan is irrelevant to a new budget.
      if (goal.blocked) continue;
      const take = Math.min(
        budget,
        Math.max(0, node.remaining - goal.allocated),
      );
      if (take > 0 && !goal.start) goal.start = date;
      goal.allocated = roundMoney(goal.allocated + take);
      budget = roundMoney(budget - take);
      if (goal.allocated >= node.remaining) goal.completion = date;
      if (budget <= 0) break;
    }
  }
  return nodes.map((n) => state.get(n.id)!);
}
