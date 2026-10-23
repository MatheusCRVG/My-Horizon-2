import { beforeAll, describe, expect, it } from "vitest";
import {
  createKeys,
  decryptDocument,
  type VaultKeys,
} from "../src/core/crypto";
import { emptyDocument, type Document, type Entity } from "../src/core/model";
import {
  createOperations,
  createRpcTransport,
  SyncCancelledError,
  type ExchangePage,
  type OperationRecord,
} from "../src/services/sync";
import {
  documentFits,
  jsonbBytes,
  MAX_CIPHER_BYTES,
  MAX_UPLOAD_BYTES,
  selectUploadBatch,
} from "../src/services/sync/limits";

let keys: VaultKeys;
const accountId = "11111111-1111-4111-8111-111111111111";
beforeAll(async () => {
  keys = (await createKeys("sync-limits-master-password", "legacy-owner")).keys;
});
const entity = (
  id: string,
  kind: Entity["kind"],
  data: Entity["data"],
): Entity => ({
  id,
  kind,
  data,
  vector: { seed: 1 },
  updatedAt: "2026-10-23T00:00:00Z",
});
const doc = (...entities: Entity[]): Document => ({
  schema: 1,
  entities,
  conflicts: [],
});
const upload = (cipher = "A".repeat(64)): OperationRecord => ({
  id: crypto.randomUUID(),
  owner: keys.header.owner,
  vaultId: keys.header.vaultId,
  payload: { ...keys.header, iv: "A".repeat(16), cipher },
  createdAt: "2026-10-23T00:00:00Z",
});

describe("SQL upload and encrypted operation boundaries", () => {
  it("counts PostgreSQL JSONB separators and UTF-8 bytes without rewriting punctuation inside strings", () => {
    const value = { a: [1, "á"], b: "x,y:z" };
    expect(jsonbBytes(value)).toBe(
      new TextEncoder().encode('{"a": [1, "á"], "b": "x,y:z"}').length,
    );
  });
  it("never sends more than twenty operations in one exchange", () => {
    const operations = Array.from({ length: 25 }, () => upload());
    const first = selectUploadBatch(operations),
      second = selectUploadBatch(operations.slice(first.length));
    expect(first).toEqual(operations.slice(0, 20));
    expect(second).toEqual(operations.slice(20));
    expect(operations).toHaveLength(25);
  });
  it("splits two maximum-size ciphertexts because their JSON overhead exceeds sixteen MiB", () => {
    const operations = [
      upload("A".repeat(MAX_CIPHER_BYTES)),
      upload("A".repeat(MAX_CIPHER_BYTES)),
      upload(),
    ];
    expect(selectUploadBatch(operations)).toEqual([operations[0]]);
    const remainder = selectUploadBatch(operations.slice(1));
    expect(remainder).toEqual(operations.slice(1));
    expect(
      jsonbBytes(remainder.map((o) => ({ op_id: o.id, payload: o.payload }))),
    ).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
  });
  it("checks AES-GCM authentication-tag and base64 padding overhead before encrypting", () => {
    const maximumPlaintext = (MAX_CIPHER_BYTES / 4) * 3 - 16;
    expect(documentFits(maximumPlaintext, keys)).toBe(true);
    expect(documentFits(maximumPlaintext + 1, keys)).toBe(false);
    expect(() =>
      selectUploadBatch([upload("A".repeat(MAX_CIPHER_BYTES + 4))]),
    ).toThrow(/limite/);
  });
  it("partitions a large legacy delta while keeping the changed goal and its deposit together", async () => {
    const large = "A".repeat(2_400_000);
    const source = doc(
      entity("independent", "goal", { target: 100, saved: 0, notes: large }),
      entity("linked-goal", "goal", { target: 100, saved: 0, notes: large }),
      entity("deposit", "contribution", {
        goalId: "linked-goal",
        amount: 10,
        date: "2026-10-23",
        status: "confirmed",
        notes: large,
      }),
    );
    const operations = await createOperations(
      emptyDocument(),
      source,
      keys,
      keys.header.owner,
    );
    expect(operations).toHaveLength(2);
    const decrypted = await Promise.all(
      operations.map((o) => decryptDocument(o.payload, keys)),
    );
    expect(decrypted.map((d) => d.entities.map((e) => e.id))).toEqual([
      ["independent"],
      ["linked-goal", "deposit"],
    ]);
    expect(
      operations.every((o) => o.payload.cipher.length <= MAX_CIPHER_BYTES),
    ).toBe(true);
    expect(new Set(operations.map((o) => o.id)).size).toBe(2);
    expect(source.entities[1].data.notes).toHaveLength(2_400_000);
  }, 15000);
  it("fails explicitly for an oversized single entity or related group rather than dropping financial data", async () => {
    await expect(
      createOperations(
        emptyDocument(),
        doc(entity("too-big", "goal", { notes: "A".repeat(6_400_000) })),
        keys,
        keys.header.owner,
      ),
    ).rejects.toThrow(/grande demais/);
    const shared = "A".repeat(3_200_000);
    await expect(
      createOperations(
        emptyDocument(),
        doc(
          entity("goal", "goal", { notes: shared }),
          entity("deposit", "contribution", {
            goalId: "goal",
            amount: 10,
            notes: shared,
          }),
        ),
        keys,
        keys.header.owner,
      ),
    ).rejects.toThrow(/conjunto/);
  }, 15000);
});

describe("automatic RPC retries retain the original operation", () => {
  const emptyPage = (): ExchangePage => ({
    header: keys.header,
    operations: [],
    cursor: 0,
    has_more: false,
  });
  it("retries network failures and 503 with identical UUID/ciphertext and bounded delays", async () => {
    const operation = (
      await createOperations(
        emptyDocument(),
        doc(entity("goal", "goal", { target: 100 })),
        keys,
        keys.header.owner,
      )
    )[0];
    const attempts: unknown[] = [],
      delays: number[] = [];
    const transport = createRpcTransport({
      accountId,
      backoff: {
        sleep: async (ms) => {
          delays.push(ms);
        },
        random: () => 1,
      },
      rpc: async (_name, parameters) => {
        attempts.push(structuredClone(parameters));
        if (attempts.length === 1) throw new TypeError("Failed to fetch");
        if (attempts.length === 2)
          return {
            data: null,
            error: { message: "temporary unavailable" },
            status: 503,
          };
        return { data: emptyPage(), error: null, status: 200 };
      },
    });
    await transport.exchange({
      vaultId: keys.header.vaultId,
      header: keys.header,
      operations: [{ op_id: operation.id, payload: operation.payload }],
      cursor: 0,
      limit: 100,
    });
    expect(attempts).toHaveLength(3);
    expect(attempts[0]).toEqual(attempts[1]);
    expect(attempts[1]).toEqual(attempts[2]);
    expect(delays).toEqual([250, 500]);
  });
  it("does not retry authorization errors, validation errors, rate limits or generic programming errors", async () => {
    for (const status of [400, 401, 403, 409, 429]) {
      let calls = 0;
      const transport = createRpcTransport({
        accountId,
        backoff: { sleep: async () => {} },
        rpc: async () => {
          calls++;
          return {
            data: null,
            error: { message: "permanent failure", code: "HV001" },
            status,
          };
        },
      });
      await expect(transport.bootstrap!()).rejects.toThrow(/permanent/);
      expect(calls).toBe(1);
    }
    let calls = 0;
    const programming = createRpcTransport({
      accountId,
      rpc: async () => {
        calls++;
        throw Error("unexpected calculator bug");
      },
    });
    await expect(programming.bootstrap!()).rejects.toThrow(/calculator/);
    expect(calls).toBe(1);
  });
  it("stops retrying when the authenticated session changes during backoff", async () => {
    let active = true,
      calls = 0;
    const transport = createRpcTransport({
      accountId,
      active: () => active,
      backoff: {
        sleep: async () => {
          active = false;
        },
      },
      rpc: async () => {
        calls++;
        return { data: null, error: { message: "temporary" }, status: 500 };
      },
    });
    await expect(transport.bootstrap!()).rejects.toBeInstanceOf(
      SyncCancelledError,
    );
    expect(calls).toBe(1);
  });
});
