import { z } from "zod";
import { envelopeSchema, type VaultKeys } from "../../core/crypto";
import { documentSchema, type Document } from "../../core/model";
import { compareVector, mergeDocuments } from "../../core/merge";
import type {
  ExchangePage,
  OperationRecord,
  SyncTransport,
  SyncVaultRecord,
  VaultHeader,
} from "./types";

export class SyncProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncProtocolError";
  }
}
export class SyncCancelledError extends Error {
  constructor() {
    super(
      "A sessão mudou. A sincronização foi interrompida com os dados locais preservados.",
    );
    this.name = "SyncCancelledError";
  }
}
export const uuidSchema = z.string().uuid();
export const headerSchema = envelopeSchema
  .omit({ iv: true, cipher: true })
  .strict();
const pageSchema = z
  .object({
    header: headerSchema,
    operations: z.array(
      z
        .object({
          op_id: uuidSchema,
          seq: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          payload: envelopeSchema,
        })
        .strict(),
    ),
    cursor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    has_more: z.boolean(),
  })
  .strict();

/** Stable comparison independent of JSON property insertion order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function checkedDocument(value: Document): Document {
  const doc = documentSchema.parse(value);
  if (
    new Set(doc.entities.map((e) => e.id)).size !== doc.entities.length ||
    new Set(doc.conflicts.map((c) => c.id)).size !== doc.conflicts.length
  )
    throw new SyncProtocolError(
      "O documento contém identificadores duplicados. Revise os dados antes de sincronizar.",
    );
  return doc;
}
/** The causal merge intentionally ignores equal revisions; reject inconsistent content first. */
export function mergeChecked(left: Document, right: Document): Document {
  const byId = new Map(left.entities.map((e) => [e.id, e]));
  for (const incoming of right.entities) {
    const existing = byId.get(incoming.id);
    if (!existing) continue;
    if (
      existing.kind !== incoming.kind ||
      (compareVector(existing.vector, incoming.vector) === "equal" &&
        (canonical(existing.data) !== canonical(incoming.data) ||
          !!existing.deleted !== !!incoming.deleted))
    )
      throw new SyncProtocolError(
        "Uma entidade possui conteúdo incompatível com sua revisão causal. Nada foi descartado; revise o conflito antes de sincronizar.",
      );
  }
  return checkedDocument(mergeDocuments(left, right));
}
export function assertHeader(
  header: VaultHeader,
  keys: Pick<VaultKeys, "header">,
) {
  headerSchema.parse(header);
  if (
    header.owner !== keys.header.owner ||
    header.vaultId !== keys.header.vaultId
  )
    throw new SyncProtocolError(
      "O servidor retornou um cofre diferente. Nenhum dado remoto foi aplicado.",
    );
  if (canonical(header) !== canonical(keys.header))
    throw new SyncProtocolError(
      "O cabeçalho de proteção do cofre mudou. Reabra o cofre antes de sincronizar.",
    );
}
export function assertBinding(
  record: SyncVaultRecord,
  keys: VaultKeys,
  transport: SyncTransport,
) {
  if (
    !uuidSchema.safeParse(transport.accountId).success ||
    !record.accountId ||
    record.accountId !== transport.accountId ||
    record.authorized === false
  )
    throw new SyncProtocolError(
      "A conta autenticada não está autorizada para este cofre.",
    );
  if (
    record.owner !== keys.header.owner ||
    record.envelope.owner !== record.owner ||
    record.envelope.vaultId !== keys.header.vaultId
  )
    throw new SyncProtocolError(
      "As chaves ou o registro pertencem a outro cofre.",
    );
  const { iv: _iv, cipher: _cipher, ...header } = record.envelope;
  assertHeader(header, keys);
  if (!Number.isSafeInteger(record.cursor ?? 0) || (record.cursor ?? 0) < 0)
    throw new SyncProtocolError(
      "O cursor local é inválido. Os dados locais foram preservados.",
    );
}
export function assertOperation(
  operation: OperationRecord,
  record: SyncVaultRecord,
  keys: VaultKeys,
) {
  if (
    !uuidSchema.safeParse(operation.id).success ||
    operation.owner !== record.owner ||
    operation.vaultId !== keys.header.vaultId ||
    operation.payload.owner !== record.owner ||
    operation.payload.vaultId !== operation.vaultId
  )
    throw new SyncProtocolError(
      "Há uma operação vinculada a outro cofre. Nada foi descartado.",
    );
  envelopeSchema.parse(operation.payload);
  const { iv: _iv, cipher: _cipher, ...header } = operation.payload;
  assertHeader(header, keys);
}
export function checkedPage(
  value: unknown,
  cursor: number,
  limit: number,
  keys: Pick<VaultKeys, "header">,
): ExchangePage {
  const page = pageSchema.parse(value);
  assertHeader(page.header, keys);
  if (page.operations.length > limit)
    throw new SyncProtocolError("A página remota excedeu o limite solicitado.");
  let last = cursor;
  const ids = new Set<string>();
  for (const operation of page.operations) {
    if (operation.seq !== last + 1 || ids.has(operation.op_id))
      throw new SyncProtocolError(
        "A sequência remota está repetida, incompleta ou fora de ordem. O cursor não avançou.",
      );
    assertHeader(
      (({ iv: _iv, cipher: _cipher, ...header }) => header)(operation.payload),
      keys,
    );
    last = operation.seq;
    ids.add(operation.op_id);
  }
  if (page.cursor !== last || (page.has_more && page.operations.length === 0))
    throw new SyncProtocolError(
      "A paginação remota não é segura. O cursor não avançou.",
    );
  return page;
}
