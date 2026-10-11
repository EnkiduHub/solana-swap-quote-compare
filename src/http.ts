export interface FetchJsonResult {
  status: number;
  latencyMs: number;
  bodyText: string;
  json: unknown;
}

export async function fetchJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<FetchJsonResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "solana-quote-compare/1.0 (research; quotes only; no swaps)",
        ...(init.headers ?? {}),
      },
    });
    const bodyText = await res.text();
    const latencyMs = Math.round(performance.now() - started);
    let json: unknown = null;
    try {
      json = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      json = { parseError: true, bodyText };
    }
    return { status: res.status, latencyMs, bodyText, json };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 0,
      latencyMs,
      bodyText: message,
      json: { error: message },
    };
  } finally {
    clearTimeout(timer);
  }
}
