import {
  addMonths,
  cents,
  fromCents,
  money,
  rows,
  today,
  type Document,
} from "./model";
import { totals, financialAsOf } from "./finance";
import {
  contributionSeries,
  contributions,
  objectives,
  reservedValue,
  totalReserved,
} from "./contributions";
import { horizonCategory } from "./horizons";
import { savingSummary } from "./saving-targets";
import { reservationIntegrity } from "./reservations";

const sum = (values: number[]) =>
  fromCents(values.reduce((s, v) => s + cents(v), 0));
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    m = Math.floor(sorted.length / 2);
  return sorted.length
    ? sorted.length % 2
      ? sorted[m]
      : (sorted[m - 1] + sorted[m]) / 2
    : 0;
};
export function monthlyBaseline(doc: Document, asOf = today()) {
  const months = Array.from({ length: 3 }, (_, i) =>
    addMonths(asOf, -i - 1, 1).slice(0, 7),
  );
  const data = months.map((month) => ({ month, ...totals(doc, month) }));
  const observed = data.filter((m) => m.income > 0 || m.expense > 0).length;
  return {
    months,
    observed,
    income: sum(data.map((m) => m.income)) / (observed || 1),
    expense: sum(data.map((m) => m.expense)) / (observed || 1),
    data,
  };
}
export function budgetAnalysis(doc: Document, month: string) {
  const current = totals(doc, month),
    previous = totals(doc, addMonths(month + "-01", -1).slice(0, 7));
  return rows(doc, "budget").map((b) => ({
    id: b.id,
    category: String(b.data.category),
    limit: Number(b.data.limit),
    spent:
      current.byCategory.find((c) => c.name === b.data.category)?.value ?? 0,
    previous:
      previous.byCategory.find((c) => c.name === b.data.category)?.value ?? 0,
    planned: sum(
      rows(doc, "transaction")
        .filter(
          (t) =>
            t.data.status === "planned" &&
            t.data.type === "expense" &&
            t.data.category === b.data.category &&
            t.data.date.startsWith(month),
        )
        .map((t) => Number(t.data.amount)),
    ),
  }));
}
export function savingCapacity(
  doc: Document,
  month = today().slice(0, 7),
  asOf = today(),
) {
  doc = financialAsOf(doc, asOf);
  const t = totals(doc, month);
  const planned = sum(
    rows(doc, "transaction")
      .filter(
        (e) =>
          e.data.status === "planned" &&
          e.data.type === "expense" &&
          e.data.date.startsWith(month),
      )
      .map((e) => Number(e.data.amount)),
  );
  return {
    planned,
    available: t.available,
    surplus: t.saving,
    prudent: Math.max(0, Math.min(t.available - planned, t.saving - planned)),
  };
}
export function spendingSignals(doc: Document, asOf = today()) {
  const month = asOf.slice(0, 7),
    from = addMonths(asOf, -6, 1);
  const expenses = rows(doc, "transaction").filter(
    (t) =>
      t.data.status === "confirmed" &&
      t.data.type === "expense" &&
      t.data.date <= asOf &&
      t.data.date >= from &&
      Number(t.data.amount) > 0,
  );
  const unusual = expenses
    .filter((t) => t.data.date.startsWith(month))
    .flatMap((t) => {
      const past = expenses.filter(
        (p) =>
          p.id !== t.id &&
          p.data.date < month + "-01" &&
          p.data.category === t.data.category,
      );
      const usual = median(past.map((p) => Number(p.data.amount)));
      return past.length >= 5 &&
        t.data.amount > usual * 2.5 &&
        t.data.amount - usual >= 100
        ? [{ entity: t, usual }]
        : [];
    });
  const merchants = new Map<string, typeof expenses>();
  for (const t of expenses.filter((e) => !e.data.installment)) {
    const key = norm(String(t.data.description))
      .replace(/\d+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (key.length >= 3) merchants.set(key, [...(merchants.get(key) ?? []), t]);
  }
  const subscriptions = [...merchants.entries()].flatMap(
    ([merchant, entries]) => {
      const monthly = new Map<string, (typeof expenses)[number]>();
      for (const t of entries.sort((a, b) =>
        a.data.date.localeCompare(b.data.date),
      ))
        monthly.set(t.data.date.slice(0, 7), t);
      const ordered = [...monthly.values()];
      if (ordered.length < 3) return [];
      const last = ordered.at(-1)!,
        prior = ordered.at(-2)!;
      const dates = ordered
        .slice(-3)
        .map((t) => Date.parse(t.data.date + "T12:00:00Z"));
      if (
        dates.some(
          (d, i) =>
            i > 0 &&
            (d - dates[i - 1] < 24 * 86400000 ||
              d - dates[i - 1] > 40 * 86400000),
        )
      )
        return [];
      const change = Number(last.data.amount) - Number(prior.data.amount);
      return [
        {
          merchant,
          description: String(last.data.description),
          amount: Number(last.data.amount),
          count: ordered.length,
          lastDate: String(last.data.date),
          increase:
            change > 0 && change / Number(prior.data.amount) >= 0.05
              ? fromCents(cents(change))
              : 0,
        },
      ];
    },
  );
  return { unusual, subscriptions };
}
export function horizonScore(doc: Document, asOf = today()) {
  doc = financialAsOf(doc, asOf);
  const t = totals(doc, asOf.slice(0, 7)),
    baseline = monthlyBaseline(doc, asOf);
  const factors: {
    label: string;
    earned: number;
    max: number;
    explanation: string;
    page: string;
  }[] = [];
  const income = baseline.observed ? baseline.income : t.income,
    expense = baseline.observed ? baseline.expense : t.expense;
  if (income > 0) {
    const rate = (income - expense) / income;
    factors.push({
      label: "Capacidade de poupança",
      earned: 20 * Math.min(1, Math.max(0, rate) / 0.2),
      max: 20,
      explanation: "20 pontos com sobra de pelo menos 20% da renda registrada.",
      page: "budget",
    });
    factors.push({
      label: "Comprometimento da renda",
      earned: 15 * Math.min(1, Math.max(0, 1 - expense / income) / 0.3),
      max: 15,
      explanation:
        "15 pontos quando despesas registradas comprometem até 70% da renda.",
      page: "transactions",
    });
    factors.push({
      label: "Dívidas cadastradas",
      earned: 20 * Math.max(0, 1 - (t.debts + t.committed) / (income * 12)),
      max: 20,
      explanation:
        "20 pontos menos a proporção de dívidas e faturas sobre 12 meses da renda observada. Só considera dívidas cadastradas.",
      page: "asset",
    });
  }
  if (expense > 0) {
    const reserve = sum(
      objectives(doc)
        .filter((g) => horizonCategory(g).id === "reserve")
        .map((g) => reservedValue(doc, g)),
    );
    factors.push({
      label: "Reserva de emergência",
      earned: 25 * Math.min(1, reserve / (expense * 6)),
      max: 25,
      explanation:
        "25 pontos com seis meses das despesas médias registradas reservados em horizontes de reserva.",
      page: "reserve",
    });
  }
  if (baseline.data.every((m) => m.income > 0)) {
    const mean = baseline.income,
      deviation = Math.sqrt(
        baseline.data.reduce((s, m) => s + (m.income - mean) ** 2, 0) / 3,
      );
    factors.push({
      label: "Regularidade da renda",
      earned: 10 * Math.max(0, 1 - deviation / mean),
      max: 10,
      explanation:
        "Compara a variação da renda em três meses completos. Não garante estabilidade futura.",
      page: "reports",
    });
  }
  const goals = objectives(doc).filter((g) => !g.data.archived && g.data.plan),
    series = contributionSeries(doc, goals, addMonths(asOf, -2, 1), asOf);
  const eligible = series.filter((r) => r.planned > 0);
  if (eligible.length)
    factors.push({
      label: "Regularidade dos aportes",
      earned:
        (10 *
          eligible.reduce(
            (s, r) => s + Math.min(1, r.deposits / r.planned),
            0,
          )) /
        eligible.length,
      max: 10,
      explanation:
        "Proporção dos aportes confirmados em relação aos planejados nos últimos três meses.",
      page: "goal",
    });
  const reservationError = reservationIntegrity(doc);
  const coverage = factors.reduce((s, f) => s + f.max, 0),
    score =
      coverage >= 60 && baseline.observed === 3 && !reservationError
        ? Math.round(
            (factors.reduce((s, f) => s + f.earned, 0) / coverage) * 100,
          )
        : null;
  return {
    score,
    coverage,
    factors,
    historyMonths: baseline.observed,
    reason: reservationError
      ? "Revise as reservas antes de calcular a pontuação."
      : "Dados insuficientes para uma pontuação",
  };
}
export type PulseSnapshot = {
  at: string;
  balance: number;
  netWorth: number;
  transactionIds: string[];
  contributionIds: string[];
  goals: Record<string, number>;
};
export function pulseSnapshot(doc: Document, asOf = today()): PulseSnapshot {
  doc = financialAsOf(doc, asOf);
  const t = totals(doc, asOf.slice(0, 7));
  return {
    at: new Date().toISOString(),
    balance: t.balance,
    netWorth: t.netWorth,
    transactionIds: rows(doc, "transaction")
      .filter((t) => t.data.status === "confirmed")
      .map((t) => t.id),
    contributionIds: contributions(doc).map((t) => t.id),
    goals: Object.fromEntries(
      objectives(doc).map((g) => [g.id, reservedValue(doc, g)]),
    ),
  };
}
export function pulseChanges(
  doc: Document,
  previous: PulseSnapshot | null,
  asOf = today(),
) {
  doc = financialAsOf(doc, asOf);
  if (!previous) return [];
  const current = pulseSnapshot(doc, asOf),
    events: { id: string; title: string; text: string; page: string }[] = [];
  const tx = rows(doc, "transaction").filter(
    (t) =>
      t.data.status === "confirmed" && !previous.transactionIds.includes(t.id),
  );
  if (tx.length)
    events.push({
      id: "transactions",
      title: `${tx.length} nova(s) movimentação(ões)`,
      text: "Registros confirmados adicionados desde a sua última entrada.",
      page: "transactions",
    });
  const delta = fromCents(cents(current.balance) - cents(previous.balance));
  if (delta)
    events.push({
      id: "balance",
      title: `Saldo ${delta > 0 ? "aumentou" : "diminuiu"} ${money(Math.abs(delta))}`,
      text: "Variação nas contas cadastradas desde a última entrada.",
      page: "account",
    });
  for (const goal of objectives(doc)) {
    if (previous.goals[goal.id] === undefined) continue;
    const change = fromCents(
      cents(reservedValue(doc, goal)) - cents(previous.goals[goal.id]),
    );
    if (change > 0)
      events.push({
        id: goal.id,
        title: `${goal.data.name} avançou ${money(change)}`,
        text: "Evolução do dinheiro efetivamente reservado.",
        page: "goal",
      });
  }
  return events;
}
export function assistantAnswer(
  doc: Document,
  question: string,
  asOf = today(),
) {
  doc = financialAsOf(doc, asOf);
  const q = norm(question),
    t = totals(doc, asOf.slice(0, 7)),
    baseline = monthlyBaseline(doc, asOf),
    goals = objectives(doc).filter((g) => !g.data.archived);
  const source = `Dados cadastrados até ${asOf.split("-").reverse().join("/")}. Nenhum saldo foi alterado.`;
  const percent = question.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (/salario|renda/.test(q) && /aument/.test(q) && percent) {
    const rate = Number(percent[1].replace(",", "."));
    if (Number.isFinite(rate) && rate >= 0 && rate <= 1000) {
      const income = baseline.observed === 3 ? baseline.income : t.income,
        expense = baseline.observed === 3 ? baseline.expense : t.expense;
      const projected = fromCents(cents(income * (1 + rate / 100)));
      return {
        title: `Hipótese de aumento de ${numberPercent(rate)}%`,
        text: `Usando ${money(income)} de renda e ${money(expense)} de despesas ${baseline.observed === 3 ? "médias dos três meses completos" : "cadastradas neste mês, ainda parcial"}, um aumento de ${numberPercent(rate)}% levaria a renda a ${money(projected)} e a sobra a ${money(projected - expense)} por mês. Sem alterar despesas, impostos ou outros compromissos. É uma hipótese; nada foi registrado como receita.`,
        source,
        page: "future",
      };
    }
  }
  const targetMatch = question.match(
    /(?:r\$\s*)?(\d[\d.,]*)\s*(mil|milh[aã]o|milh[oõ]es)?/i,
  );
  if (/quando|quanto tempo/.test(q) && targetMatch) {
    const target =
      Number(targetMatch[1].replace(/\./g, "").replace(",", ".")) *
      (targetMatch[2] ? (/^mil$/i.test(targetMatch[2]) ? 1000 : 1000000) : 1);
    const surplus = Math.max(
      0,
      baseline.observed === 3 ? baseline.income - baseline.expense : t.saving,
    );
    if (Number.isFinite(target) && target > 0 && target <= 1e12) {
      const months =
        t.netWorth >= target
          ? 0
          : surplus > 0
            ? Math.ceil((target - t.netWorth) / surplus)
            : null;
      return {
        title: `Seu caminho até ${money(target)}`,
        text:
          months === 0
            ? `Seu patrimônio líquido cadastrado de ${money(t.netWorth)} já alcança esse valor.`
            : months === null
              ? `Ainda não há sobra positiva registrada suficiente para estimar esse prazo. Ajuste renda e despesas no Meu Futuro para comparar possibilidades.`
              : `Partindo do patrimônio líquido cadastrado de ${money(t.netWorth)} e acumulando ${money(surplus)} por mês, a conta sem rendimento aponta ${months} meses. Renda e despesas constantes; sem inflação, impostos nem retiradas. Essa sobra ${baseline.observed === 3 ? "usa a média de três meses completos" : "vem dos registros parciais do mês"} e não garante dinheiro disponível para novos aportes. Refine as hipóteses no Meu Futuro.`,
        source,
        page: "future",
      };
    }
  }
  if (/econom|guardar|poupar|sobr/.test(q)) {
    const capacity = savingCapacity(doc, asOf.slice(0, 7), asOf);
    return {
      title: "Quanto pode guardar neste mês",
      text: `A sobra entre receitas e despesas registradas é ${money(t.saving)}. O dinheiro livre, depois de reservas e faturas, é ${money(t.available)}. Há ${money(capacity.planned)} em despesas previstas. Uma referência prudente, limitada ao menor desses valores, é ${money(capacity.prudent)}. Isso depende de todos os seus compromissos estarem cadastrados.`,
      source,
      page: "calendar",
    };
  }
  if (/gasto|gastando|assinatura|normal|padrao/.test(q)) {
    const signals = spendingSignals(doc, asOf);
    return {
      title: "Seus gastos em perspectiva",
      text: `As despesas registradas neste mês somam ${money(t.expense)}. A média dos meses com registros entre os três meses completos anteriores é ${money(baseline.expense)} (${baseline.observed} de 3 meses observados). Meses sem histórico não são presumidos como ausência de gastos. Identifiquei ${signals.unusual.length} gasto(s) possivelmente incomum(ns) e ${signals.subscriptions.length} cobrança(s) com padrão mensal. Essas são sugestões para revisão, não cobranças confirmadas como assinaturas.`,
      source,
      page: "budget",
    };
  }
  if (/meta|horizonte|prioriz|aport|objetivo/.test(q)) {
    const goal =
      goals.find((g) => norm(q).includes(norm(String(g.data.name)))) ??
      [...goals]
        .filter((g) => savingSummary(doc, g).remaining > 0)
        .sort(
          (a, b) =>
            Number(b.data.priority ?? 2) - Number(a.data.priority ?? 2) ||
            (a.data.deadline || "9999").localeCompare(
              b.data.deadline || "9999",
            ),
        )[0];
    if (!goal)
      return {
        title: "Seu próximo horizonte",
        text: "Você ainda não tem horizontes ativos por concluir. Crie um objetivo para calcular um plano de aportes.",
        source,
        page: "goal",
      };
    const s = savingSummary(doc, goal, asOf);
    return {
      title: String(goal.data.name),
      text: `Você já reservou ${money(s.saved)} e faltam ${money(s.remaining)}. A prioridade cadastrada orientou esta sugestão; mantenha sua reserva de emergência em perspectiva. ${s.desired && s.required !== null ? `Para o prazo escolhido, a estimativa é ${money(s.required)} por mês.` : "Você pode definir um prazo para calcular o aporte necessário."} ${s.completion ? `Com o plano atual, a conclusão estimada é ${s.completion.split("-").reverse().join("/")}.` : "Não há um plano suficiente para estimar uma conclusão."} Não supomos rendimento.`,
      source,
      page: "goal",
    };
  }
  if (
    /salario|renda|aument|acontece|quanto tempo|quando|cem mil|mil|invest/.test(
      q,
    )
  )
    return {
      title: "Explore essa hipótese no Meu Futuro",
      text: `Seu patrimônio líquido cadastrado é ${money(t.netWorth)}, com ${money(t.invested)} em investimentos. Para calcular uma data sem inventar renda ou rendimento, abra Meu Futuro e informe o objetivo e as hipóteses de renda, despesas e rentabilidade. A simulação compara cenários sem alterar seu dinheiro real.`,
      source,
      page: "future",
    };
  return {
    title: "Seu dinheiro, com contexto",
    text: `Você tem ${money(t.balance)} nas contas e ${money(t.netWorth)} de patrimônio líquido cadastrado. Há ${money(totalReserved(doc))} reservado em objetivos. Posso calcular a capacidade de poupança, revisar padrões de gastos, explicar um horizonte ou encaminhar uma hipótese ao Meu Futuro. Esta versão usa análise local por regras e cálculos; não interpreta qualquer pergunta como um modelo generativo.`,
    source,
    page: "future",
  };
}
function numberPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(
    value,
  );
}
