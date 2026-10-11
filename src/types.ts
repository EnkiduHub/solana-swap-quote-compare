export type VenueId = "swap.io" | "jupiter" | "raydium";

export type PairId = "SOL-USDC" | "JUP-USDC" | "BONK-USDC";

export interface Token {
  symbol: string;
  mint: string;
  decimals: number;
}

export interface Pair {
  id: PairId;
  input: Token;
  output: Token;
}

export interface QuoteRequest {
  inputMint: string;
  outputMint: string;
  amountAtomic: string;
  slippageBps: number;
}

export interface ParsedQuote {
  ok: true;
  outputAtomic: bigint;
  inputAtomic: bigint;
  routeSummary: string;
  hops: number | null;
  splits: number | null;
  quotedFees: string;
  platformFee: string;
  priceImpact: string;
}

export interface ParsedQuoteError {
  ok: false;
  error: string;
}

export type ParseResult = ParsedQuote | ParsedQuoteError;

export interface QuoteRecord {
  timestamp: string;
  round_id: string;
  venue: VenueId;
  pair: PairId;
  size_usd_target: number;
  slippage_bps: number;
  input_amount_atomic: string;
  input_amount_ui: string;
  output_amount_atomic: string;
  output_amount_ui: string;
  effective_price: string;
  vs_best_bps: string;
  route: string;
  hops: string;
  splits: string;
  quoted_fees: string;
  platform_fee: string;
  price_impact: string;
  latency_ms: string;
  status: "ok" | "error";
  error: string;
  raw_path: string;
  usd_per_input: string;
}

export const CSV_HEADERS: (keyof QuoteRecord)[] = [
  "timestamp",
  "round_id",
  "venue",
  "pair",
  "size_usd_target",
  "slippage_bps",
  "input_amount_atomic",
  "input_amount_ui",
  "output_amount_atomic",
  "output_amount_ui",
  "effective_price",
  "vs_best_bps",
  "route",
  "hops",
  "splits",
  "quoted_fees",
  "platform_fee",
  "price_impact",
  "latency_ms",
  "status",
  "error",
  "raw_path",
  "usd_per_input",
];
