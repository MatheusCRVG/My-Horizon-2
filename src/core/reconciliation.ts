import { accountBalance } from "./finance";
import { validDate } from "./contributions";
import { cents, rows, today, type Document, type Entity } from "./model";

export type ReconciliationChange = Pick<Entity, "id" | "kind" | "data" | "deleted">;
export type DuplicateGroup = { key: string; entries: Entity[] };
export type TransferSuggestion = {
  id: string;
  outgoing: Entity;
  incoming: Entity;
  ambiguous: boolean;
  linked: boolean;
};

const text = (v: unknown) => String(v ?? "").trim();
const categoryKey = (v: unknown) => text(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const currency = (e: Entity) => text(e.data.currencyCode || e.data.currency || "BRL").toUpperCase();
const safeAmount = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 1e9 && Math.abs(n * 100 - cents(n)) < 0.00001;
};
const hasConflict = (doc: Document, id: string) => doc.conflicts.some((c) => c.local.id === id || c.remote.id === id);

/** A suggestion for review; "Outros" may be a deliberate category. */
export function uncategorizedTransactions(doc: Document) {
  return rows(doc, "transaction").filter((e) =>
    e.data.type !== "transfer" && e.data.status !== "cancelled" &&
    ["", "outros", "sem categoria", "nao categorizado", "nao categorizada"].includes(categoryKey(e.data.category)),
  ).sort((a, b) => text(b.data.date).localeCompare(text(a.data.date)));
}

/** Conservative: same account, exact description, financial fields and bank ID. */
function duplicateKey(e: Entity): string | null {
  const d = e.data;
  if (!safeAmount(d.amount) || !validDate(text(d.date)) || !text(d.description) ||
      !text(d.accountId) || currency(e) !== "BRL" || !["income", "expense", "transfer"].includes(d.type) ||
      !["confirmed", "planned"].includes(d.status)) return null;
  return JSON.stringify([
    d.type, d.status, d.date, cents(Number(d.amount)), currency(e),
    text(d.description), text(d.accountId), text(d.targetAccountId),
    text(d.category), text(d.subcategory), text(d.payment), text(d.cardId),
    !!d.cardPayment, text(d.invoiceMonth), text(d.purchaseDate),
    text(d.installment), text(d.frequency), text(d.bankId),
  ]);
}

export function exactDuplicateGroups(doc: Document): DuplicateGroup[] {
  const map = new Map<string, Entity[]>();
  for (const e of rows(doc, "transaction")) {
    if (hasConflict(doc, e.id)) continue;
    const key = duplicateKey(e);
    if (key) {
      const group = map.get(key) ?? [];
      group.push(e);
      map.set(key, group);
    }
  }
  return [...map].filter(([, entries]) => entries.length > 1)
    .map(([key, entries]) => ({ key, entries }));
}

export function hasLinkedContribution(doc: Document, transactionId: string) {
  return rows(doc, "contribution").some((e) => e.data.transactionId === transactionId);
}

function transferLeg(doc: Document, e: Entity, asOf: string) {
  const d = e.data;
  const account = rows(doc, "account").find((a) => a.id === d.accountId);
  return !!account && !hasConflict(doc, e.id) &&
    ["income", "expense"].includes(d.type) && d.status === "confirmed" &&
    validDate(text(d.date)) && d.date <= asOf && safeAmount(d.amount) &&
    currency(e) === "BRL" && d.payment !== "credit" && !d.cardId &&
    !d.cardPayment && !d.targetAccountId && !d.installment && !d.purchaseDate &&
    !d.invoiceMonth && !d.reconciliation;
}

/** Equal date/amount is not evidence of ownership: never reconcile automatically. */
export function ownTransferSuggestions(doc: Document, asOf = today()): TransferSuggestion[] {
  const groups = new Map<string, { incoming: Entity[]; outgoing: Entity[] }>();
  for (const e of rows(doc, "transaction")) {
    if (!transferLeg(doc, e, asOf)) continue;
    const key = `${e.data.date}:${cents(Number(e.data.amount))}`;
    const group = groups.get(key) ?? { incoming: [], outgoing: [] };
    group[e.data.type === "income" ? "incoming" : "outgoing"].push(e);
    groups.set(key, group);
  }
  const candidates: TransferSuggestion[] = [];
  for (const [, group] of [...groups].sort(([a], [b]) => b.localeCompare(a))) {
    for (const outgoing of group.outgoing) {
      const matches = group.incoming.filter((incoming) => incoming.data.accountId !== outgoing.data.accountId);
      for (const incoming of matches) {
        candidates.push({
          id: `${outgoing.id}:${incoming.id}`, outgoing, incoming,
          ambiguous: matches.length > 1 || group.outgoing.filter((o) => o.data.accountId !== incoming.data.accountId).length > 1,
          linked: hasLinkedContribution(doc, outgoing.id) || hasLinkedContribution(doc, incoming.id),
        });
        if (candidates.length === 200) return candidates;
      }
    }
  }
  return candidates.sort((a, b) => b.outgoing.data.date.localeCompare(a.outgoing.data.date));
}

export function latestImportedChange(doc: Document) {
  const imported = doc.entities.filter((e) => e.id.startsWith("import:"));
  const latest = imported.map((e) => e.updatedAt).filter((date) => Number.isFinite(Date.parse(date))).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1);
  return { count: imported.filter((e) => !e.deleted).length, latest: latest ?? "" };
}

function assertReviewed(current: Entity, reviewed?: Entity) {
  if (reviewed && (current.id !== reviewed.id || JSON.stringify(current.data) !== JSON.stringify(reviewed.data) ||
      JSON.stringify(current.vector) !== JSON.stringify(reviewed.vector) || current.deleted !== reviewed.deleted))
    throw Error("Este registro mudou durante a revisão. Feche e revise os dados atualizados.");
}

export function duplicateRemovalChanges(doc: Document, removeId: string, keepId: string, reviewed?: Entity): ReconciliationChange[] {
  if (removeId === keepId) throw Error("Escolha registros diferentes para manter e excluir.");
  const group = exactDuplicateGroups(doc).find((g) => g.entries.some((e) => e.id === removeId) && g.entries.some((e) => e.id === keepId));
  const remove = group?.entries.find((e) => e.id === removeId);
  if (!remove) throw Error("A duplicidade mudou. Revise os registros novamente.");
  assertReviewed(remove, reviewed);
  if (hasLinkedContribution(doc, remove.id))
    throw Error("Há aporte vinculado a este registro. Revise o vínculo na meta antes de excluir.");
  return [{ id: remove.id, kind: remove.kind, data: remove.data, deleted: true }];
}

export function ownTransferChanges(doc: Document, outgoingId: string, incomingId: string, reviewed?: TransferSuggestion): ReconciliationChange[] {
  const pair = ownTransferSuggestions(doc).find((p) => p.outgoing.id === outgoingId && p.incoming.id === incomingId);
  if (!pair) throw Error("O par não atende mais aos critérios. Revise datas, valores, contas e situação.");
  assertReviewed(pair.outgoing, reviewed?.outgoing);
  assertReviewed(pair.incoming, reviewed?.incoming);
  if (pair.linked) throw Error("Há aporte vinculado a este par. Revise o vínculo na meta antes de conciliar.");
  const { outgoing, incoming } = pair;
  const changes: ReconciliationChange[] = [
    { id: outgoing.id, kind: "transaction", data: {
      ...outgoing.data, type: "transfer", targetAccountId: incoming.data.accountId, category: "",
      reconciliation: {
        type: "own-transfer", counterpartId: incoming.id,
        originalOutgoing: { ...outgoing.data }, originalIncoming: { ...incoming.data },
      },
    } },
    { id: incoming.id, kind: "transaction", data: incoming.data, deleted: true },
  ];
  const after: Document = { ...doc, entities: doc.entities.map((e) => {
    const change = changes.find((c) => c.id === e.id);
    return change ? { ...e, ...change } : e;
  }) };
  // Guard both account balances before handing the atomic batch to store.edit.
  for (const accountId of [outgoing.data.accountId, incoming.data.accountId])
    for (const asOf of [outgoing.data.date, today()])
      if (cents(accountBalance(doc, accountId, asOf)) !== cents(accountBalance(after, accountId, asOf)))
        throw Error("A conciliação alteraria o saldo de uma conta. Revise os registros manualmente.");
  return changes;
}
