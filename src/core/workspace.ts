import { rows, type Document, type Entity } from "./model";

export const workspaceId = "my-horizon:workspace";
export const dashboardSections = [
  { id: "horizons", label: "Seus próximos horizontes" },
  { id: "pulse", label: "Novidades · Horizon Pulse" },
  { id: "contributions", label: "Aportes do mês" },
  { id: "activity", label: "Evolução e movimentações" },
  { id: "guidance", label: "Recomendações e saúde financeira" },
] as const;
export function workspace(doc: Document) {
  return rows(doc, "simulation").find((e) => e.id === workspaceId);
}
export function workspaceChange(
  doc: Document,
  patch: Record<string, unknown>,
): Pick<Entity, "id" | "kind" | "data"> {
  const old = workspace(doc);
  return {
    id: workspaceId,
    kind: "simulation" as const,
    data: {
      ...old?.data,
      tab: "workspace",
      name: "Preferências do espaço",
      ...patch,
    },
  };
}
export function dashboardLayout(doc: Document) {
  const saved = workspace(doc)?.data.dashboard;
  const ids = dashboardSections.map((s) => s.id);
  return Array.isArray(saved)
    ? [...new Set(saved)].filter((id): id is (typeof ids)[number] =>
        ids.includes(id),
      )
    : ids;
}
export function isInternalSetting(entity: Entity) {
  return (
    entity.kind === "simulation" &&
    [
      "workspace",
      "reserve-settings",
      "pulse-state",
      "journal",
      "milestone",
    ].includes(entity.data.tab)
  );
}
