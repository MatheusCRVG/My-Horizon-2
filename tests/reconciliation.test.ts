import { describe, expect, it } from "vitest";
import { accountBalance, totals } from "../src/core/finance";
import { validateContributions } from "../src/core/contributions";
import { editDocument } from "../src/core/merge";
import { emptyDocument, type Document, type Entity } from "../src/core/model";
import {
  duplicateRemovalChanges, exactDuplicateGroups, hasLinkedContribution,
  latestImportedChange, ownTransferChanges, ownTransferSuggestions,
  uncategorizedTransactions, type ReconciliationChange,
} from "../src/core/reconciliation";

const entity = (id: string, kind: Entity["kind"], data: Entity["data"]): Entity => ({
  id, kind, data, vector: { a: 1 }, updatedAt: "2026-01-10T12:00:00Z",
});
const tx = (id: string, data: Entity["data"] = {}) => entity(id, "transaction", {
  description: "Pix entre contas", amount: 150, date: "2026-01-10",
  accountId: "a", type: "expense", payment: "pix", category: "Outros", status: "confirmed", ...data,
});
const fixture = (): Document => ({ ...emptyDocument(), entities: [
  entity("a", "account", { name: "Origem", balance: 1000, date: "2020-01-01" }),
  entity("b", "account", { name: "Destino", balance: 250, date: "2020-01-01" }),
  tx("out"), tx("in", { accountId: "b", type: "income" }),
] });
const apply = (doc: Document, changes: ReconciliationChange[]) => changes.reduce((next, c) => editDocument(next, c, "test"), doc);

describe("explicit financial reconciliation", () => {
  it("suggests without changing documents and preserves each balance when converting one pair", () => {
    const doc = fixture(), original = structuredClone(doc);
    const pairs = ownTransferSuggestions(doc);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].ambiguous).toBe(false);
    expect(doc).toEqual(original);
    const changes = ownTransferChanges(doc, "out", "in", pairs[0]);
    expect(changes).toHaveLength(2);
    expect(doc).toEqual(original);
    const after = apply(doc, changes);
    for (const date of ["2026-01-09", "2026-01-10", "2026-02-10"])
      for (const id of ["a", "b"])
        expect(accountBalance(after, id, date)).toBe(accountBalance(doc, id, date));
    expect(totals(doc, "2026-01")).toMatchObject({ income: 150, expense: 150, balance: 1250, netWorth: 1250 });
    expect(totals(after, "2026-01")).toMatchObject({ income: 0, expense: 0, balance: 1250, netWorth: 1250 });
    expect(after.entities.find((e) => e.id === "in")).toMatchObject({ deleted: true, data: original.entities[3].data });
    expect(after.entities.find((e) => e.id === "out")?.data.reconciliation.originalOutgoing).toEqual(original.entities[2].data);
    expect(ownTransferSuggestions(after)).toHaveLength(0);
  });

  it.each([
    { amount: 149.99 }, { amount: 150.001 }, { amount: 0 }, { amount: -150 }, { amount: Infinity },
    { date: "2026-01-11" }, { date: "2026-02-30" }, { date: "2099-01-10" },
    { accountId: "a" }, { accountId: "missing" }, { payment: "credit" },
    { cardId: "card" }, { cardPayment: true }, { installment: "1/2" }, { invoiceMonth: "2026-01" },
    { status: "planned" }, { status: "cancelled" }, { type: "transfer" }, { currency: "USD" },
    { targetAccountId: "a" },
  ])("does not suggest an invalid or unrelated incoming leg: %j", (data) => {
    const doc = fixture(); doc.entities[3].data = { ...doc.entities[3].data, ...data };
    expect(ownTransferSuggestions(doc)).toHaveLength(0);
    expect(() => ownTransferChanges(doc, "out", "in")).toThrow();
  });

  it("marks equal-value alternatives as ambiguous instead of choosing a match", () => {
    const doc = fixture(); doc.entities.push(tx("in2", { accountId: "b", type: "income" }));
    const pairs = ownTransferSuggestions(doc);
    expect(pairs).toHaveLength(2);
    expect(pairs.every((p) => p.ambiguous)).toBe(true);
  });

  it("blocks pairs with a linked contribution, including planned reservations", () => {
    const doc = fixture();
    doc.entities.push(entity("goal", "goal", { name: "Reserva", target: 1000, saved: 0 }));
    doc.entities.push(entity("c", "contribution", { goalId: "goal", transactionId: "in", amount: 150, description: "Guardar", date: "2026-01-10", status: "planned" }));
    expect(hasLinkedContribution(doc, "in")).toBe(true);
    expect(ownTransferSuggestions(doc)[0].linked).toBe(true);
    expect(() => ownTransferChanges(doc, "out", "in")).toThrow(/aporte vinculado/i);
    // store.edit's existing central validator also rejects a linked transaction tombstone.
    const invalid = apply(doc, [{ id: "in", kind: "transaction", data: doc.entities[3].data, deleted: true }]);
    expect(() => validateContributions(invalid, doc, 1250, () => 1250)).toThrow(/entrada ou transferência/i);
  });

  it("requires a new review if financial data changed or a conflict exists", () => {
    const doc = fixture(), pair = ownTransferSuggestions(doc)[0];
    const changed = structuredClone(doc);
    changed.entities[2].data.description = "Descrição corrigida";
    expect(() => ownTransferChanges(changed, "out", "in", pair)).toThrow(/mudou durante a revisão/i);
    doc.conflicts.push({ id: "conflict", local: doc.entities[2], remote: { ...doc.entities[2], vector: { b: 1 } } });
    expect(ownTransferSuggestions(doc)).toHaveLength(0);
  });

  it("keeps cent precision and bounds a very ambiguous matching set", () => {
    const doc = fixture(); doc.entities[2].data.amount = 0.1; doc.entities[3].data.amount = 0.1;
    expect(ownTransferSuggestions(doc)).toHaveLength(1);
    for (let i = 0; i < 300; i++) doc.entities.push(tx(`many-${i}`, { accountId: "b", type: "income", amount: 0.1 }));
    expect(ownTransferSuggestions(doc)).toHaveLength(200);
  });
});

describe("reviewing exact duplicates and manual origins", () => {
  it("keeps different bank IDs, cards, accounts, dates, directions and amounts separate", () => {
    const doc = fixture(); doc.entities.push(tx("copy"));
    expect(exactDuplicateGroups(doc)).toHaveLength(1);
    for (const change of [
      { bankId: "bank-other" }, { accountId: "b" }, { date: "2026-01-11" },
      { amount: 150.01 }, { cardId: "card" }, { type: "income" },
      { payment: "credit" }, { category: "Mercado" }, { description: "Pix diferente" },
      { status: "planned" }, { installment: "2/2" },
    ]) {
      const varied = structuredClone(doc); varied.entities[4].data = { ...varied.entities[4].data, ...change };
      expect(exactDuplicateGroups(varied)).toHaveLength(0);
    }
  });

  it("deletes only the reviewed duplicate as a tombstone, preserving all other data", () => {
    const doc = fixture(); doc.entities.push(tx("copy"));
    const before = structuredClone(doc), changes = duplicateRemovalChanges(doc, "copy", "out", doc.entities[4]);
    const after = apply(doc, changes);
    expect(doc).toEqual(before);
    expect(changes).toHaveLength(1);
    expect(after.entities.find((e) => e.id === "copy")).toMatchObject({ deleted: true, data: before.entities[4].data });
    expect(after.entities.find((e) => e.id === "out")).toEqual(before.entities[2]);
    expect(exactDuplicateGroups(after)).toHaveLength(0);
    expect(() => duplicateRemovalChanges(doc, "out", "out")).toThrow();
  });

  it("does not delete a transaction that funds a goal", () => {
    const doc = fixture(); doc.entities.push(tx("copy", { type: "income", accountId: "b" }));
    doc.entities.push(entity("c", "contribution", { transactionId: "copy" }));
    expect(() => duplicateRemovalChanges(doc, "copy", "in")).toThrow(/aporte vinculado/i);
  });

  it("flags uncategorized/Outros for optional review without including transfers or cancelled rows", () => {
    const doc = fixture();
    doc.entities.push(tx("without", { category: "" }), tx("categorized", { category: "Mercado" }), tx("cancel", { status: "cancelled" }), tx("transfer", { type: "transfer" }));
    expect(uncategorizedTransactions(doc).map((e) => e.id).sort()).toEqual(["in", "out", "without"]);
  });

  it("labels only import-prefixed records and does not invent an import timestamp", () => {
    const doc = fixture();
    expect(latestImportedChange(doc)).toEqual({ count: 0, latest: "" });
    doc.entities.push({ ...tx("import:ofx1"), updatedAt: "2026-02-10T12:00:00Z" }, { ...tx("import:ofx2"), deleted: true, updatedAt: "2026-03-10T12:00:00Z" });
    expect(latestImportedChange(doc)).toEqual({ count: 1, latest: "2026-03-10T12:00:00Z" });
  });
});
