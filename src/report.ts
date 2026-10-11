import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadQuotesCsv } from "./csv.js";
import { perHundredTradesDiff } from "./math.js";
import { PAIRS, SIZE_USD, VENUES } from "./tokens.js";
import type { PairId, QuoteRecord, VenueId } from "./types.js";

const ROOT = process.cwd();
const CSV_PATH = join(ROOT, "data", "quotes.csv");
const OUT_PATH = join(ROOT, "RESULTS.md");

function num(s: string): number | null {
  if (s === "" || s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtUi(n: number | null, digits = 6): string {
  if (n == null) return "n/a";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function fmtBps(n: number | null): string {
  if (n == null) return "n/a";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

function rounds(rows: QuoteRecord[]): string[] {
  return [...new Set(rows.map((r) => r.round_id))].sort();
}

function cell(rows: QuoteRecord[], round: string, pair: PairId, size: number, venue: VenueId): QuoteRecord | undefined {
  return rows.find(
    (r) =>
      r.round_id === round &&
      r.pair === pair &&
      Number(r.size_usd_target) === size &&
      r.venue === venue,
  );
}

export type ExcludedCell = {
  round_id: string;
  pair: string;
  size_usd_target: number;
  reason: string;
};

export type WinnerSummary = {
  counts: Record<string, number>;
  completeCells: number;
  excluded: ExcludedCell[];
};

function cellKey(r: Pick<QuoteRecord, "round_id" | "pair" | "size_usd_target">): string {
  return `${r.round_id}|${r.pair}|${r.size_usd_target}`;
}

/** Head-to-head wins only when every configured venue returned ok for that cell. */
export function winnerSummary(rows: QuoteRecord[]): WinnerSummary {
  const counts: Record<string, number> = { "swap.io": 0, jupiter: 0, raydium: 0, tie: 0 };
  const excluded: ExcludedCell[] = [];
  const keys = [...new Set(rows.map(cellKey))];
  let completeCells = 0;
  for (const key of keys) {
    const [round, pair, size] = key.split("|");
    const group = rows.filter((r) => cellKey(r) === key);
    const missing = VENUES.filter((v) => !group.some((r) => r.venue === v));
    const errors = group.filter((r) => r.status !== "ok");
    if (missing.length || errors.length) {
      const parts: string[] = [];
      for (const v of missing) parts.push(`${v} missing`);
      for (const r of errors) parts.push(`${r.venue}: ${r.error || "error"}`);
      excluded.push({
        round_id: round,
        pair,
        size_usd_target: Number(size),
        reason: parts.join("; "),
      });
      continue;
    }
    completeCells += 1;
    let best = -Infinity;
    for (const r of group) {
      const v = num(r.output_amount_ui) ?? -Infinity;
      if (v > best) best = v;
    }
    const winners = group.filter((r) => (num(r.output_amount_ui) ?? -Infinity) === best);
    if (winners.length !== 1) counts.tie += 1;
    else counts[winners[0].venue] += 1;
  }
  excluded.sort((a, b) => a.round_id.localeCompare(b.round_id) || a.pair.localeCompare(b.pair) || a.size_usd_target - b.size_usd_target);
  return { counts, completeCells, excluded };
}

/** Two-venue comparison over cells where both venues returned ok. */
export function headToHead(rows: QuoteRecord[], a: VenueId, b: VenueId): { cells: number; a: number; b: number; tie: number } {
  const out = { cells: 0, a: 0, b: 0, tie: 0 };
  for (const key of new Set(rows.map(cellKey))) {
    const group = rows.filter((r) => cellKey(r) === key);
    const ra = group.find((r) => r.venue === a);
    const rb = group.find((r) => r.venue === b);
    if (!ra || !rb || ra.status !== "ok" || rb.status !== "ok") continue;
    const va = num(ra.output_amount_ui);
    const vb = num(rb.output_amount_ui);
    if (va == null || vb == null) continue;
    out.cells += 1;
    if (va > vb) out.a += 1;
    else if (vb > va) out.b += 1;
    else out.tie += 1;
  }
  return out;
}

function parseFeeBps(platformFee: string): number | null {
  if (!platformFee) return null;
  try {
    const o = JSON.parse(platformFee) as { feeBps?: number };
    return typeof o.feeBps === "number" ? o.feeBps : null;
  } catch {
    return null;
  }
}

function swapIoFeeBpsByPair(rows: QuoteRecord[]): string[] {
  const byPair = new Map<string, Set<number>>();
  for (const r of rows) {
    if (r.venue !== "swap.io" || r.status !== "ok") continue;
    const bps = parseFeeBps(r.platform_fee);
    if (bps == null) continue;
    const set = byPair.get(r.pair) ?? new Set<number>();
    set.add(bps);
    byPair.set(r.pair, set);
  }
  return [...byPair.entries()].map(([pair, set]) => {
    const vals = [...set].sort((a, b) => a - b);
    return `${pair}: ${vals.map((v) => `${v} bps`).join(", ")}`;
  });
}

/** Where swap.io's platform fee is taken, per pair, from the `feeMint` it returned. */
function swapIoFeeSideByPair(rows: QuoteRecord[]): string[] {
  const byPair = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.venue !== "swap.io" || r.status !== "ok" || !r.platform_fee) continue;
    let mint: string | undefined;
    try {
      mint = (JSON.parse(r.platform_fee) as { feeMint?: string } | null)?.feeMint;
    } catch {
      mint = undefined;
    }
    if (!mint) continue;
    const pair = PAIRS.find((p) => p.id === r.pair);
    const side = !pair
      ? `feeMint ${mint}`
      : mint === pair.input.mint
        ? `out of the input (${pair.input.symbol}), before routing`
        : mint === pair.output.mint
          ? `out of the ${pair.output.symbol} output`
          : `feeMint ${mint} (neither input nor output mint; check raw JSON)`;
    const set = byPair.get(r.pair) ?? new Set<string>();
    set.add(side);
    byPair.set(r.pair, set);
  }
  return [...byPair.entries()].map(([pair, set]) => `${pair} ${[...set].join(" / ")}`);
}

function whyPricesDiffer(rows: QuoteRecord[]): string[] {
  const lines: string[] = [];
  const ok = rows.filter((r) => r.status === "ok");
  const swapFees = ok.filter((r) => r.venue === "swap.io" && r.platform_fee);
  if (swapFees.length) {
    const perPair = swapIoFeeBpsByPair(rows);
    lines.push(
      `- swap.io returned a \`platformFee\` on ${swapFees.length}/${ok.filter((r) => r.venue === "swap.io").length} successful quotes. \`feeBps\` in this CSV is **not a flat 1 bps**; by pair: ${perPair.join("; ")}. Where the fee is taken follows its \`feeMint\`: ${swapIoFeeSideByPair(rows).join("; ") || "no feeMint returned"}. Either way it is a documented reason its net output can trail a venue that returns \`platformFee: null\`.`,
    );
  }
  const jupNoFee = ok.filter((r) => r.venue === "jupiter" && (r.platform_fee === "" || r.platform_fee === "null"));
  if (jupNoFee.length) {
    lines.push(
      `- Jupiter lite quotes in this run returned empty/\`null\` \`platformFee\` on ${jupNoFee.length} successful rows; any AMM fee is already inside \`outAmount\`, not listed separately.`,
    );
  }
  const rayFees = ok.filter((r) => r.venue === "raydium" && r.quoted_fees);
  if (rayFees.length) {
    lines.push(
      `- Raydium \`routePlan\` entries include \`feeRate\` / \`feeAmount\` (example: \`${rayFees[0].quoted_fees.slice(0, 180)}\`). Those are pool fees on the Raydium path, not a swap.io-style platform fee.`,
    );
  }
  const impacts = ok
    .map((r) => ({ r, i: num(r.price_impact) }))
    .filter((x) => x.i != null && x.i !== 0);
  if (impacts.length) {
    const max = impacts.reduce((a, b) => (Math.abs(b.i!) > Math.abs(a.i!) ? b : a));
    lines.push(
      `- Non-zero \`priceImpact\` appeared on ${impacts.length} quotes; the largest magnitude in this CSV is ${max.i} (${max.r.venue} ${max.r.pair} $${max.r.size_usd_target}, round ${max.r.round_id}). Larger impact on the $10,000 size is consistent with thinner books, when the field is present.`,
    );
  }
  const hoppy = ok.filter((r) => Number(r.hops) > 1);
  if (hoppy.length) {
    lines.push(
      `- Multi-hop routes (\`hops\` > 1) appeared ${hoppy.length} times. Different hop/split graphs (see \`route\`) mean the venues are not pricing the same physical path even when the pair and size match.`,
    );
  }
  if (!lines.length) {
    lines.push("- No route/fee/impact fields were populated enough to explain differences beyond raw output amounts.");
  }
  return lines;
}

export function buildResultsMarkdown(rows: QuoteRecord[]): string {
  const roundIds = rounds(rows);
  const { counts, completeCells, excluded } = winnerSummary(rows);
  const okByRound = roundIds.map((id) => {
    const n = rows.filter((r) => r.round_id === id && r.status === "ok").length;
    const e = rows.filter((r) => r.round_id === id && r.status === "error").length;
    return `- \`${id}\`: ${n} successful quotes, ${e} errors`;
  });

  const parts: string[] = [];
  parts.push("# Results");
  parts.push("");
  parts.push("Quotes only. No swaps were signed or submitted. Losses for swap.io are listed the same way as wins.");
  parts.push("");
  parts.push("## Rounds");
  parts.push("");
  parts.push(okByRound.join("\n") || "_No rows yet. Run `npm run collect`._");
  if (rows.length) {
    const okTotal = rows.filter((r) => r.status === "ok").length;
    const errTotal = rows.filter((r) => r.status !== "ok").length;
    parts.push(`- **Total: ${okTotal} successful quotes, ${errTotal} error${errTotal === 1 ? "" : "s"} (${rows.length} CSV rows).**`);
  }
  parts.push("");
  parts.push("## Winner count");
  parts.push("");
  parts.push(
    `A win is one (round, pair, size) cell where **all three venues returned ok** and that venue had the strictly highest USDC output. Cells with any error are excluded from the head-to-head (they remain in the pair tables). ${completeCells} complete cells; ${excluded.length} excluded.`,
  );
  parts.push("");
  parts.push("| Venue | Strict wins |");
  parts.push("| --- | ---: |");
  for (const v of [...VENUES, "tie"] as const) {
    parts.push(`| ${v} | ${counts[v] ?? 0} |`);
  }
  parts.push("");
  const h2h = headToHead(rows, "swap.io", "jupiter");
  parts.push(
    `**swap.io vs Jupiter head-to-head** (cells where both returned ok, regardless of Raydium): ${h2h.cells} cells. Jupiter higher output: ${h2h.b}. swap.io higher output: ${h2h.a}. Equal: ${h2h.tie}.`,
  );
  parts.push("");
  if (excluded.length) {
    parts.push("Excluded from winner count (not a complete head-to-head):");
    parts.push("");
    for (const e of excluded) {
      parts.push(`- ${e.pair} $${e.size_usd_target}, round \`${e.round_id}\`: ${e.reason}`);
    }
    parts.push("");
  }

  for (const pair of PAIRS) {
    parts.push(`## ${pair.id}`);
    parts.push("");
    for (const round of roundIds) {
      parts.push(`### Round \`${round}\``);
      parts.push("");
      const cols = VENUES.flatMap((v) => [`${v} out (USDC)`, `${v} vs best (bps)`]);
      parts.push(`| Size (USD target) | ${cols.join(" | ")} |`);
      parts.push(`| --- | ${cols.map(() => "---:").join(" | ")} |`);
      for (const size of SIZE_USD) {
        const cells: string[] = [`$${size}`];
        for (const v of VENUES) {
          const rec = cell(rows, round, pair.id, size, v);
          if (!rec || rec.status !== "ok") {
            cells.push(rec?.error ? `error: ${rec.error}` : "n/a");
            cells.push("n/a");
          } else {
            cells.push(fmtUi(num(rec.output_amount_ui)));
            cells.push(fmtBps(num(rec.vs_best_bps)));
          }
        }
        parts.push(`| ${cells.join(" | ")} |`);
      }
      parts.push("");
    }
  }

  parts.push("## Per-100-trades difference");
  parts.push("");
  parts.push(
    "This is **arithmetic from these quotes, not a forecast**. For each (round, pair, size), `100 * (venue_output_USDC − best_output_USDC)` is the extra (or missing) USDC you would have if that quote repeated 100 times at the same size. Negative numbers are worse than the best venue in that cell. Values are then averaged across rounds.",
  );
  parts.push("");
  parts.push("| Pair | Size | Venue | Mean USDC vs best, ×100 | Per-round values |");
  parts.push("| --- | ---: | --- | ---: | --- |");
  for (const pair of PAIRS) {
    for (const size of SIZE_USD) {
      for (const v of VENUES) {
        const perRound: string[] = [];
        const nums: number[] = [];
        for (const round of roundIds) {
          const rec = cell(rows, round, pair.id, size, v);
          const group = rows.filter(
            (r) =>
              r.round_id === round &&
              r.pair === pair.id &&
              Number(r.size_usd_target) === size &&
              r.status === "ok",
          );
          const best = group.reduce((m, r) => Math.max(m, num(r.output_amount_ui) ?? -Infinity), -Infinity);
          if (!rec || rec.status !== "ok" || !Number.isFinite(best) || best === -Infinity) {
            perRound.push(`${round}: n/a`);
            continue;
          }
          const d = perHundredTradesDiff(num(rec.output_amount_ui)!, best);
          nums.push(d);
          perRound.push(`${round}: ${d.toFixed(4)}`);
        }
        const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
        parts.push(
          `| ${pair.id} | $${size} | ${v} | ${mean == null ? "n/a" : mean.toFixed(4)} | ${perRound.join("; ")} |`,
        );
      }
    }
  }
  parts.push("");
  parts.push("## Why prices differ");
  parts.push("");
  parts.push("Grounded only in route / fee / impact fields actually returned in `data/quotes.csv` and the raw JSON:");
  parts.push("");
  parts.push(whyPricesDiffer(rows).join("\n"));
  parts.push("");
  parts.push("See METHOD.md for endpoints, mints, timing, and the quotes-are-not-fills limitation.");
  parts.push("");
  return parts.join("\n");
}

function main(): void {
  const rows = loadQuotesCsv(CSV_PATH);
  const md = buildResultsMarkdown(rows);
  writeFileSync(OUT_PATH, md);
  console.log(`wrote ${OUT_PATH} from ${rows.length} CSV rows`);
}

const isDirect = process.argv[1]?.endsWith("report.ts") || process.argv[1]?.endsWith("report.js");
if (isDirect) main();
