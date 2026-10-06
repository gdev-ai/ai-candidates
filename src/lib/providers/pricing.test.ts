import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchJson, ProviderHttpError } from "@/lib/providers/http";
import { apifyMaxChargeUsd, openAICostUsd } from "@/lib/providers/pricing";

describe("openAICostUsd", () => {
  it("prices luna with cached input and output (incl. reasoning)", () => {
    // 1M uncached in ($0.20) + 1M cached ($0.02) + 1M out ($1.20)
    expect(openAICostUsd("gpt-5.6-luna", { inputTokens: 2_000_000, cachedTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(1.42);
  });
  it("halves flex and matches dated snapshots", () => {
    expect(openAICostUsd("gpt-6-luna-2026-09-01", { inputTokens: 1_000_000, outputTokens: 1_000_000 }, "flex")).toBeCloseTo(0.3);
  });
  it("prices embeddings and returns null for unknown models", () => {
    expect(openAICostUsd("text-embedding-3-small", { inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(0.02);
    expect(openAICostUsd("mystery", { inputTokens: 1, outputTokens: 1 })).toBeNull();
  });
  it("caps an Apify run at n × $0.005 + start + one profile of headroom", () => {
    expect(apifyMaxChargeUsd(20)).toBeCloseTo(0.1051);
  });
});

describe("fetchJson", () => {
  afterEach(() => vi.unstubAllGlobals());
  const noSleep = async () => {};

  it("retries 429/5xx, honouring Retry-After", async () => {
    const sleep = vi.fn(noSleep);
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "retry-after": "2" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchFn);
    const result = await fetchJson<{ ok: boolean }>("p", "https://x", { timeoutMs: 1000, sleep });
    expect(result.body.ok).toBe(true);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("does not retry a 400", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 400 }));
    vi.stubGlobal("fetch", fetchFn);
    await expect(fetchJson("p", "https://x", { timeoutMs: 1000, sleep: noSleep })).rejects.toBeInstanceOf(ProviderHttpError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("never retries a timeout", async () => {
    const timeout = Object.assign(new Error("timeout"), { name: "TimeoutError" });
    const fetchFn = vi.fn().mockRejectedValue(timeout);
    vi.stubGlobal("fetch", fetchFn);
    await expect(fetchJson("p", "https://x", { timeoutMs: 1000, sleep: noSleep })).rejects.toThrow(/timed out/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
