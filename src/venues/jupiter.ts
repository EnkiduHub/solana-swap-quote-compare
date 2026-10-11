import type { ParseResult, QuoteRequest } from "../types.js";
import { fetchJson } from "../http.js";

/** Prefer the documented lite host; fall back to api.jup.ag if lite returns 5xx/empty (still keyless). */
export const JUPITER_QUOTE_URLS = [
  "https://lite-api.jup.ag/swap/v1/quote",
  "https://api.jup.ag/swap/v1/quote",
] as const;

export function jupiterQuoteUrl(req: QuoteRequest, base: string = JUPITER_QUOTE_URLS[0]): string {
  const q = new URL(base);
  q.searchParams.set("inputMint", req.inputMint);
  q.searchParams.set("outputMint", req.outputMint);
  q.searchParams.set("amount", req.amountAtomic);
  q.searchParams.set("slippageBps", String(req.slippageBps));
  return q.toString();
}

export function parseJupiterQuote(json: unknown): ParseResult {
  if (!json || typeof json !== "object") return { ok: false, error: "jupiter: empty body" };
  const o = json as Record<string, unknown>;
  if (typeof o.error === "string") return { ok: false, error: `jupiter: ${o.error}` };
  if (typeof o.outAmount !== "string" && typeof o.outAmount !== "number") {
    return { ok: false, error: "jupiter: missing outAmount" };
  }
  const outputAtomic = BigInt(String(o.outAmount));
  const inputAtomic = BigInt(String(o.inAmount ?? "0"));
  const routePlan = Array.isArray(o.routePlan) ? o.routePlan : [];
  const labels = routePlan.map((hop) => {
    if (!hop || typeof hop !== "object") return "?";
    const info = (hop as { swapInfo?: { label?: string } }).swapInfo;
    return info?.label ?? "?";
  });
  const percents = routePlan.map((hop) => {
    if (!hop || typeof hop !== "object") return null;
    const p = (hop as { percent?: number }).percent;
    return typeof p === "number" ? p : null;
  });
  const splits = percents.filter((p) => p !== null && p < 100).length > 0 ? routePlan.length : 1;
  const platformFee = o.platformFee == null ? "" : JSON.stringify(o.platformFee);
  return {
    ok: true,
    outputAtomic,
    inputAtomic,
    routeSummary: labels.join(" -> ") || "",
    hops: routePlan.length,
    splits,
    quotedFees: "",
    platformFee,
    priceImpact: o.priceImpactPct == null ? "" : String(o.priceImpactPct),
  };
}

export async function fetchJupiter(req: QuoteRequest) {
  let last: { url: string; res: Awaited<ReturnType<typeof fetchJson>>; parsed: ParseResult } | null = null;
  for (const base of JUPITER_QUOTE_URLS) {
    const url = jupiterQuoteUrl(req, base);
    const res = await fetchJson(url, { method: "GET" });
    const parsed =
      res.status >= 200 && res.status < 300
        ? parseJupiterQuote(res.json)
        : { ok: false as const, error: `jupiter HTTP ${res.status}` };
    last = { url, res, parsed };
    if (parsed.ok) return last;
  }
  return last!;
}
