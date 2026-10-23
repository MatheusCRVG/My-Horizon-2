import { beforeAll, describe, expect, it } from "vitest";
import {
  createKeys,
  decryptDocument,
  encryptDocument,
  type VaultKeys,
} from "../src/core/crypto";
import { accountBalance } from "../src/core/finance";
import {
  assertEditRevision,
  editDocument,
  mergeDocuments,
} from "../src/core/merge";
import { emptyDocument, type Document, type Entity } from "../src/core/model";
import {
  createOperations,
  createRpcTransport,
  retryWithBackoff,
  syncVault,
  SyncCancelledError,
  SyncProtocolError,
  type ExchangePage,
  type ExchangeRequest,
  type OperationRecord,
  type SyncRepository,
  type SyncTransport,
  type SyncVaultRecord,
  type VaultHeader,
} from "../src/services/sync";
import { jsonbBytes, MAX_UPLOAD_BYTES } from "../src/services/sync/limits";

const accountId = "11111111-1111-4111-8111-111111111111";
const otherAccount = "22222222-2222-4222-8222-222222222222";
const owner = "legacy-google-subject";
const clone = <T>(value: T): T => structuredClone(value);
let keys: VaultKeys;
beforeAll(async () => {
  keys = (await createKeys("unit-tests-master-passphrase", owner)).keys;
});
const entity = (
  id: string,
  kind: Entity["kind"],
  data: Entity["data"],
  vector: Entity["vector"] = { seed: 1 },
): Entity => ({ id, kind, data, vector, updatedAt: "2026-10-23T12:00:00Z" });
const bank = () =>
  entity("bank", "account", {
    name: "Conta",
    balance: 1000,
    date: "2020-01-01",
  });
const goal = () =>
  entity("goal", "goal", { name: "Reserva", target: 1000, saved: 0 });
const document = (...entities: Entity[]): Document => ({
  schema: 1,
  entities,
  conflicts: [],
});

class MemoryRepository implements SyncRepository {
  records = new Map<string, SyncVaultRecord>();
  queue = new Map<string, OperationRecord>();
  commits: { cursor: number; acknowledged: string[]; remaining: string[] }[] =
    [];
  commitAttempts = 0;
  failAt = new Set<number>();
  async get(recordOwner: string) {
    return clone(this.records.get(recordOwner));
  }
  async outbox(recordOwner: string) {
    return clone(
      [...this.queue.values()].filter((o) => o.owner === recordOwner),
    );
  }
  async commit(
    record: SyncVaultRecord,
    operations: OperationRecord[] = [],
    acknowledged: string[] = [],
  ) {
    this.commitAttempts++;
    if (this.failAt.delete(this.commitAttempts))
      throw Error("transaction failed");
    const nextQueue = new Map(this.queue);
    for (const o of operations) nextQueue.set(o.id, clone(o));
    for (const id of acknowledged) nextQueue.delete(id);
    this.records.set(record.owner, clone(record));
    this.queue = nextQueue;
    this.commits.push({
      cursor: record.cursor ?? 0,
      acknowledged: [...acknowledged],
      remaining: [...nextQueue.keys()],
    });
  }
}
class EncryptedBackend {
  header: VaultHeader | null = null;
  log: ExchangePage["operations"] = [];
  calls: ExchangeRequest[] = [];
  loseNextResponse = false;
  offline = false;
  mutate?: (page: ExchangePage) => ExchangePage;
  transport: SyncTransport = {
    accountId,
    bootstrap: async () => clone(this.header),
    exchange: async (request) => {
      this.calls.push(clone(request));
      if (this.offline) throw Error("offline");
      if (
        request.operations.length > 20 ||
        jsonbBytes(request.operations) > MAX_UPLOAD_BYTES
      )
        throw Error("SQL upload limit exceeded");
      if (
        request.vaultId !== keys.header.vaultId ||
        request.header.owner !== owner
      )
        throw Error("unauthorized vault");
      this.header ??= clone(request.header);
      for (const operation of request.operations) {
        const old = this.log.find((o) => o.op_id === operation.op_id);
        if (
          old &&
          JSON.stringify(old.payload) !== JSON.stringify(operation.payload)
        )
          throw Error("operation id collision");
        if (!old)
          this.log.push({ ...clone(operation), seq: this.log.length + 1 });
      }
      if (this.loseNextResponse) {
        this.loseNextResponse = false;
        throw Error("response lost after durable write");
      }
      const eligible = this.log.filter((o) => o.seq > request.cursor),
        operations = eligible.slice(0, request.limit);
      const page = {
        header: clone(this.header),
        operations: clone(operations),
        cursor: operations.at(-1)?.seq ?? request.cursor,
        has_more: eligible.length > operations.length,
      };
      return this.mutate ? this.mutate(page) : page;
    },
  };
  async seed(doc: Document) {
    const operations = await createOperations(
      emptyDocument(),
      doc,
      keys,
      owner,
    );
    for (const operation of operations)
      await this.transport.exchange({
        vaultId: keys.header.vaultId,
        header: keys.header,
        operations: [{ op_id: operation.id, payload: operation.payload }],
        cursor: 0,
        limit: 100,
      });
    this.calls = [];
  }
}
async function local(
  doc = emptyDocument(),
  pending = false,
  device = "desktop",
) {
  const repository = new MemoryRepository();
  const record: SyncVaultRecord = {
    owner,
    accountId,
    authorized: true,
    envelope: await encryptDocument(doc, keys),
    pending,
    device,
    seen: [],
    cursor: 0,
  };
  await repository.commit(
    record,
    pending ? await createOperations(emptyDocument(), doc, keys, owner) : [],
  );
  repository.commits = [];
  repository.commitAttempts = 0;
  return { repository, record, doc, keys };
}
async function run(
  state: Awaited<ReturnType<typeof local>>,
  backend: EncryptedBackend,
  limit = 100,
) {
  const result = await syncVault({
    ...state,
    transport: backend.transport,
    active: () => true,
    limit,
  });
  state.record = result.record;
  state.doc = result.doc;
  return result;
}
async function save(state: Awaited<ReturnType<typeof local>>, next: Document) {
  const operations = await createOperations(state.doc, next, keys, owner);
  state.record = {
    ...state.record,
    envelope: await encryptDocument(next, keys),
    pending: true,
  };
  await state.repository.commit(state.record, operations);
  state.doc = next;
}

describe("encrypted incremental operations", () => {
  it("encrypts only changed entities including vector/tombstone, excluding unrelated financial data", async () => {
    const previous = document(bank(), goal());
    const next = editDocument(
      previous,
      { ...goal(), data: { ...goal().data, target: 2000 } },
      "desktop",
    );
    const operations = await createOperations(previous, next, keys, owner);
    expect(operations).toHaveLength(1);
    const delta = await decryptDocument(operations[0].payload, keys);
    expect(delta.entities.map((e) => e.id)).toEqual(["goal"]);
    expect(delta.entities[0].vector.desktop).toBe(1);
    expect(JSON.stringify(operations)).not.toContain("Reserva");
    expect(JSON.stringify(operations)).not.toContain('"target":2000');
    const deleted = editDocument(
      next,
      { ...next.entities.find((e) => e.id === "goal")!, deleted: true },
      "desktop",
    );
    const tombstone = await createOperations(next, deleted, keys, owner);
    expect(
      (await decryptDocument(tombstone[0].payload, keys)).entities[0].deleted,
    ).toBe(true);
    expect(
      await createOperations(previous, clone(previous), keys, owner),
    ).toEqual([]);
  });
  it("rejects physical deletion and unversioned changes instead of silently losing an edit", async () => {
    const previous = document(goal());
    await expect(
      createOperations(previous, emptyDocument(), keys, owner),
    ).rejects.toThrow(/tombstone/);
    await expect(
      createOperations(
        previous,
        document({ ...goal(), data: { target: 3000 } }),
        keys,
        owner,
      ),
    ).rejects.toThrow(/revisão/);
    await expect(
      createOperations(emptyDocument(), previous, keys, "another-owner"),
    ).rejects.toThrow();
  });
  it("includes relevant conflicts and propagates their explicit causal resolution", async () => {
    const base = document(goal());
    const left = editDocument(
      base,
      { ...goal(), data: { ...goal().data, target: 2000 } },
      "desktop",
    );
    const right = editDocument(
      base,
      { ...goal(), data: { ...goal().data, target: 3000 } },
      "phone",
    );
    const merged = mergeDocuments(left, right),
      operations = await createOperations(left, merged, keys, owner);
    expect(
      (await decryptDocument(operations[0].payload, keys)).conflicts,
    ).toHaveLength(1);
    const resolved = editDocument(
      merged,
      {
        ...merged.entities[0],
        data: { ...merged.entities[0].data, target: 2500 },
      },
      "desktop",
    );
    const resolution = await createOperations(merged, resolved, keys, owner);
    const delta = await decryptDocument(resolution[0].payload, keys);
    expect(delta.conflicts).toEqual([]);
    expect(mergeDocuments(merged, delta).conflicts).toEqual([]);
    await expect(
      createOperations(merged, { ...merged, conflicts: [] }, keys, owner),
    ).rejects.toThrow(/resolução/);
  });
});

describe("durable exchange and multi-device finance", () => {
  it("drains more than twenty queued operations in bounded batches without skipping uploads", async () => {
    const state = await local(),
      backend = new EncryptedBackend(),
      operations: OperationRecord[] = [],
      entities: Entity[] = [];
    for (let i = 0; i < 25; i++) {
      const next = entity(`goal-${i}`, "goal", {
        name: `Meta ${i}`,
        target: 100,
        saved: 0,
      });
      entities.push(next);
      operations.push(
        ...(await createOperations(
          emptyDocument(),
          document(next),
          keys,
          owner,
        )),
      );
    }
    state.doc = document(...entities);
    state.record = {
      ...state.record,
      envelope: await encryptDocument(state.doc, keys),
      pending: true,
    };
    await state.repository.commit(state.record, operations);
    await run(state, backend);
    expect(backend.calls.map((c) => c.operations.length)).toEqual([20, 5]);
    expect(backend.log).toHaveLength(25);
    expect(await state.repository.outbox(owner)).toEqual([]);
    expect(state.record.cursor).toBe(25);
  });
  it("creates the cloud header for a brand-new empty vault without requiring a financial operation", async () => {
    const state = await local(emptyDocument(), true),
      backend = new EncryptedBackend();
    const result = await run(state, backend);
    expect(backend.header).toEqual(keys.header);
    expect(backend.log).toHaveLength(0);
    expect(result.doc).toEqual(emptyDocument());
    expect(result.record.pending).toBe(false);
    expect(result.record.cursor).toBe(0);
    expect(result.record.lastSync).toBeTruthy();
  });
  it("replays the identical UUID and ciphertext after a lost response without duplicating the operation", async () => {
    const state = await local(document(bank()), true),
      backend = new EncryptedBackend();
    const original = clone(state.record),
      operation = (await state.repository.outbox(owner))[0];
    backend.loseNextResponse = true;
    await expect(run(state, backend)).rejects.toThrow(/response lost/);
    expect(await state.repository.get(owner)).toEqual(original);
    expect(await state.repository.outbox(owner)).toEqual([operation]);
    const result = await run(state, backend);
    expect(backend.log).toHaveLength(1);
    expect(backend.calls[0].operations).toEqual(backend.calls[1].operations);
    expect(result.record.pending).toBe(false);
    expect(result.record.cursor).toBe(1);
    expect(await state.repository.outbox(owner)).toEqual([]);
    expect(accountBalance(result.doc, "bank")).toBe(1000);
  });
  it("merges independent income and expense transactions from two devices instead of overwriting money", async () => {
    const backend = new EncryptedBackend(),
      desktop = await local(document(bank()), true),
      phone = await local(emptyDocument(), false, "phone");
    await run(desktop, backend);
    await run(phone, backend);
    const income = entity("income", "transaction", {
      accountId: "bank",
      amount: 100,
      type: "income",
      status: "confirmed",
      date: "2020-02-01",
    });
    const expense = entity("expense", "transaction", {
      accountId: "bank",
      amount: 50,
      type: "expense",
      status: "confirmed",
      date: "2020-02-01",
    });
    await save(desktop, editDocument(desktop.doc, income, "desktop"));
    await save(phone, editDocument(phone.doc, expense, "phone"));
    await run(desktop, backend);
    await run(phone, backend);
    await run(desktop, backend);
    expect(accountBalance(desktop.doc, "bank")).toBe(1050);
    expect(accountBalance(phone.doc, "bank")).toBe(1050);
    expect(
      desktop.doc.entities.filter((e) => e.kind === "transaction"),
    ).toHaveLength(2);
    expect(backend.log).toHaveLength(3);
  });
  it("retains concurrent goal conflicts, blocks revision, and synchronises explicit resolution", async () => {
    const backend = new EncryptedBackend(),
      desktop = await local(document(goal()), true),
      phone = await local(emptyDocument(), false, "phone");
    await run(desktop, backend);
    await run(phone, backend);
    await save(
      desktop,
      editDocument(
        desktop.doc,
        { ...desktop.doc.entities[0], data: { ...goal().data, saved: 100 } },
        "desktop",
      ),
    );
    await save(
      phone,
      editDocument(
        phone.doc,
        { ...phone.doc.entities[0], data: { ...goal().data, saved: 200 } },
        "phone",
      ),
    );
    await run(desktop, backend);
    await run(phone, backend);
    await run(desktop, backend);
    expect(desktop.doc.conflicts.length).toBeGreaterThan(0);
    const current = desktop.doc.entities[0];
    expect(() =>
      assertEditRevision(desktop.doc, current.id, current.vector),
    ).toThrow();
    await save(
      desktop,
      editDocument(
        desktop.doc,
        { ...current, data: { ...current.data, saved: 150 } },
        "desktop",
      ),
    );
    await run(desktop, backend);
    await run(phone, backend);
    expect(desktop.doc.conflicts).toEqual([]);
    expect(phone.doc.conflicts).toEqual([]);
    expect(phone.doc.entities[0].data.saved).toBe(150);
  });
  it("persists tombstones so an older device cannot resurrect a deleted goal", async () => {
    const backend = new EncryptedBackend(),
      desktop = await local(document(goal()), true),
      phone = await local(emptyDocument(), false, "phone");
    await run(desktop, backend);
    await run(phone, backend);
    const stale = clone(phone.doc);
    await save(
      desktop,
      editDocument(
        desktop.doc,
        { ...desktop.doc.entities[0], deleted: true },
        "desktop",
      ),
    );
    await run(desktop, backend);
    await run(phone, backend);
    expect(phone.doc.entities[0].deleted).toBe(true);
    expect(mergeDocuments(phone.doc, stale).entities[0].deleted).toBe(true);
  });
  it("atomically checkpoints pages and acknowledges an upload only when that operation is actually returned", async () => {
    const backend = new EncryptedBackend();
    for (let i = 0; i < 5; i++)
      await backend.seed(
        document(
          entity(`remote-${i}`, "goal", {
            name: `Meta ${i}`,
            target: 100,
            saved: 0,
          }),
        ),
      );
    const state = await local(document(bank()), true),
      operation = (await state.repository.outbox(owner))[0];
    state.repository.failAt.add(2);
    await expect(run(state, backend, 2)).rejects.toThrow(/transaction failed/);
    const persisted = (await state.repository.get(owner))!;
    expect(persisted.cursor).toBe(2);
    expect(persisted.lastSync).toBeUndefined();
    expect(
      (await decryptDocument(persisted.envelope, keys)).entities
        .map((e) => e.id)
        .sort(),
    ).toEqual(["bank", "remote-0", "remote-1"]);
    expect(await state.repository.outbox(owner)).toEqual([operation]);
    expect(state.repository.commits[0].acknowledged).toEqual([]);
    const result = await run(state, backend, 2);
    expect(result.record.cursor).toBe(6);
    expect(result.doc.entities).toHaveLength(6);
    expect(await state.repository.outbox(owner)).toEqual([]);
    expect(backend.log).toHaveLength(6);
    expect(backend.calls.map((c) => c.cursor)).toEqual([0, 2, 2, 4]);
    expect(state.repository.commits.at(-1)?.acknowledged).toEqual([
      operation.id,
    ]);
  });
  it("reconstructs a new device from cursor zero with an empty outbox", async () => {
    const backend = new EncryptedBackend();
    await backend.seed(document(bank(), goal()));
    const state = await local(),
      result = await run(state, backend, 1);
    expect(result.doc.entities.map((e) => e.id).sort()).toEqual([
      "bank",
      "goal",
    ]);
    expect(backend.calls[0].cursor).toBe(0);
    expect(backend.calls[0].operations).toEqual([]);
    expect(await backend.transport.bootstrap!()).toEqual(keys.header);
    expect(backend.log).toHaveLength(1);
  });
});

describe("failure isolation and account bindings", () => {
  it("rejects an account binding changed while a response is in flight", async () => {
    const state = await local(document(bank()), true),
      backend = new EncryptedBackend();
    const transport = {
      ...backend.transport,
      exchange: async (request: ExchangeRequest) => {
        const page = await backend.transport.exchange(request);
        state.repository.records.set(owner, {
          ...state.record,
          accountId: otherAccount,
        });
        return page;
      },
    };
    await expect(
      syncVault({ ...state, transport, active: () => true }),
    ).rejects.toThrow(/conta/i);
    expect((await state.repository.get(owner))?.cursor).toBe(0);
    expect(await state.repository.outbox(owner)).toHaveLength(1);
  });
  it("preserves the encrypted vault and outbox while offline", async () => {
    const state = await local(document(bank()), true),
      backend = new EncryptedBackend();
    backend.offline = true;
    const before = await state.repository.get(owner),
      queue = await state.repository.outbox(owner);
    await expect(run(state, backend)).rejects.toThrow(/offline/);
    expect(await state.repository.get(owner)).toEqual(before);
    expect(await state.repository.outbox(owner)).toEqual(queue);
    expect(state.repository.commits).toEqual([]);
  });
  it("rejects the wrong Supabase account or a revoked local authorisation before network access", async () => {
    const state = await local(document(bank()), true),
      backend = new EncryptedBackend();
    await expect(
      syncVault({
        ...state,
        transport: { ...backend.transport, accountId: otherAccount },
        active: () => true,
      }),
    ).rejects.toThrow(/conta/i);
    await expect(
      syncVault({
        ...state,
        record: { ...state.record, authorized: false },
        transport: backend.transport,
        active: () => true,
      }),
    ).rejects.toThrow(/conta/i);
    expect(backend.calls).toHaveLength(0);
  });
  it("rejects wrong cryptographic owners, vaults and cross-vault outbox entries", async () => {
    const state = await local(document(bank()), true),
      backend = new EncryptedBackend();
    await expect(
      syncVault({
        ...state,
        record: { ...state.record, owner: "another-owner" },
        transport: backend.transport,
        active: () => true,
      }),
    ).rejects.toThrow(/cofre/i);
    await expect(
      syncVault({
        ...state,
        record: {
          ...state.record,
          envelope: { ...state.record.envelope, vaultId: crypto.randomUUID() },
        },
        transport: backend.transport,
        active: () => true,
      }),
    ).rejects.toThrow(/cofre/i);
    const operation = (await state.repository.outbox(owner))[0];
    state.repository.queue.set(operation.id, {
      ...operation,
      vaultId: crypto.randomUUID(),
    });
    await expect(run(state, backend)).rejects.toThrow(/cofre/i);
    expect(backend.calls).toHaveLength(0);
  });
  it("does not advance a cursor for a foreign header, corrupted ciphertext or malformed remote document", async () => {
    for (const type of ["header", "cipher", "document"]) {
      const state = await local(),
        backend = new EncryptedBackend();
      await backend.seed(document(bank()));
      const malformed = await encryptDocument(
        { schema: 2, entities: [], conflicts: [] } as unknown as Document,
        keys,
      );
      backend.mutate = (page) =>
        type === "header"
          ? {
              ...page,
              header: { ...page.header, vaultId: crypto.randomUUID() },
            }
          : {
              ...page,
              operations: page.operations.map((o) => ({
                ...o,
                payload:
                  type === "cipher"
                    ? { ...o.payload, cipher: "AAAA" }
                    : malformed,
              })),
            };
      await expect(run(state, backend)).rejects.toThrow();
      expect((await state.repository.get(owner))?.cursor).toBe(0);
      expect(state.repository.commits).toEqual([]);
    }
  });
  it("rejects cursor jumps, duplicate rows and nonprogressing pagination", async () => {
    for (const mode of ["jump", "duplicate", "empty", "gap"]) {
      const state = await local(),
        backend = new EncryptedBackend();
      await backend.seed(document(bank()));
      backend.mutate = (page) =>
        mode === "jump"
          ? { ...page, cursor: page.cursor + 1 }
          : mode === "gap"
            ? {
                ...page,
                operations: page.operations.map((o) => ({
                  ...o,
                  seq: o.seq + 1,
                })),
                cursor: page.cursor + 1,
              }
            : mode === "empty"
              ? { ...page, operations: [], cursor: 0, has_more: true }
              : {
                  ...page,
                  operations: [
                    page.operations[0],
                    { ...page.operations[0], seq: 2 },
                  ],
                  cursor: 2,
                };
      await expect(run(state, backend)).rejects.toThrow();
      expect((await state.repository.get(owner))?.cursor).toBe(0);
    }
  });
  it("does not apply a delayed response after the active session changes", async () => {
    const state = await local(document(bank()), true),
      backend = new EncryptedBackend();
    let active = true;
    const transport = {
      ...backend.transport,
      exchange: async (request: ExchangeRequest) => {
        const response = await backend.transport.exchange(request);
        active = false;
        return response;
      },
    };
    await expect(
      syncVault({ ...state, transport, active: () => active }),
    ).rejects.toBeInstanceOf(SyncCancelledError);
    expect((await state.repository.get(owner))?.cursor).toBe(0);
    expect(await state.repository.outbox(owner)).toHaveLength(1);
  });
  it("refuses to silently clear pending financial data that has no durable operation", async () => {
    const state = await local(document(bank()));
    state.record.pending = true;
    state.repository.records.set(owner, clone(state.record));
    const backend = new EncryptedBackend();
    await expect(run(state, backend)).rejects.toThrow(/sem operações/);
    expect(backend.calls).toHaveLength(0);
    expect((await state.repository.get(owner))?.pending).toBe(true);
  });
  it("rejects a server acknowledgement containing a different payload for the same operation UUID", async () => {
    const state = await local(document(bank()), true),
      backend = new EncryptedBackend();
    const other = await encryptDocument(document(goal()), keys);
    backend.mutate = (page) => ({
      ...page,
      operations: page.operations.map((o) => ({ ...o, payload: other })),
    });
    await expect(run(state, backend)).rejects.toThrow(/mesma operação/);
    expect(await state.repository.outbox(owner)).toHaveLength(1);
    expect((await state.repository.get(owner))?.cursor).toBe(0);
  });
  it("rejects a different financial value at the same causal revision instead of silently ignoring it", async () => {
    const state = await local(document(bank())),
      backend = new EncryptedBackend();
    await backend.seed(
      document({ ...bank(), data: { ...bank().data, balance: 9000 } }),
    );
    await expect(run(state, backend)).rejects.toThrow(/revisão causal/);
    expect((await state.repository.get(owner))?.cursor).toBe(0);
    expect(
      accountBalance(
        await decryptDocument(
          (await state.repository.get(owner))!.envelope,
          keys,
        ),
        "bank",
      ),
    ).toBe(1000);
    expect(state.repository.commits).toEqual([]);
  });
  it("detects corrupted queued ciphertext before sending it to the append-only backend", async () => {
    const state = await local(document(bank()), true),
      backend = new EncryptedBackend();
    const operation = (await state.repository.outbox(owner))[0];
    state.repository.queue.set(operation.id, {
      ...operation,
      payload: { ...operation.payload, cipher: "AAAA" },
    });
    await expect(run(state, backend)).rejects.toThrow(/integridade/);
    expect(backend.calls).toHaveLength(0);
    expect(state.repository.queue.size).toBe(1);
  });
});

describe("RPC contract and deliberate retries", () => {
  it("adapts exact RPC parameter names and returns only the bootstrap header", async () => {
    const calls: { name: string; parameters?: Record<string, unknown> }[] = [];
    const transport = createRpcTransport({
      accountId,
      rpc: async (name, parameters) => {
        calls.push({ name, parameters });
        return {
          error: null,
          data:
            name === "horizon_bootstrap"
              ? keys.header
              : {
                  header: keys.header,
                  operations: [],
                  cursor: 0,
                  has_more: false,
                },
        };
      },
    });
    expect(await transport.bootstrap!()).toEqual(keys.header);
    await transport.exchange({
      vaultId: keys.header.vaultId,
      header: keys.header,
      operations: [],
      cursor: 0,
      limit: 10,
    });
    expect(calls[1]).toEqual({
      name: "horizon_exchange",
      parameters: {
        p_vault_id: keys.header.vaultId,
        p_header: keys.header,
        p_operations: [],
        p_cursor: 0,
        p_limit: 10,
      },
    });
    expect(calls[0].name).toBe("horizon_bootstrap");
    expect(Object.keys((await transport.bootstrap!())!)).not.toContain(
      "cipher",
    );
  });
  it("keeps a null bootstrap and propagates RPC failures", async () => {
    expect(
      await createRpcTransport({
        accountId,
        rpc: async () => ({ data: null, error: null }),
      }).bootstrap!(),
    ).toBeNull();
    await expect(
      createRpcTransport({
        accountId,
        rpc: async () => ({ data: null, error: { message: "not authorized" } }),
      }).bootstrap!(),
    ).rejects.toThrow(/authorized/);
  });
  it("normalises the expanded SQL bootstrap response and checks its vault binding", async () => {
    const expanded = {
      header: keys.header,
      vault_id: keys.header.vaultId,
      operations: [],
      cursor: 0,
      has_more: false,
    };
    const transport = createRpcTransport({
      accountId,
      rpc: async () => ({ data: expanded, error: null }),
    });
    expect(await transport.bootstrap!()).toEqual(keys.header);
    await expect(
      createRpcTransport({
        accountId,
        rpc: async () => ({
          data: { ...expanded, vault_id: crypto.randomUUID() },
          error: null,
        }),
      }).bootstrap!(),
    ).rejects.toThrow(/outro cofre/);
    expect(
      await createRpcTransport({
        accountId,
        rpc: async () => ({
          data: { ...expanded, header: null, vault_id: null },
          error: null,
        }),
      }).bootstrap!(),
    ).toBeNull();
    await expect(
      createRpcTransport({
        accountId,
        rpc: async () => ({ data: { ...expanded, header: null }, error: null }),
      }).bootstrap!(),
    ).rejects.toThrow(/cabeçalho/);
  });
  it("uses bounded exponential backoff while replaying the persisted UUID, and never retries protocol errors", async () => {
    const delays: number[] = [],
      operationId = crypto.randomUUID(),
      attempts: string[] = [];
    const result = await retryWithBackoff(
      async () => {
        attempts.push(operationId);
        if (attempts.length < 3) throw Error("timeout");
        return "ok";
      },
      {
        sleep: async (ms) => {
          delays.push(ms);
        },
        random: () => 1,
        baseDelay: 100,
        maxDelay: 150,
      },
    );
    expect(result).toBe("ok");
    expect(delays).toEqual([100, 150]);
    expect(new Set(attempts).size).toBe(1);
    let calls = 0;
    await expect(
      retryWithBackoff(
        async () => {
          calls++;
          throw new SyncProtocolError("wrong vault");
        },
        { sleep: async () => {} },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(1);
    await expect(
      retryWithBackoff(async () => "no", { active: () => false }),
    ).rejects.toBeInstanceOf(SyncCancelledError);
  });
});
