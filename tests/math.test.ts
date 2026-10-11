import { describe, expect, it } from "vitest";
import {
  bpsVsBest,
  notionalToAtomic,
  perHundredTradesDiff,
  uiAmount,
} from "../src/math.js";

describe("bpsVsBest", () => {
  it("is 0 when outputs match", () => {
    expect(bpsVsBest(1_000_000n, 1_000_000n)).toBe(0);
  });

  it("is -100 bps when venue is 1% worse", () => {
    expect(bpsVsBest(99n, 100n)).toBeCloseTo(-100, 6);
  });

  it("is +50 bps when venue is 0.5% better", () => {
    expect(bpsVsBest(10050n, 10000n)).toBeCloseTo(50, 6);
  });

  it("returns null for zero best", () => {
    expect(bpsVsBest(1n, 0n)).toBeNull();
  });
});

describe("notional and ui", () => {
  it("converts $10 of $100 SOL into 0.1 SOL atomic", () => {
    expect(notionalToAtomic(10, 100, 9)).toBe(100_000_000n);
    expect(uiAmount(100_000_000n, 9)).toBeCloseTo(0.1);
  });
});

describe("perHundredTradesDiff", () => {
  it("is 100× the per-trade USDC gap", () => {
    expect(perHundredTradesDiff(9.9, 10)).toBeCloseTo(-10);
    expect(perHundredTradesDiff(10.05, 10)).toBeCloseTo(5);
  });
});
