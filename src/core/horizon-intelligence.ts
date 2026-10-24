export type QuoteRecord = {
  source: string; sourceUrl: string; label: string; amount: number;
  reference: string; fetchedAt: string; externalId?: string;
  locked: boolean; category: "travel" | "car"; field: string;
  origin?: string; bookBy?: string;
};
export type PriceUpdatePolicy = "approval" | "automatic" | "off";
/** Pure financial calculation, independent of external provider results. */
export function calculateMilestoneSavings(target: number, deadline: string, alreadySaved = 0, from = new Date()) {
  const [year, month] = deadline.split("-").map(Number);
  if (!year || !month || !Number.isFinite(target) || !Number.isFinite(alreadySaved) || target < 0 || alreadySaved < 0) {
    return { monthly: 0, months: 0, remaining: 0, valid: false };
  }
  const months = Math.max(1, (year - from.getFullYear()) * 12 + month - 1 - from.getMonth());
  const remaining = Math.round(Math.max(0, target - alreadySaved) * 100) / 100;
  return { monthly: Math.ceil((remaining / months) * 100) / 100, months, remaining, valid: true };
}
export function quoteNeedsReview(current: QuoteRecord | null, candidate: QuoteRecord, policy: PriceUpdatePolicy) {
  if (policy === "off" || current?.locked) return "ignore" as const;
  if (current && current.amount === candidate.amount && current.reference === candidate.reference) return "unchanged" as const;
  return policy === "automatic" ? "apply" as const : "approval" as const;
}
