import { z } from "zod";
export type Kind =
  | "account"
  | "transaction"
  | "card"
  | "goal"
  | "asset"
  | "budget"
  | "trip"
  | "simulation"
  | "contribution"
  | "rule";
export type Entity = {
  id: string;
  kind: Kind;
  data: Record<string, any>;
  vector: Record<string, number>;
  updatedAt: string;
  deleted?: boolean;
};
export type Conflict = { id: string; local: Entity; remote: Entity };
export type Document = { schema: 1; entities: Entity[]; conflicts: Conflict[] };
export const emptyDocument = (): Document => ({
  schema: 1,
  entities: [],
  conflicts: [],
});
export const kinds: Kind[] = [
  "account",
  "transaction",
  "card",
  "goal",
  "asset",
  "budget",
  "trip",
  "simulation",
  "contribution",
  "rule",
];
export const entitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "account",
    "transaction",
    "card",
    "goal",
    "asset",
    "budget",
    "trip",
    "simulation",
    "contribution",
    "rule",
  ]),
  data: z.record(z.any()),
  vector: z.record(z.number().int().nonnegative()),
  updatedAt: z.string(),
  deleted: z.boolean().optional(),
});
export const documentSchema = z.object({
  schema: z.literal(1),
  entities: z.array(entitySchema).max(100000),
  conflicts: z.array(
    z.object({ id: z.string(), local: entitySchema, remote: entitySchema }),
  ),
});
export const uid = () => crypto.randomUUID();
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const monthNow = () => today().slice(0, 7);
export const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(v) ? v : 0,
  );
export const number = (v: number, d = 1) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: d }).format(v);
export const dateLabel = (v: string) =>
  v ? new Date(v + "T12:00:00").toLocaleDateString("pt-BR") : "—";
export const categories = [
  "Moradia",
  "Alimentação",
  "Mercado",
  "Transporte",
  "Saúde",
  "Educação",
  "Lazer",
  "Viagens",
  "Compras",
  "Assinaturas",
  "Salário",
  "Renda extra",
  "Investimentos",
  "Outros",
];
export function addMonths(date: string, n: number, day?: number) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1 + n, 1);
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  dt.setDate(Math.min(day ?? d, last));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
export function monthsUntil(date: string, from = today()) {
  const [y, m] = date.split("-").map(Number);
  const [fy, fm] = from.split("-").map(Number);
  return Math.max(1, (y - fy) * 12 + m - fm);
}
export const cents = (v: number) => Math.round(v * 100);
export const fromCents = (v: number) => v / 100;
export function rows(doc: Document, kind: Kind) {
  return doc.entities.filter((e) => e.kind === kind && !e.deleted);
}
