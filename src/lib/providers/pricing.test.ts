import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchJson, ProviderHttpError } from "@/lib/providers/http";
import { anthropicCostUsd, apifyMaxChargeUsd } from "@/lib/providers/pricing";

describe("anthropicCostUsd", () => {
  it("prices Haiku with cache reads, cache writes and output (incl. thinking)", () => {
    // 10K each at $0.10 in, $0.01 cache read, $0.125 cache write, $0.50 out per 1M
    expect(
      anthropicCostUsd("claude-haiku-5-5", {
        inputTokens: 10_000,
        cacheReadTokens: 10_000,
        cacheWriteTokens: 10_000,
        outputTokens: 10_000,
      }),
    ).toBeCloseTo(0.00735, 6);
  });
  it("switches Haiku to the long-context rate above 100K prompt tokens", () => {
    // 100,001 in at $0.50 + 1M out at $2.50
    expect(
      anthropicCostUsd("claude-haiku-5-5", {
        inputTokens: 100_001,
        outputTokens: 1_000_000,
      }),
    ).toBeCloseTo(2.55);
  });
  it("matches dated snapshots and returns null for unknown models", () => {
    expect(
      anthropicCostUsd("claude-sonnet-5-5-20261001", {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBeCloseTo(12);
    expect(
      anthropicCostUsd("mystery", { inputTokens: 1, outputTokens: 1 }),
    ).toBeNull();
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
      .mockResolvedValueOnce(
        new Response("busy", { status: 429, headers: { "retry-after": "2" } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchFn);
    const result = await fetchJson<{ ok: boolean }>("p", "https://x", {
      timeoutMs: 1000,
      sleep,
    });
    expect(result.body.ok).toBe(true);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("does not retry a 400", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 400 }));
    vi.stubGlobal("fetch", fetchFn);
    await expect(
      fetchJson("p", "https://x", { timeoutMs: 1000, sleep: noSleep }),
    ).rejects.toBeInstanceOf(ProviderHttpError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("never retries a timeout", async () => {
    const timeout = Object.assign(new Error("timeout"), {
      name: "TimeoutError",
    });
    const fetchFn = vi.fn().mockRejectedValue(timeout);
    vi.stubGlobal("fetch", fetchFn);
    await expect(
      fetchJson("p", "https://x", { timeoutMs: 1000, sleep: noSleep }),
    ).rejects.toThrow(/timed out/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
