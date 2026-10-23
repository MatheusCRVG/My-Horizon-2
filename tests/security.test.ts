import { describe, it, expect } from "vitest";
import {
  createKeys,
  encryptDocument,
  decryptDocument,
  unlock,
} from "../src/core/crypto";
import { emptyDocument } from "../src/core/model";
import { editDocument, mergeDocuments, compareVector } from "../src/core/merge";
describe("encrypted vault", () => {
  it("roundtrips with password and recovery, rejects wrong password and tampering", async () => {
    const { keys, recovery } = await createKeys("uma-senha-forte-123", "owner");
    const doc = editDocument(
      emptyDocument(),
      {
        id: "salary",
        kind: "transaction",
        data: { description: "PRIVATE-SALARY", amount: 5432.1 },
      },
      "a",
    );
    const e = await encryptDocument(doc, keys);
    expect(JSON.stringify(e)).not.toContain("PRIVATE-SALARY");
    expect(JSON.stringify(e)).not.toContain("5432");
    expect(keys.key.extractable).toBe(false);
    expect(
      await decryptDocument(e, await unlock(e, "uma-senha-forte-123")),
    ).toEqual(doc);
    expect(await decryptDocument(e, await unlock(e, recovery, true))).toEqual(
      doc,
    );
    await expect(unlock(e, "wrong-password")).rejects.toThrow();
    await expect(
      decryptDocument(
        { ...e, cipher: (e.cipher[0] === "A" ? "B" : "A") + e.cipher.slice(1) },
        keys,
      ),
    ).rejects.toThrow();
    await expect(
      decryptDocument({ ...e, owner: "someone-else" }, keys),
    ).rejects.toThrow();
  }, 15000);
  it("fresh IVs randomize identical data and a separate vault cannot decrypt", async () => {
    const a = await createKeys("password-123456", "owner"),
      b = await createKeys("password-123456", "owner");
    const first = await encryptDocument(emptyDocument(), a.keys),
      second = await encryptDocument(emptyDocument(), a.keys);
    expect(first.iv).not.toBe(second.iv);
    expect(first.cipher).not.toBe(second.cipher);
    await expect(decryptDocument(first, b.keys)).rejects.toThrow();
  }, 15000);
});
describe("version-aware merge", () => {
  const base = () =>
    editDocument(
      emptyDocument(),
      { id: "t", kind: "transaction", data: { amount: 50 } },
      "a",
    );
  const change = (
    doc: ReturnType<typeof base>,
    device: string,
    amount: number,
    deleted?: boolean,
  ) =>
    editDocument(
      doc,
      { id: "t", kind: "transaction", data: { amount }, deleted },
      device,
    );
  it("deduplicates repeated snapshots and keeps causally newer records", () => {
    const old = base(),
      next = change(old, "a", 70);
    expect(mergeDocuments(old, next).entities[0].data.amount).toBe(70);
    expect(mergeDocuments(next, old).entities[0].data.amount).toBe(70);
    expect(mergeDocuments(next, next).entities).toHaveLength(1);
    expect(compareVector({ a: 2 }, { a: 1 })).toBe("after");
  });
  it("retains concurrent edits and resolves with a dominating version vector", () => {
    const initial = base(),
      a = change(initial, "a", 60),
      b = change(initial, "b", 90);
    const merged = mergeDocuments(a, b);
    expect(merged.conflicts).toHaveLength(1);
    const resolved = change(merged, "a", 90);
    expect(resolved.conflicts).toHaveLength(0);
    expect(mergeDocuments(resolved, merged).conflicts).toHaveLength(0);
    expect(mergeDocuments(resolved, b).entities[0].data.amount).toBe(90);
  });
  it("does not resurrect deletion from an old snapshot", () => {
    const initial = base(),
      deleted = change(initial, "a", 50, true);
    expect(mergeDocuments(deleted, initial).entities[0].deleted).toBe(true);
  });
  it("requires a choice between a concurrent deletion and edit", () => {
    const initial = base();
    expect(
      mergeDocuments(change(initial, "a", 50, true), change(initial, "b", 70))
        .conflicts,
    ).toHaveLength(1);
  });
  it("retains all variants when three devices change the same record", () => {
    const initial = base(),
      a = change(initial, "a", 60),
      b = change(initial, "b", 70),
      c = change(initial, "c", 80);
    const merged = mergeDocuments(mergeDocuments(a, b), c);
    expect(merged.conflicts).toHaveLength(2);
    const resolved = change(merged, "a", 80);
    expect(mergeDocuments(resolved, merged).conflicts).toHaveLength(0);
    expect(mergeDocuments(resolved, b).entities[0].data.amount).toBe(80);
  });
  it("keeps independent records from different devices", () => {
    const a = base(),
      b = editDocument(
        emptyDocument(),
        { id: "other", kind: "goal", data: { name: "Travel" } },
        "b",
      );
    expect(mergeDocuments(a, b).entities).toHaveLength(2);
  });
});
