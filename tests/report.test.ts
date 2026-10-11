import { describe, expect, it } from "vitest";
import { buildResultsMarkdown, winnerSummary } from "../src/report.js";
import type { QuoteRecord } from "../src/types.js";

function row(over: Partial<QuoteRecord>): QuoteRecord {
  return {
    timestamp: "2026-10-11T00:00:00.000Z",
    round_id: "1-test",
    venue: "jupiter",
    pair: "SOL-USDC",
    size_usd_target: 10,
    slippage_bps: 50,
    input_amount_atomic: "1",
    input_amount_ui: "1",
    output_amount_atomic: "10",
    output_amount_ui: "10",
    effective_price: "10",
    vs_best_bps: "0",
    route: "x",
    hops: "1",
    splits: "1",
    quoted_fees: "",
    platform_fee: "null",
    price_impact: "0",
    latency_ms: "10",
    status: "ok",
    error: "",
    raw_path: "p",
    usd_per_input: "100",
    ...over,
  };
}

function trio(over: Partial<QuoteRecord> = {}): QuoteRecord[] {
  return [
    row({ venue: "jupiter", output_amount_ui: "10", vs_best_bps: "0", ...over }),
    row({ venue: "raydium", output_amount_ui: "9.9", vs_best_bps: "-100", ...over }),
    row({
      venue: "swap.io",
      output_amount_ui: "9.8",
      vs_best_bps: "-200",
      platform_fee: '{"feeBps":1}',
      ...over,
    }),
  ];
}

describe("winnerSummary", () => {
  it("counts only cells where all three venues returned ok", () => {
    const complete = trio();
    const incomplete = [
      row({
        pair: "JUP-USDC",
        size_usd_target: 10000,
        venue: "swap.io",
        output_amount_ui: "9995",
        status: "ok",
        platform_fee: '{"feeBps":2}',
      }),
      row({
        pair: "JUP-USDC",
        size_usd_target: 10000,
        venue: "raydium",
        output_amount_ui: "9512",
        status: "ok",
      }),
      row({
        pair: "JUP-USDC",
        size_usd_target: 10000,
        venue: "jupiter",
        status: "error",
        error: "jupiter HTTP 500",
        output_amount_ui: "",
      }),
    ];
    const summary = winnerSummary([...complete, ...incomplete]);
    expect(summary.completeCells).toBe(1);
    expect(summary.counts.jupiter).toBe(1);
    expect(summary.counts["swap.io"]).toBe(0);
    expect(summary.excluded).toHaveLength(1);
    expect(summary.excluded[0].pair).toBe("JUP-USDC");
    expect(summary.excluded[0].size_usd_target).toBe(10000);
    expect(summary.excluded[0].reason).toContain("jupiter HTTP 500");
  });
});

describe("buildResultsMarkdown", () => {
  it("counts swap.io as a loss when it is not best on a complete cell", () => {
    const md = buildResultsMarkdown(trio());
    expect(md).toContain("| jupiter | 1 |");
    expect(md).toContain("| swap.io | 0 |");
    expect(md).toContain("all three venues returned ok");
    expect(md).toContain("not a forecast");
  });

  it("lists excluded incomplete cells and reports feeBps per pair", () => {
    const md = buildResultsMarkdown([
      ...trio({ pair: "SOL-USDC", platform_fee: '{"feeBps":1}' }),
      row({
        pair: "JUP-USDC",
        size_usd_target: 10000,
        venue: "jupiter",
        status: "error",
        error: "jupiter HTTP 500",
        output_amount_ui: "",
      }),
      row({
        pair: "JUP-USDC",
        size_usd_target: 10000,
        venue: "swap.io",
        status: "ok",
        platform_fee: '{"feeBps":2}',
        output_amount_ui: "1",
      }),
      row({
        pair: "JUP-USDC",
        size_usd_target: 10000,
        venue: "raydium",
        status: "ok",
        output_amount_ui: "1",
      }),
    ]);
    expect(md).toContain("JUP-USDC $10000");
    expect(md).toContain("jupiter HTTP 500");
    expect(md).toContain("SOL-USDC: 1 bps");
    expect(md).toContain("JUP-USDC: 2 bps");
    expect(md).toContain("not a flat 1 bps");
  });
});
