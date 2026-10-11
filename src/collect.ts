import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendQuotesCsv } from "./csv.js";
import { atomicFromUi, bpsVsBest, effectivePrice, notionalToAtomic, uiAmount } from "./math.js";
import { PAIRS, SIZE_USD, SLIPPAGE_BPS, SOL } from "./tokens.js";
import type { Pair, QuoteRecord, QuoteRequest, VenueId } from "./types.js";
import { fetchJupiter } from "./venues/jupiter.js";
import { fetchRaydium } from "./venues/raydium.js";
import { fetchSwapIo, swapIoQuoteUrl } from "./venues/swapio.js";

const ROOT = process.cwd();
const CSV_PATH = join(ROOT, "data", "quotes.csv");

async function usdPerTokenViaJupiter(
  pair: Pair,
): Promise<{ usd: number; probeAtomic: string; probeOut: string; probeUrl: string }> {
  // Probe sizes large enough to avoid dust rounding, small enough to stay liquid.
  const probeUi =
    pair.input.symbol === "SOL" ? 0.1 : pair.input.symbol === "JUP" ? 50 : 1_000_000;
  const amountAtomic = atomicFromUi(probeUi, pair.input.decimals);
  const req: QuoteRequest = {
    inputMint: pair.input.mint,
    outputMint: pair.output.mint,
    amountAtomic: amountAtomic.toString(),
    slippageBps: SLIPPAGE_BPS,
  };
  let lastErr = "unknown";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { parsed, res, url } = await fetchJupiter(req);
    if (parsed.ok) {
      const inUi = uiAmount(amountAtomic, pair.input.decimals);
      const outUi = uiAmount(parsed.outputAtomic, pair.output.decimals);
      const usd = outUi / inUi;
      if (!(usd > 0)) throw new Error(`non-positive probe price for ${pair.id}`);
      return {
        usd,
        probeAtomic: amountAtomic.toString(),
        probeOut: parsed.outputAtomic.toString(),
        probeUrl: url,
      };
    }
    lastErr = `${parsed.error} (http ${res.status}, attempt ${attempt})`;
    await new Promise((r) => setTimeout(r, 750 * attempt));
  }
  throw new Error(`price probe failed for ${pair.id}: ${lastErr}`);
}

function nextRoundId(existingRoundCount: number, startedAt: Date): string {
  const iso = startedAt.toISOString().replace(/[:.]/g, "-");
  return `${existingRoundCount + 1}-${iso}`;
}

function sizeLabel(usd: number): string {
  return String(usd);
}

type VenueFetch = (req: QuoteRequest) => Promise<{
  url: string;
  res: { status: number; latencyMs: number; json: unknown };
  parsed: import("./types.js").ParseResult;
}>;

const FETCHERS: Record<VenueId, VenueFetch> = {
  "swap.io": fetchSwapIo,
  jupiter: fetchJupiter,
  raydium: fetchRaydium,
};

async function main(): Promise<void> {
  const startedAt = new Date();
  const { loadQuotesCsv } = await import("./csv.js");
  const existing = loadQuotesCsv(CSV_PATH);
  const priorRounds = new Set(existing.map((r) => r.round_id)).size;
  const roundId = nextRoundId(priorRounds, startedAt);

  console.log(`round ${roundId}`);
  console.log(`slippage_bps=${SLIPPAGE_BPS}`);
  if (!swapIoQuoteUrl()) {
    console.warn(
      "SWAPIO_QUOTE_URL unset; swap.io venue skipped. Set it to the quote request swap.io's web app makes.",
    );
  }

  const prices: Record<string, number> = {};
  const priceMeta: Record<string, unknown> = {};
  // SOL USD via Jupiter SOL->USDC probe (also used as a sanity check).
  const solPrice = await usdPerTokenViaJupiter({
    id: "SOL-USDC",
    input: SOL,
    output: PAIRS[0].output,
  });
  prices.SOL = solPrice.usd;
  priceMeta.SOL = solPrice;
  for (const pair of PAIRS) {
    if (pair.input.symbol === "SOL") continue;
    const p = await usdPerTokenViaJupiter(pair);
    prices[pair.input.symbol] = p.usd;
    priceMeta[pair.input.symbol] = p;
  }
  console.log("usd_per_input_at_round_start", JSON.stringify(prices));

  const rawRoundDir = join(ROOT, "data", "raw", roundId);
  mkdirSync(rawRoundDir, { recursive: true });
  writeFileSync(
    join(rawRoundDir, "_round-meta.json"),
    JSON.stringify(
      {
        roundId,
        startedAt: startedAt.toISOString(),
        slippageBps: SLIPPAGE_BPS,
        prices,
        priceMeta,
        note: "USD/token from Jupiter lite quote probes at round start; not Pyth.",
      },
      null,
      2,
    ),
  );

  const rows: QuoteRecord[] = [];

  for (const pair of PAIRS) {
    const usd = prices[pair.input.symbol];
    for (const sizeUsd of SIZE_USD) {
      const amountAtomic = notionalToAtomic(sizeUsd, usd, pair.input.decimals);
      const inputUi = uiAmount(amountAtomic, pair.input.decimals);
      const req: QuoteRequest = {
        inputMint: pair.input.mint,
        outputMint: pair.output.mint,
        amountAtomic: amountAtomic.toString(),
        slippageBps: SLIPPAGE_BPS,
      };

      const cellStarted = Date.now();
      const venueIds = Object.keys(FETCHERS) as VenueId[];
      const results = await Promise.all(
        venueIds.map(async (venue) => {
          const out = await FETCHERS[venue](req);
          return { venue, ...out };
        }),
      );
      const cellMs = Date.now() - cellStarted;
      if (cellMs > 5000) {
        console.warn(
          `WARN ${pair.id} $${sizeUsd}: venue fan-out took ${cellMs}ms (>5s window)`,
        );
      }

      const timestamp = new Date().toISOString();
      const parsedOk = results.filter((r) => r.parsed.ok);
      let best = 0n;
      for (const r of parsedOk) {
        if (r.parsed.ok && r.parsed.outputAtomic > best) best = r.parsed.outputAtomic;
      }

      for (const r of results) {
        const rawName = `${r.venue}-${pair.id}-${sizeLabel(sizeUsd)}.json`.replaceAll(" ", "");
        const rawPath = join("data", "raw", roundId, rawName);
        writeFileSync(
          join(ROOT, rawPath),
          JSON.stringify(
            {
              venue: r.venue,
              url: r.url,
              httpStatus: r.res.status,
              latencyMs: r.res.latencyMs,
              request: req,
              body: r.res.json,
            },
            null,
            2,
          ),
        );

        if (!r.parsed.ok) {
          rows.push({
            timestamp,
            round_id: roundId,
            venue: r.venue,
            pair: pair.id,
            size_usd_target: sizeUsd,
            slippage_bps: SLIPPAGE_BPS,
            input_amount_atomic: amountAtomic.toString(),
            input_amount_ui: String(inputUi),
            output_amount_atomic: "",
            output_amount_ui: "",
            effective_price: "",
            vs_best_bps: "",
            route: "",
            hops: "",
            splits: "",
            quoted_fees: "",
            platform_fee: "",
            price_impact: "",
            latency_ms: String(r.res.latencyMs),
            status: "error",
            error: r.parsed.error,
            raw_path: rawPath,
            usd_per_input: String(usd),
          });
          console.log(
            `ERR  ${pair.id} $${sizeUsd} ${r.venue}: ${r.parsed.error} (${r.res.latencyMs}ms)`,
          );
          continue;
        }

        const vs = best > 0n ? bpsVsBest(r.parsed.outputAtomic, best) : null;
        const outUi = uiAmount(r.parsed.outputAtomic, pair.output.decimals);
        const px = effectivePrice(r.parsed.outputAtomic, pair.output.decimals, inputUi);
        rows.push({
          timestamp,
          round_id: roundId,
          venue: r.venue,
          pair: pair.id,
          size_usd_target: sizeUsd,
          slippage_bps: SLIPPAGE_BPS,
          input_amount_atomic: amountAtomic.toString(),
          input_amount_ui: String(inputUi),
          output_amount_atomic: r.parsed.outputAtomic.toString(),
          output_amount_ui: String(outUi),
          effective_price: px == null ? "" : String(px),
          vs_best_bps: vs == null ? "" : vs.toFixed(4),
          route: r.parsed.routeSummary,
          hops: r.parsed.hops == null ? "" : String(r.parsed.hops),
          splits: r.parsed.splits == null ? "" : String(r.parsed.splits),
          quoted_fees: r.parsed.quotedFees,
          platform_fee: r.parsed.platformFee,
          price_impact: r.parsed.priceImpact,
          latency_ms: String(r.res.latencyMs),
          status: "ok",
          error: "",
          raw_path: rawPath,
          usd_per_input: String(usd),
        });
        console.log(
          `OK   ${pair.id} $${sizeUsd} ${r.venue}: out=${outUi} vsBest=${vs?.toFixed(2)}bps (${r.res.latencyMs}ms)`,
        );
      }
    }
  }

  appendQuotesCsv(CSV_PATH, rows);
  const ok = rows.filter((r) => r.status === "ok").length;
  const err = rows.filter((r) => r.status === "error").length;
  console.log(`wrote ${rows.length} rows (${ok} ok, ${err} error) to ${CSV_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
