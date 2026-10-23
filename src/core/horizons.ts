import type { Entity, Document } from "./model";
import { savingSummary } from "./saving-targets";
export const horizonCategories = [
  {
    id: "travel",
    label: "Viagens",
    icon: "Plane",
    images: ["travel-coast", "travel-mountains"],
  },
  {
    id: "car",
    label: "Carros",
    icon: "Car",
    images: ["car-sport", "car-road"],
  },
  {
    id: "home",
    label: "Casa",
    icon: "House",
    images: ["home-modern", "home-interior"],
  },
  {
    id: "study",
    label: "Estudos",
    icon: "GraduationCap",
    images: ["study-books", "study-desk"],
  },
  {
    id: "reserve",
    label: "Reserva",
    icon: "ShieldCheck",
    images: ["reserve-lake", "reserve-forest"],
  },
  {
    id: "personal",
    label: "Objetivos pessoais",
    icon: "Target",
    images: ["personal-bike", "personal-sunrise"],
  },
  {
    id: "savings",
    label: "Juntar dinheiro",
    icon: "Wallet",
    images: ["reserve-lake", "personal-sunrise"],
  },
  {
    id: "other",
    label: "Outros objetivos",
    icon: "Target",
    images: ["personal-sunrise", "personal-bike"],
  },
] as const;
export type Cover = {
  type: "gallery" | "upload" | "icon";
  image?: string;
  data?: string;
  x: number;
  y: number;
  zoom: number;
  framing?: "focal";
};
export function horizonCategory(goal: Entity) {
  const id =
    goal.kind === "trip"
      ? "travel"
      : goal.data.horizonCategory ||
        (/reserv|emerg/i.test(goal.data.name)
          ? "reserve"
          : /viag|destino/i.test(goal.data.name)
            ? "travel"
            : /carro|moto|ve.culo/i.test(goal.data.name)
              ? "car"
              : /casa|morar|im.vel/i.test(goal.data.name)
                ? "home"
                : /estud|curso|faculdade/i.test(goal.data.name)
                  ? "study"
                  : "personal");
  return (
    horizonCategories.find((c) => c.id === id) ??
    horizonCategories.find((c) => c.id === "personal")!
  );
}
export const defaultCover = (goal: Entity): Cover => ({
  type: "gallery",
  image: horizonCategory(goal).images[0],
  x: 50,
  y: 50,
  zoom: 1,
});
export const coverSource = (cover: Cover) =>
  cover.type === "upload"
    ? cover.data
    : cover.type === "gallery" &&
        horizonCategories.some((c) =>
          (c.images as readonly string[]).includes(cover.image ?? ""),
        )
      ? `/covers/${cover.image}.webp`
      : undefined;
export const isFeatured = (goal: Entity) =>
  !goal.data.archived &&
  (goal.data.featured ?? Number(goal.data.priority ?? 2) >= 2);
export function horizonStatus(doc: Document, goal: Entity) {
  return goal.data.archived
    ? "archived"
    : savingSummary(doc, goal).remaining <= 0
      ? "completed"
      : "active";
}
export function validateCover(cover: Cover) {
  if (
    !["gallery", "upload", "icon"].includes(cover.type) ||
    ![cover.x, cover.y, cover.zoom].every(Number.isFinite) ||
    cover.x < 0 ||
    cover.x > 100 ||
    cover.y < 0 ||
    cover.y > 100 ||
    cover.zoom < 1 ||
    cover.zoom > 4 ||
    (cover.framing !== undefined && cover.framing !== "focal")
  )
    throw Error("Confira o enquadramento da capa.");
  if (
    cover.type === "upload" &&
    (!/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/.test(cover.data ?? "") ||
      (cover.data?.length ?? 0) > 300000)
  )
    throw Error("A foto comprimida é inválida ou muito grande.");
  if (cover.type === "gallery" && !coverSource(cover))
    throw Error("Escolha uma imagem válida da galeria.");
}
