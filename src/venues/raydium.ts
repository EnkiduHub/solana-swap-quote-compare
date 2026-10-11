import type { ParseResult, QuoteRequest } from "../types.js";
import { fetchJson } from "../http.js";

export const RAYDIUM_QUOTE_URL = "https://transaction-v1.raydium.io/compute/swap-base-in";

export function raydiumQuoteUrl(req: QuoteRequest): string {
  const q = new URL(RAYDIUM_QUOTE_URL);
  q.searchParams.set("inputMint", req.inputMint);
  q.searchParams.set("outputMint", req.outputMint);
  q.searchParams.set("amount", req.amountAtomic);
  q.searchParams.set("slippageBps", String(req.slippageBps));
  q.searchParams.set("txVersion", "V0");
  return q.toString();
}

export function parseRaydiumQuote(json: unknown): ParseResult {
  if (!json || typeof json !== "object") return { ok: false, error: "raydium: empty body" };
  const o = json as { success?: boolean; msg?: string; data?: Record<string, unknown> };
  if (o.success === false) return { ok: false, error: `raydium: ${o.msg ?? "success=false"}` };
  const data = o.data;
  if (!data || data.outputAmount == null) return { ok: false, error: "raydium: missing outputAmount" };
  const outputAtomic = BigInt(String(data.outputAmount));
  const inputAtomic = BigInt(String(data.inputAmount ?? data.actualInputAmount ?? "0"));
  const routePlan = Array.isArray(data.routePlan) ? data.routePlan : [];
  const fees = routePlan.map((hop) => {
    if (!hop || typeof hop !== "object") return hop;
    const h = hop as { feeAmount?: string; feeRate?: number; poolId?: string };
    return { poolId: h.poolId, feeRate: h.feeRate, feeAmount: h.feeAmount };
  });
  return {
    ok: true,
    outputAtomic,
    inputAtomic,
    routeSummary: routePlan
      .map((hop) => (hop && typeof hop === "object" ? String((hop as { poolId?: string }).poolId ?? "") : ""))
      .filter(Boolean)
      .join(" -> "),
    hops: routePlan.length,
    splits: routePlan.length,
    quotedFees: fees.length ? JSON.stringify(fees) : "",
    platformFee: "",
    priceImpact: data.priceImpactPct == null ? "" : String(data.priceImpactPct),
  };
}

export async function fetchRaydium(req: QuoteRequest) {
  const url = raydiumQuoteUrl(req);
  const res = await fetchJson(url, { method: "GET" });
  const parsed =
    res.status >= 200 && res.status < 300
      ? parseRaydiumQuote(res.json)
      : { ok: false as const, error: `raydium HTTP ${res.status}` };
  return { url, res, parsed };
}
