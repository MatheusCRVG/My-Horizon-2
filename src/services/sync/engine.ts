import { decryptDocument, encryptDocument } from "../../core/crypto";
import {
  assertBinding,
  assertOperation,
  canonical,
  checkedDocument,
  checkedPage,
  mergeChecked,
  SyncCancelledError,
  SyncProtocolError,
} from "./protocol";
import type { SyncOptions, SyncVaultRecord } from "./types";
import {
  MAX_PAGE_OPERATIONS,
  selectUploadBatch,
  assertPageSize,
} from "./limits";

/** Caller must serialize this operation with local edits through the same owner lock.
 * Only repository.commit may acknowledge operations or advance the persisted cursor.
 */
export async function syncVault<R extends SyncVaultRecord>({
  record: initial,
  keys,
  doc: initialDoc,
  repository,
  transport,
  active,
  limit = 100,
}: SyncOptions<R>): Promise<{
  record: R;
  doc: ReturnType<typeof checkedDocument>;
}> {
  const guard = () => {
    if (!active()) throw new SyncCancelledError();
  };
  guard();
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_OPERATIONS)
    throw new SyncProtocolError("Use páginas de 1 a 100 operações.");
  assertBinding(initial, keys, transport);
  let record = (await repository.get(initial.owner)) ?? initial;
  assertBinding(record, keys, transport);
  let doc = checkedDocument(
    mergeChecked(
      await decryptDocument(record.envelope, keys),
      checkedDocument(initialDoc),
    ),
  );
  for (let pageNumber = 0; pageNumber < 10000; pageNumber++) {
    guard();
    const latest = (await repository.get(record.owner)) ?? record;
    assertBinding(latest, keys, transport);
    if ((latest.cursor ?? 0) < (record.cursor ?? 0))
      throw new SyncProtocolError(
        "O cursor local regrediu durante a sincronização.",
      );
    record = latest;
    doc = checkedDocument(
      mergeChecked(await decryptDocument(record.envelope, keys), doc),
    );
    const outbox = await repository.outbox(record.owner);
    for (const operation of outbox) {
      assertOperation(operation, record, keys);
      checkedDocument(await decryptDocument(operation.payload, keys));
    }
    if (new Set(outbox.map((o) => o.id)).size !== outbox.length)
      throw new SyncProtocolError(
        "A fila contém operações duplicadas. Nada foi descartado.",
      );
    if (
      record.pending &&
      !outbox.length &&
      (doc.entities.length || doc.conflicts.length)
    )
      throw new SyncProtocolError(
        "Há alterações pendentes sem operações persistidas. Recrie a fila a partir dos dados locais antes de sincronizar.",
      );
    const cursor = record.cursor ?? 0;
    const submitted = selectUploadBatch(outbox);
    guard();
    const response = await transport.exchange({
      vaultId: keys.header.vaultId,
      header: keys.header,
      operations: submitted.map((o) => ({ op_id: o.id, payload: o.payload })),
      cursor,
      limit,
    });
    guard();
    const page = checkedPage(response, cursor, limit, keys);
    assertPageSize(page);
    const acknowledged: string[] = [];
    for (const operation of page.operations) {
      const local = outbox.find((o) => o.id === operation.op_id);
      if (local) {
        if (canonical(local.payload) !== canonical(operation.payload))
          throw new SyncProtocolError(
            "O servidor retornou outro conteúdo para a mesma operação. Nada foi confirmado.",
          );
        acknowledged.push(local.id);
      }
      doc = checkedDocument(
        mergeChecked(
          doc,
          checkedDocument(await decryptDocument(operation.payload, keys)),
        ),
      );
    }
    guard();
    // Re-read before the atomic commit to retain changes saved by another local writer.
    const current = (await repository.get(record.owner)) ?? record;
    assertBinding(current, keys, transport);
    if ((current.cursor ?? 0) !== cursor)
      throw new SyncProtocolError(
        "Outro processo avançou a sincronização. Tente novamente com o estado atual.",
      );
    doc = checkedDocument(
      mergeChecked(await decryptDocument(current.envelope, keys), doc),
    );
    const currentOutbox = await repository.outbox(record.owner);
    for (const operation of currentOutbox)
      assertOperation(operation, current, keys);
    const pending = currentOutbox.some((o) => !acknowledged.includes(o.id));
    if (!page.has_more && pending && page.cursor === cursor)
      throw new SyncProtocolError(
        "O servidor não confirmou as operações enviadas. A fila local permanece preservada.",
      );
    const envelope = await encryptDocument(doc, keys);
    guard();
    const next = {
      ...current,
      envelope,
      cursor: page.cursor,
      pending,
      ...(!page.has_more && !pending
        ? { lastSync: new Date().toISOString() }
        : {}),
    } as R;
    await repository.commit(next, [], acknowledged);
    record = next;
    guard();
    if (!page.has_more && !pending) return { record, doc };
  }
  throw new SyncProtocolError(
    "O limite de páginas foi atingido. O progresso confirmado está salvo; continue a sincronização.",
  );
}
