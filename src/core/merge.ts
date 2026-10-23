import type { Document, Entity } from "./model";
export const goalMovementRevision = (doc: Document, goalId: string) =>
  JSON.stringify(
    doc.entities
      .filter((e) => e.kind === "contribution" && e.data.goalId === goalId)
      .map((e) => [e.id, Object.entries(e.vector).sort(), !!e.deleted])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
export function assertEditRevision(
  doc: Document,
  id: string,
  expectedVector?: Entity["vector"],
  expectedMovements?: string,
) {
  const current = doc.entities.find((e) => e.id === id);
  if (
    expectedVector &&
    (!current ||
      current.deleted ||
      compareVector(current.vector, expectedVector) !== "equal" ||
      doc.conflicts.some((c) => c.local.id === id))
  )
    throw Error(
      "Este horizonte mudou em outra edição. Feche e reabra o planejamento para revisar a versão atual antes de salvar.",
    );
  if (
    expectedMovements !== undefined &&
    goalMovementRevision(doc, id) !== expectedMovements
  )
    throw Error(
      "O histórico de aportes mudou durante a revisão. Volte ao planejamento e confira os valores atualizados antes de confirmar.",
    );
  if (
    expectedMovements !== undefined &&
    doc.conflicts.some((c) =>
      [c.local, c.remote].some(
        (e) => e.kind === "contribution" && e.data.goalId === id,
      ),
    )
  )
    throw Error(
      "Há um conflito no histórico de aportes deste horizonte. Resolva a pendência antes de atualizar o planejamento.",
    );
}
export function compareVector(a: Entity["vector"], b: Entity["vector"]) {
  let greater = false,
    less = false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if ((a[k] ?? 0) > (b[k] ?? 0)) greater = true;
    if ((a[k] ?? 0) < (b[k] ?? 0)) less = true;
  }
  return greater && less
    ? "concurrent"
    : greater
      ? "after"
      : less
        ? "before"
        : "equal";
}
export function joinVector(...vectors: Entity["vector"][]) {
  const out: Entity["vector"] = {};
  for (const v of vectors)
    for (const [k, n] of Object.entries(v)) out[k] = Math.max(out[k] ?? 0, n);
  return out;
}
export function mergeDocuments(a: Document, b: Document): Document {
  const map = new Map(a.entities.map((e) => [e.id, e]));
  const conflicts = new Map(a.conflicts.map((c) => [c.id, c]));
  for (const c of b.conflicts) if (!conflicts.has(c.id)) conflicts.set(c.id, c);
  for (const remote of b.entities) {
    const local = map.get(remote.id);
    if (!local) {
      map.set(remote.id, remote);
      continue;
    }
    const relation = compareVector(local.vector, remote.vector);
    if (relation === "before") {
      map.set(remote.id, remote);
      const c = conflicts.get(remote.id);
      if (
        c &&
        compareVector(remote.vector, c.local.vector) === "after" &&
        compareVector(remote.vector, c.remote.vector) === "after"
      )
        conflicts.delete(remote.id);
    } else if (relation === "concurrent") {
      const same =
        JSON.stringify(local.data) === JSON.stringify(remote.data) &&
        local.deleted === remote.deleted;
      if (same)
        map.set(local.id, {
          ...local,
          vector: joinVector(local.vector, remote.vector),
        });
      else {
        const id = `${local.id}:${Object.entries(remote.vector)
          .sort()
          .map(([k, v]) => `${k}=${v}`)
          .join("|")}`;
        if (!conflicts.has(id)) conflicts.set(id, { id, local, remote });
      }
    }
  }
  // A later explicit resolution dominates both versions, including conflicts arriving from an older snapshot.
  for (const [id, c] of conflicts) {
    const e = map.get(c.local.id);
    if (
      e &&
      compareVector(e.vector, c.local.vector) === "after" &&
      compareVector(e.vector, c.remote.vector) === "after"
    )
      conflicts.delete(id);
  }
  return {
    schema: 1,
    entities: [...map.values()],
    conflicts: [...conflicts.values()],
  };
}
export function editDocument(
  doc: Document,
  entity: Pick<Entity, "id" | "kind" | "data" | "deleted">,
  device: string,
): Document {
  const old = doc.entities.find((e) => e.id === entity.id);
  const conflicts = doc.conflicts.filter((c) => c.local.id === entity.id);
  const vector = joinVector(
    old?.vector ?? {},
    ...conflicts.flatMap((c) => [c.local.vector, c.remote.vector]),
  );
  vector[device] = (vector[device] ?? 0) + 1;
  const next: Entity = {
    ...entity,
    vector,
    updatedAt: new Date().toISOString(),
  };
  return {
    ...doc,
    entities: [...doc.entities.filter((e) => e.id !== next.id), next],
    conflicts: doc.conflicts.filter((c) => c.local.id !== next.id),
  };
}
