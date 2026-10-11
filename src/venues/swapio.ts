import type { ParseResult, QuoteRequest } from "../types.js";
import { fetchJson } from "../http.js";

export const SWAPIO_URL_PLACEHOLDER = "swap.io web-app quote endpoint";

/** Quote URL is the request swap.io's web app makes. Set SWAPIO_QUOTE_URL; never commit a default. */
export function swapIoQuoteUrl(): string | undefined {
  const raw = process.env.SWAPIO_QUOTE_URL?.trim();
  return raw ? raw : undefined;
}

export function swapioBody(req: QuoteRequest): Record<string, unknown> {
  return {
    input: { token: req.inputMint, amount: req.amountAtomic, chainKey: "sol" },
    output: { token: req.outputMint, chainKey: "sol" },
    slippageBps: req.slippageBps,
  };
}

interface SwapIoQuote {
  bestQuote?: boolean;
  output?: { amount?: string };
  input?: { amount?: string };
  priceImpactPct?: number;
  routeSummary?: string;
  routePlan?: unknown[];
  platformFee?: unknown;
  fees?: unknown;
  provider?: { key?: string; name?: string };
}

export function pickSwapIoBest(quotes: SwapIoQuote[]): SwapIoQuote | null {
  if (!quotes.length) return null;
  const marked = quotes.find((q) => q.bestQuote === true);
  if (marked) return marked;
  return quotes.reduce((best, q) => {
    const a = BigInt(q.output?.amount ?? "0");
    const b = BigInt(best.output?.amount ?? "0");
    return a > b ? q : best;
  });
}

export function parseSwapIoQuote(json: unknown): ParseResult {
  if (!json || typeof json !== "object") return { ok: false, error: "swap.io: empty body" };
  const o = json as { success?: boolean; quotes?: SwapIoQuote[]; error?: string };
  if (o.success === false || o.error) {
    return { ok: false, error: `swap.io: ${o.error ?? "success=false"}` };
  }
  const quotes = Array.isArray(o.quotes) ? o.quotes : [];
  const best = pickSwapIoBest(quotes);
  if (!best?.output?.amount) return { ok: false, error: "swap.io: no quotes" };
  const outputAtomic = BigInt(String(best.output.amount));
  const inputAtomic = BigInt(String(best.input?.amount ?? "0"));
  const hops = Array.isArray(best.routePlan) ? best.routePlan.length : null;
  const splits = Array.isArray(best.routePlan)
    ? best.routePlan.filter((hop) => {
        const pct = (hop as { percentage?: number }).percentage;
        return typeof pct === "number" && pct < 100;
      }).length > 0
      ? best.routePlan.length
      : 1
    : null;
  const provider = best.provider?.name ?? best.provider?.key ?? "";
  const summary = [provider, best.routeSummary].filter(Boolean).join(" | ");
  return {
    ok: true,
    outputAtomic,
    inputAtomic,
    routeSummary: summary,
    hops,
    splits,
    quotedFees: best.fees == null ? "" : JSON.stringify(best.fees),
    platformFee: best.platformFee == null ? "" : JSON.stringify(best.platformFee),
    priceImpact: best.priceImpactPct == null ? "" : String(best.priceImpactPct),
  };
}

export async function fetchSwapIo(req: QuoteRequest) {
  const url = swapIoQuoteUrl();
  if (!url) {
    return {
      url: SWAPIO_URL_PLACEHOLDER,
      res: { status: 0, latencyMs: 0, json: { error: "SWAPIO_QUOTE_URL unset" } },
      parsed: {
        ok: false as const,
        error: "SWAPIO_QUOTE_URL unset; swap.io venue skipped",
      },
    };
  }
  const res = await fetchJson(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://swap.io",
      referer: "https://swap.io/",
    },
    body: JSON.stringify(swapioBody(req)),
  });
  const parsed =
    res.status >= 200 && res.status < 300
      ? parseSwapIoQuote(res.json)
      : { ok: false as const, error: `swap.io HTTP ${res.status}` };
  return { url: SWAPIO_URL_PLACEHOLDER, res, parsed };
}
