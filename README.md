# solana-swap-quote-compare

A small TypeScript script that asks three Solana venues for a swap quote at the same time, for the same pair and the same input amount, and records what each one says you would get back.

Venues:

- swap.io (the quote request its web app makes; you supply the URL in `SWAPIO_QUOTE_URL`)
- Jupiter (free lite quote API, `https://lite-api.jup.ag/swap/v1/quote`, no key)
- Raydium (Trade API compute quote, Raydium pools only)

## What it measures

Sell SOL, JUP and BONK for USDC at about $10, $1,000 and $10,000, with 0.5% slippage (50 bps). For each (pair, size) cell, every venue gets the identical input amount within a few seconds, and we compare the USDC output each one quotes. Results are reported in USDC and in basis points behind the best quote (1 bps = 0.01%). swap.io losses are listed the same way as its wins.

Full details: `METHOD.md`. Results: `RESULTS.md`.

## What is in the repo

- `src/`: collector, venue parsers, report builder
- `tests/`: unit tests (vitest)
- `data/quotes.csv`: every quote from 4 rounds on Oct 11, 2026 (108 rows, 107 successful, 1 Jupiter HTTP 500)
- `data/raw/<round>/`: the raw JSON response for every quote. In swap.io responses, the quote endpoint is replaced with `<SWAPIO_QUOTE_URL>` and image/asset URLs with `<SWAPIO_ASSET_URL>`.
- `RESULTS.md`: tables built from the CSV
- `METHOD.md`: endpoints, request bodies, sizing, venues we could not include and why

No wallets, no keys, no signing, no swaps. The script only reads quotes.

## How to rerun

Requires Node.js 20 or newer.

```bash
npm ci
npm test
export SWAPIO_QUOTE_URL='<the quote request the swap.io web app makes>'   # optional
npm run collect    # one round: 3 pairs x 3 sizes x 3 venues, appends to data/quotes.csv
npm run collect    # run again later for another round (we waited 15+ minutes)
npm run report     # rebuild RESULTS.md from data/quotes.csv
```

If `SWAPIO_QUOTE_URL` is not set, swap.io is skipped and the other venues still run. You can find the URL in your browser's network tab while requesting a quote on swap.io.

## Limits

- Quotes, not fills. A quote is not a promise; what you receive when you sign can differ.
- 4 rounds on one day (Oct 11, 2026: 10:46, 11:02 and 11:20 AM, and 2:11 PM PT), from one region.
- One real swap was made separately (0.09 SOL to USDC on swap.io) to compare one quote with one fill. One swap is one data point.
- Jupiter here is its free quote API, which may differ from what the jup.ag app shows.
- OKX DEX, DFlow and some other venues need API keys and were not queried directly (see `METHOD.md`).
- Raydium's router only uses Raydium pools, so it is not an aggregator-to-aggregator comparison.

## License

MIT, see `LICENSE`. Not affiliated with swap.io, Jupiter or Raydium.
