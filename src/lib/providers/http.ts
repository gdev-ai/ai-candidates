/**
 * Small fetch wrapper for the non-SDK providers (Serper, SerpApi, Exa,
 * Apify, HarvestAPI). Retries only on 429/5xx — which mean the request was
 * not served — and honours Retry-After. A timeout is never retried: the
 * provider may still finish (and bill) the request (§8.2).
 */

export class ProviderHttpError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number | null,
    message: string,
    public readonly body?: unknown,
  ) {
    super(`${provider}: ${message}`);
    this.name = "ProviderHttpError";
  }
}

export interface HttpResult<T> {
  status: number;
  body: T;
  headers: Headers;
  latencyMs: number;
}

export interface HttpOptions extends Omit<RequestInit, "signal"> {
  timeoutMs: number;
  /** Extra attempts on 429/5xx. Default 2. */
  retries?: number;
  /** Test hook. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 30_000);
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.slice(0, 2000);
  }
}

export async function fetchJson<T>(
  provider: string,
  url: string,
  options: HttpOptions,
): Promise<HttpResult<T>> {
  const { timeoutMs, retries = 2, sleep = defaultSleep, ...init } = options;
  const startedAt = Date.now();
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new ProviderHttpError(
        provider,
        null,
        timedOut ? `timed out after ${timeoutMs} ms` : `network error: ${(error as Error).message}`,
      );
    }
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < retries) {
      await sleep(retryDelayMs(response, attempt));
      continue;
    }
    const body = await readBody(response);
    if (!response.ok) {
      throw new ProviderHttpError(provider, response.status, `HTTP ${response.status}`, body);
    }
    return { status: response.status, body: body as T, headers: response.headers, latencyMs: Date.now() - startedAt };
  }
}
