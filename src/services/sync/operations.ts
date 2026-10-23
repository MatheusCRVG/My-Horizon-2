import { encryptDocument, type VaultKeys } from "../../core/crypto";
import { compareVector } from "../../core/merge";
import type { Document, Entity, Conflict } from "../../core/model";
import { canonical, checkedDocument, SyncProtocolError } from "./protocol";
import type { OperationRecord } from "./types";
import { documentFits, plaintextBytes } from "./limits";

/** Keep linked goal movements/conflicts together; split only independent logical groups. */
function partitionDelta(delta: Document, keys: VaultKeys): Document[] {
  const parents = new Map<string, string>();
  const ranks = new Map<string, number>();
  const find = (id: string): string => {
    if (!parents.has(id)) parents.set(id, id);
    let root = id;
    while (parents.get(root) !== root) root = parents.get(root)!;
    let current = id;
    while (parents.get(current) !== root) {
      const next = parents.get(current)!;
      parents.set(current, root);
      current = next;
    }
    return root;
  };
  const join = (a: string, b: string) => {
    const ra = find(a),
      rb = find(b);
    if (ra === rb) return;
    const ar = ranks.get(ra) ?? 0,
      br = ranks.get(rb) ?? 0;
    if (ar < br) parents.set(ra, rb);
    else {
      parents.set(rb, ra);
      if (ar === br) ranks.set(ra, ar + 1);
    }
  };
  for (const entity of delta.entities) {
    find(entity.id);
    if (entity.kind === "contribution") {
      if (typeof entity.data.goalId === "string")
        join(entity.id, entity.data.goalId);
      if (typeof entity.data.transactionId === "string")
        join(entity.id, entity.data.transactionId);
    }
  }
  for (const conflict of delta.conflicts)
    join(conflict.local.id, conflict.remote.id);
  const groups = new Map<
    string,
    { entities: Entity[]; conflicts: Conflict[] }
  >();
  const group = (id: string) => {
    const root = find(id);
    let value = groups.get(root);
    if (!value) {
      value = { entities: [], conflicts: [] };
      groups.set(root, value);
    }
    return value;
  };
  for (const entity of delta.entities) group(entity.id).entities.push(entity);
  for (const conflict of delta.conflicts)
    group(conflict.local.id).conflicts.push(conflict);
  const base = plaintextBytes({ schema: 1, entities: [], conflicts: [] });
  const bytesFor = (
    entityBytes: number,
    entityCount: number,
    conflictBytes: number,
    conflictCount: number,
  ) =>
    base +
    entityBytes +
    Math.max(0, entityCount - 1) +
    conflictBytes +
    Math.max(0, conflictCount - 1);
  const parts: Document[] = [];
  let current: Document = { schema: 1, entities: [], conflicts: [] };
  let entityBytes = 0,
    conflictBytes = 0;
  for (const value of groups.values()) {
    const groupEntityBytes = value.entities.reduce(
        (s, e) => s + plaintextBytes(e),
        0,
      ),
      groupConflictBytes = value.conflicts.reduce(
        (s, c) => s + plaintextBytes(c),
        0,
      );
    if (
      !documentFits(
        bytesFor(
          groupEntityBytes,
          value.entities.length,
          groupConflictBytes,
          value.conflicts.length,
        ),
        keys,
      )
    )
      throw new SyncProtocolError(
        "Uma entidade ou conjunto de horizonte e aportes é grande demais para sincronizar com segurança. Reduza os anexos ou divida esse conjunto antes de salvar; nenhum dado foi descartado.",
      );
    if (
      !documentFits(
        bytesFor(
          entityBytes + groupEntityBytes,
          current.entities.length + value.entities.length,
          conflictBytes + groupConflictBytes,
          current.conflicts.length + value.conflicts.length,
        ),
        keys,
      )
    ) {
      parts.push(current);
      current = { schema: 1, entities: [], conflicts: [] };
      entityBytes = 0;
      conflictBytes = 0;
    }
    for (const entity of value.entities) current.entities.push(entity);
    for (const conflict of value.conflicts) current.conflicts.push(conflict);
    entityBytes += groupEntityBytes;
    conflictBytes += groupConflictBytes;
  }
  if (current.entities.length || current.conflicts.length) parts.push(current);
  return parts;
}

/** Call once while committing an edit. Persist returned UUID/ciphertext with the new vault. */
export async function createOperations(
  previous: Document,
  next: Document,
  keys: VaultKeys,
  owner: string,
): Promise<OperationRecord[]> {
  if (owner !== keys.header.owner)
    throw new SyncProtocolError(
      "A operação não pertence ao proprietário criptográfico do cofre.",
    );
  const before = checkedDocument(previous),
    after = checkedDocument(next);
  const oldEntities = new Map(before.entities.map((e) => [e.id, e]));
  const newEntities = new Map(after.entities.map((e) => [e.id, e]));
  const changed = new Set<string>();
  for (const entity of before.entities)
    if (!newEntities.has(entity.id))
      throw new SyncProtocolError(
        "Uma entidade desapareceu sem tombstone. Use a exclusão preservando o histórico antes de sincronizar.",
      );
  for (const entity of after.entities) {
    const old = oldEntities.get(entity.id);
    if (!old) {
      changed.add(entity.id);
      continue;
    }
    if (old.kind !== entity.kind)
      throw new SyncProtocolError(
        "O tipo de uma entidade existente não pode mudar durante a sincronização.",
      );
    if (canonical(old) === canonical(entity)) continue;
    const relation = compareVector(entity.vector, old.vector);
    if (relation === "before" || relation === "equal")
      throw new SyncProtocolError(
        "Uma alteração não possui uma revisão causal válida. Nada foi enviado.",
      );
    changed.add(entity.id);
  }
  const oldConflicts = new Map(before.conflicts.map((c) => [c.id, c]));
  const newConflictIds = new Set(after.conflicts.map((c) => c.id));
  for (const conflict of before.conflicts)
    if (!newConflictIds.has(conflict.id)) {
      const resolved = newEntities.get(conflict.local.id);
      if (
        !resolved ||
        compareVector(resolved.vector, conflict.local.vector) !== "after" ||
        compareVector(resolved.vector, conflict.remote.vector) !== "after"
      )
        throw new SyncProtocolError(
          "Um conflito foi removido sem uma resolução explícita. Os dados foram preservados.",
        );
      changed.add(resolved.id);
    }
  const conflicts = after.conflicts.filter(
    (c) =>
      changed.has(c.local.id) ||
      changed.has(c.remote.id) ||
      canonical(oldConflicts.get(c.id)) !== canonical(c),
  );
  if (!changed.size && !conflicts.length) return [];
  const delta: Document = {
    schema: 1,
    entities: after.entities.filter((e) => changed.has(e.id)),
    conflicts,
  };
  const operations: OperationRecord[] = [];
  for (const part of partitionDelta(delta, keys))
    operations.push({
      id: crypto.randomUUID(),
      owner,
      vaultId: keys.header.vaultId,
      payload: await encryptDocument(part, keys),
      createdAt: new Date().toISOString(),
    });
  return operations;
}
