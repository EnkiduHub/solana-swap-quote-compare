/** (venueOutput - bestOutput) / bestOutput in basis points. Negative = worse than best. */
export function bpsVsBest(venueOutput: bigint, bestOutput: bigint): number | null {
  if (bestOutput <= 0n) return null;
  // Keep 4 decimal places of a basis point without floating the bigints first.
  const scaled = (venueOutput - bestOutput) * 10_000_0000n;
  const q = scaled / bestOutput;
  return Number(q) / 10_000;
}

export function uiAmount(atomic: bigint, decimals: number): number {
  const den = 10 ** decimals;
  return Number(atomic) / den;
}

export function atomicFromUi(ui: number, decimals: number): bigint {
  if (!Number.isFinite(ui) || ui <= 0) {
    throw new Error(`invalid ui amount: ${ui}`);
  }
  const scaled = ui * 10 ** decimals;
  return BigInt(Math.round(scaled));
}

export function effectivePrice(outputAtomic: bigint, outputDecimals: number, inputUi: number): number | null {
  if (inputUi <= 0) return null;
  return uiAmount(outputAtomic, outputDecimals) / inputUi;
}

export function notionalToAtomic(
  notionalUsd: number,
  usdPerToken: number,
  decimals: number,
): bigint {
  if (!(usdPerToken > 0)) {
    throw new Error("usdPerToken must be > 0");
  }
  return atomicFromUi(notionalUsd / usdPerToken, decimals);
}

/** Arithmetic: 100 * (venueOut - bestOut) in output UI units. Not a forecast. */
export function perHundredTradesDiff(venueOutUi: number, bestOutUi: number): number {
  return 100 * (venueOutUi - bestOutUi);
}
