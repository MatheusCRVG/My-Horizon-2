import type { Envelope, VaultKeys } from "../../core/crypto";
import { SyncProtocolError } from "./protocol";
import type { ExchangePage, OperationRecord } from "./types";

export const MAX_UPLOAD_OPERATIONS = 20;
export const MAX_PAGE_OPERATIONS = 100;
export const MAX_CIPHER_BYTES = 8 * 1024 * 1024;
export const MAX_PAYLOAD_BYTES = 8_400_000;
export const MAX_EXCHANGE_BYTES = 16 * 1024 * 1024;
// Leave space for RPC argument names, vault id and the <=8KiB protected header.
export const MAX_UPLOAD_BYTES = MAX_EXCHANGE_BYTES - 16 * 1024;
const encoder = new TextEncoder();

/** PostgreSQL jsonb::text adds a space after delimiters; include those, including UTF-8. */
export function jsonbBytes(value: unknown): number {
  if (Array.isArray(value))
    return (
      2 +
      value.reduce((s, v) => s + jsonbBytes(v), 0) +
      Math.max(0, value.length - 1) * 2
    );
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return (
      2 +
      entries.reduce(
        (s, [k, v]) =>
          s + encoder.encode(JSON.stringify(k)).length + 2 + jsonbBytes(v),
        0,
      ) +
      Math.max(0, entries.length - 1) * 2
    );
  }
  return encoder.encode(JSON.stringify(value) ?? "null").length;
}
export const plaintextBytes = (value: unknown) =>
  encoder.encode(JSON.stringify(value)).length;
export const encryptedBase64Length = (plainBytes: number) =>
  Math.ceil((plainBytes + 16) / 3) * 4;
export function documentFits(
  plainBytes: number,
  keys: Pick<VaultKeys, "header">,
) {
  const cipher = encryptedBase64Length(plainBytes);
  return (
    cipher <= MAX_CIPHER_BYTES &&
    jsonbBytes({ ...keys.header, iv: "A".repeat(16), cipher: "" }) + cipher <=
      MAX_PAYLOAD_BYTES
  );
}
export function assertPayloadSize(payload: Envelope) {
  if (
    payload.cipher.length > MAX_CIPHER_BYTES ||
    jsonbBytes(payload) > MAX_PAYLOAD_BYTES
  )
    throw new SyncProtocolError(
      "Uma operação excede o limite de sincronização. Preserve o cofre local e recrie sua fila em partes menores antes de tentar novamente.",
    );
}
export function assertPageSize(page: ExchangePage) {
  if (
    page.operations.length > MAX_PAGE_OPERATIONS ||
    page.operations.reduce((s, o) => s + jsonbBytes(o.payload), 0) >
      MAX_EXCHANGE_BYTES
  )
    throw new SyncProtocolError(
      "A página recebida excede o limite seguro de sincronização. O cursor local não avançou.",
    );
  for (const operation of page.operations) assertPayloadSize(operation.payload);
}
export function selectUploadBatch(
  operations: OperationRecord[],
): OperationRecord[] {
  const result: OperationRecord[] = [];
  let bytes = 2;
  for (const operation of operations) {
    if (result.length >= MAX_UPLOAD_OPERATIONS) break;
    assertPayloadSize(operation.payload);
    const next =
      jsonbBytes({ op_id: operation.id, payload: operation.payload }) +
      (result.length ? 2 : 0);
    if (bytes + next > MAX_UPLOAD_BYTES) break;
    result.push(operation);
    bytes += next;
  }
  if (operations.length && !result.length)
    throw new SyncProtocolError(
      "Uma operação não cabe no lote de sincronização. Nenhum dado foi descartado.",
    );
  return result;
}
