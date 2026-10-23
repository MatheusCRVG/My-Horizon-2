import { emptyDocument, type Document } from "./model";
import { accountBalance, totals } from "./finance";
import { validateContributions } from "./contributions";
/** Read-only check after cross-device merges. Never discards remote history. */
export function reservationIntegrity(doc: Document): string {
  try {
    const funds = totals(doc, new Date().toISOString().slice(0, 7));
    validateContributions(
      doc,
      emptyDocument(),
      funds.balance + funds.invested - funds.committed,
      (id) => {
        const asset = doc.entities.find(
          (e) => e.id === id && e.kind === "asset" && !e.deleted,
        );
        return asset && ["fixed", "variable", "other"].includes(asset.data.type)
          ? Number(asset.data.amount)
          : accountBalance(doc, id);
      },
    );
    return "";
  } catch (err) {
    return (err as Error).message;
  }
}
