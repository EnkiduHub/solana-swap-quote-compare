import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { CSV_HEADERS, type QuoteRecord } from "./types.js";

export function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function recordToLine(row: QuoteRecord): string {
  return CSV_HEADERS.map((h) => csvEscape(row[h])).join(",");
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else if (c === '"') {
      inQuotes = true;
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

export function loadQuotesCsv(path: string): QuoteRecord[] {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length <= 1) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {} as QuoteRecord;
    for (let i = 0; i < header.length; i++) {
      const key = header[i] as keyof QuoteRecord;
      (row as unknown as Record<string, string | number>)[key] =
        key === "size_usd_target" || key === "slippage_bps" ? Number(cols[i]) : cols[i] ?? "";
    }
    return row;
  });
}

export function appendQuotesCsv(path: string, rows: QuoteRecord[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const existing = existsSync(path);
  const lines = rows.map(recordToLine);
  if (!existing) {
    writeFileSync(path, [CSV_HEADERS.join(","), ...lines].join("\n") + "\n");
  } else {
    writeFileSync(path, readFileSync(path, "utf8") + lines.join("\n") + "\n");
  }
}
