# Method

Reproducible **quote-only** comparison. No wallets, no private keys, no signing, no swaps, no paid APIs.

## Venues used

| Venue | Endpoint | Auth | How the displayed quote is chosen |
| --- | --- | --- | --- |
| **swap.io** | the quote request swap.io's web app makes (configure via `SWAPIO_QUOTE_URL`) | none | Response `quotes[]`; we take the row with `bestQuote: true` (the UI default), not a nested provider |
| **Jupiter** | `GET https://lite-api.jup.ag/swap/v1/quote`, fallback `GET https://api.jup.ag/swap/v1/quote` if lite is 5xx | none (no API key sent) | Single `outAmount` |
| **Raydium** | `GET https://transaction-v1.raydium.io/compute/swap-base-in` | none | `data.outputAmount` |

If `SWAPIO_QUOTE_URL` is unset, the swap.io venue is skipped (`SWAPIO_QUOTE_URL unset; swap.io venue skipped`). The collector stores the swap.io request URL as the placeholder `swap.io web-app quote endpoint`, not the configured value. In the published raw JSON, the swap.io quote URL appears as `<SWAPIO_QUOTE_URL>` and swap.io asset/image URLs as `<SWAPIO_ASSET_URL>`.

### swap.io request body (exactly what we send)

```json
{
  "input":  { "token": "<input mint>", "amount": "<atomic string>", "chainKey": "sol" },
  "output": { "token": "<output mint>", "chainKey": "sol" },
  "slippageBps": 50
}
```

Headers: `content-type: application/json`, `origin: https://swap.io`, `referer: https://swap.io/`.

The web-app quote response is a ranked list of aggregator quotes. `platformFee.feeBps` in `data/quotes.csv` is **not a flat 1 bps**: **1 bps on every SOL-USDC row**, **2 bps on every JUP-USDC and BONK-USDC row**.

## Venues skipped

| Venue | Why skipped |
| --- | --- |
| Swap.io Agent API (Hermes `POST /v1/swap/quote`) | Official Agent API. Unpaid calls return **HTTP 402** (x402 USDC micropayment). Paid APIs are out of scope. |
| OKX DEX aggregator (`web3.okx.com/api/v6/dex/aggregator/quote`) | **HTTP 401**: `OK-ACCESS-KEY can not be empty`. |
| DFlow (`https://quote-api.dflow.net/quote`) | **HTTP 403** without `x-api-key`. |
| Titan DART / Portal | Public DART `POST /swap` requires a `userPublicKey`; Portal needs an API key. |
| Swap.io Neptune CLMM pool quote | Pool-only quote, not the meta-aggregator the web app uses for the main swap widget; a SOL→USDC probe returned HTTP 500. |

## Token mints

| Symbol | Mint | Decimals |
| --- | --- | --- |
| SOL (wSOL) | `So11111111111111111111111111111111111111112` | 9 |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 |
| JUP | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` | 6 |
| BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` | 5 |

Pairs (sell / ExactIn): `SOL→USDC`, `JUP→USDC`, `BONK→USDC`.

## Sizes and prices

Target notionals: **$10, $1,000, $10,000**.

At the start of each round we convert USD→input atomic units with a **Jupiter quote probe** (Price v2 404; Pyth Hermes now returns 401 without a paid key):

- SOL: 0.1 SOL → USDC
- JUP: 50 JUP → USDC
- BONK: 1,000,000 BONK → USDC

`usd_per_token = probe_out_USDC_ui / probe_in_ui`, then `input_atomic = round((target_usd / usd_per_token) * 10^decimals)`.

Probe prices are stored in `data/raw/<round>/_round-meta.json` and on every CSV row (`usd_per_input`).

## Slippage

**50 bps (0.50%)** on every venue, every size. Recorded as `slippage_bps`.

## Timing

- All three venues for a given pair×size are fired with `Promise.all` (same ~5 second window). A warning is logged if that fan-out exceeds 5s.
- Cells (pair×size) run sequentially to stay polite on public rate limits.
- Intended schedule: **≥2 full rounds, ≥15 minutes apart**. Round ids are `{n}-{ISO}` of round start.

## Per-quote fields

CSV: `data/quotes.csv`. Raw HTTP JSON: `data/raw/<round>/<venue>-<pair>-<size>.json` (swap.io files use venue id `swap.io` in the filename).

| Field | Source |
| --- | --- |
| `output_amount_*` | venue out amount (atomic + UI) |
| `effective_price` | output UI / input UI |
| `vs_best_bps` | `(venue_out - best_out) / best_out * 10_000` among successful venues in that cell |
| `route` / `hops` / `splits` | `routePlan` / `routeSummary` when returned |
| `quoted_fees` / `platform_fee` / `price_impact` | copied from the JSON when present; never invented |
| `latency_ms` | client wall time of that HTTP call |
| Failed fetch | `status=error`, empty output; raw body still saved |

Winner counts in `RESULTS.md` include only cells where swap.io, Jupiter, and Raydium all returned `ok`.

## Limitations

- **Quotes are not fills.** Output can move before a transaction lands; we never simulate or send.
- **One region** (this collector’s public IP / Cloudflare pop).
- **Small sample** (a handful of rounds, nine cells each). Not a market study.
- swap.io’s presented quote includes a **platform fee** (1 bps SOL-USDC, 2 bps JUP-USDC and BONK-USDC in this CSV) that Jupiter lite does not; that is a real quoted difference, not an error.
- Jupiter lite is rate-limited and occasionally returns HTTP 503; the collector then tries `api.jup.ag/swap/v1/quote` without a key. Failed quote cells stay error rows. Raydium compute quotes are pool-router quotes, not a multi-aggregator.
- No attempt to match intermediate tokens, CU, or MEV protection across venues.
