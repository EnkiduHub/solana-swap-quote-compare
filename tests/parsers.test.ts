import { describe, expect, it } from "vitest";
import { parseJupiterQuote } from "../src/venues/jupiter.js";
import { parseRaydiumQuote } from "../src/venues/raydium.js";
import { parseSwapIoQuote, pickSwapIoBest } from "../src/venues/swapio.js";
import { parseCsvLine, recordToLine } from "../src/csv.js";
import { CSV_HEADERS, type QuoteRecord } from "../src/types.js";

describe("parseJupiterQuote", () => {
  it("reads outAmount, hops, and null platform fee", () => {
    const parsed = parseJupiterQuote({
      inAmount: "100000000",
      outAmount: "11247187",
      priceImpactPct: "0",
      platformFee: null,
      routePlan: [
        { swapInfo: { label: "Kipseli" }, percent: 100 },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.outputAtomic).toBe(11247187n);
      expect(parsed.hops).toBe(1);
      expect(parsed.routeSummary).toBe("Kipseli");
      expect(parsed.priceImpact).toBe("0");
    }
  });

  it("errors on missing outAmount", () => {
    const parsed = parseJupiterQuote({ error: "no route" });
    expect(parsed.ok).toBe(false);
  });
});

describe("parseSwapIoQuote", () => {
  it("picks bestQuote even if it is not first", () => {
    const quotes = [
      { bestQuote: false, output: { amount: "100" }, input: { amount: "1" }, provider: { name: "A" } },
      {
        bestQuote: true,
        output: { amount: "90" },
        input: { amount: "1" },
        provider: { name: "B" },
        platformFee: { feeBps: 1, feeAmount: "10" },
        priceImpactPct: 0.01,
        routePlan: [{ percentage: 100 }],
        routeSummary: "x -> y",
      },
    ];
    expect(pickSwapIoBest(quotes)?.provider?.name).toBe("B");
    const parsed = parseSwapIoQuote({ success: true, quotes });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.outputAtomic).toBe(90n);
      expect(parsed.platformFee).toContain("feeBps");
    }
  });
});

describe("parseRaydiumQuote", () => {
  it("reads nested data.outputAmount and pool fees", () => {
    const parsed = parseRaydiumQuote({
      success: true,
      data: {
        inputAmount: "100",
        outputAmount: "50",
        priceImpactPct: 0,
        routePlan: [{ poolId: "poolA", feeRate: 2, feeAmount: "20" }],
      },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.outputAtomic).toBe(50n);
      expect(parsed.quotedFees).toContain("feeAmount");
      expect(parsed.hops).toBe(1);
    }
  });
});

describe("csv roundtrip of commas in fees", () => {
  it("escapes JSON fee blobs", () => {
    const row = {
      timestamp: "t",
      round_id: "1",
      venue: "jupiter",
      pair: "SOL-USDC",
      size_usd_target: 10,
      slippage_bps: 50,
      input_amount_atomic: "1",
      input_amount_ui: "1",
      output_amount_atomic: "2",
      output_amount_ui: "2",
      effective_price: "2",
      vs_best_bps: "0",
      route: "a,b",
      hops: "1",
      splits: "1",
      quoted_fees: '{"x":1}',
      platform_fee: "",
      price_impact: "0",
      latency_ms: "1",
      status: "ok",
      error: "",
      raw_path: "p",
      usd_per_input: "1",
    } satisfies QuoteRecord;
    const line = recordToLine(row);
    const cols = parseCsvLine(line);
    expect(cols.length).toBe(CSV_HEADERS.length);
    expect(cols[CSV_HEADERS.indexOf("route")]).toBe("a,b");
  });
});
