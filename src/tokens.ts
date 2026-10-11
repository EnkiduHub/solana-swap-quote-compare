import type { Pair, Token } from "./types.js";

export const SLIPPAGE_BPS = 50;

export const USDC: Token = {
  symbol: "USDC",
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  decimals: 6,
};

export const SOL: Token = {
  symbol: "SOL",
  mint: "So11111111111111111111111111111111111111112",
  decimals: 9,
};

export const JUP: Token = {
  symbol: "JUP",
  mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  decimals: 6,
};

/** Bonk (legacy mint, 5 decimals): liquid long-tail meme. */
export const BONK: Token = {
  symbol: "BONK",
  mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  decimals: 5,
};

export const PAIRS: Pair[] = [
  { id: "SOL-USDC", input: SOL, output: USDC },
  { id: "JUP-USDC", input: JUP, output: USDC },
  { id: "BONK-USDC", input: BONK, output: USDC },
];

export const SIZE_USD = [10, 1000, 10000] as const;

export const VENUES = ["swap.io", "jupiter", "raydium"] as const;
