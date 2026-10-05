import { APIError } from "openai";
import type OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AIIncompleteResponseError, AIProviderError, AIRefusalError } from "@/lib/ai/AIProvider";
import { setOpenAIClientForTesting } from "@/lib/ai/client";
import { runStructured } from "@/lib/ai/structured";
import { recordProviderCall } from "@/lib/providers/callLog";

vi.mock("@/lib/env", () => ({ env: { OPENAI_API_KEY: "test", OPENAI_MODEL: undefined } }));
vi.mock("@/lib/providers/callLog", () => ({ recordProviderCall: vi.fn(async () => "call-1") }));

const schema = z.object({ in_country: z.boolean().nullable(), evidence: z.string() });

function response(overrides: Record<string, unknown> = {}) {
  return {
    id: "resp_1",
    model: "gpt-5.6-luna",
    status: "completed",
    service_tier: "default",
    incomplete_details: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 100,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 40 },
    },
    output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }],
    output_parsed: { in_country: true, evidence: "Cairo, Egypt" },
    ...overrides,
  };
}

function fakeClient(parse: (body: Record<string, unknown>, opts?: unknown) => unknown) {
  const fn = vi.fn((body: Record<string, unknown>, opts?: unknown) => ({
    withResponse: async () => {
      const data = await parse(body, opts);
      return { data, request_id: "req_1" };
    },
  }));
  setOpenAIClientForTesting({ responses: { parse: fn } } as unknown as OpenAI);
  return fn;
}

const base = {
  purpose: "location_check" as const,
  schema,
  schemaName: "location_check",
  instructions: "x",
  input: "y",
  promptVersion: "v1",
  maxOutputTokens: 300,
};

beforeEach(() => vi.mocked(recordProviderCall).mockClear());
afterEach(() => setOpenAIClientForTesting(null));

describe("runStructured", () => {
  it("sends the §8.1 request shape and logs tokens + cost", async () => {
    const parse = fakeClient(() => response());
    const result = await runStructured({ ...base, effort: "none", temperature: 0, context: { userId: "u1" } });

    expect(result).toMatchObject({ data: { in_country: true }, callId: "call-1", model: "gpt-5.6-luna" });
    const body = parse.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "gpt-5.6-luna",
      store: false,
      max_output_tokens: 300,
      reasoning: { effort: "none" },
      temperature: 0,
      text: { verbosity: "low" },
    });
    const logged = vi.mocked(recordProviderCall).mock.calls[0]?.[0];
    expect(logged).toMatchObject({
      status: "ok",
      provider: "openai",
      purpose: "location_check",
      userId: "u1",
      providerRequestId: "req_1",
      promptTokens: 1000,
      completionTokens: 100,
      reasoningTokens: 40,
      promptVersion: "v1",
    });
    expect(logged?.costUsd).toBeCloseTo((1000 * 0.2 + 100 * 1.2) / 1_000_000);
  });

  it("never sends temperature with a reasoning effort", async () => {
    const parse = fakeClient(() => response());
    await runStructured({ ...base, effort: "low", temperature: 0.2 });
    expect(parse.mock.calls[0]?.[0]).not.toHaveProperty("temperature");
  });

  it("records a truncated response and throws without retrying", async () => {
    const parse = fakeClient(() =>
      response({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_parsed: null }),
    );
    await expect(runStructured({ ...base, effort: "low" })).rejects.toBeInstanceOf(AIIncompleteResponseError);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCall).mock.calls[0]?.[0]).toMatchObject({
      status: "truncated",
      finishReason: "max_output_tokens",
    });
  });

  it("records a refusal", async () => {
    fakeClient(() =>
      response({ output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }], output_parsed: null }),
    );
    await expect(runStructured({ ...base, effort: "low" })).rejects.toBeInstanceOf(AIRefusalError);
    expect(vi.mocked(recordProviderCall).mock.calls[0]?.[0]).toMatchObject({ status: "refused" });
  });

  it("logs HTTP errors as AIProviderError", async () => {
    fakeClient(() => {
      throw new APIError(500, undefined, "boom", new Headers());
    });
    await expect(runStructured({ ...base, effort: "low" })).rejects.toBeInstanceOf(AIProviderError);
    expect(vi.mocked(recordProviderCall).mock.calls[0]?.[0]).toMatchObject({ status: "error", httpStatus: 500 });
  });

  it("uses flex for bulk calls and falls back to the default tier on 429", async () => {
    const parse = fakeClient((body) => {
      if (body.service_tier === "flex") throw new APIError(429, undefined, "no capacity", new Headers());
      return response();
    });
    const result = await runStructured({ ...base, effort: "low", serviceTier: "flex" });
    expect(result.data.in_country).toBe(true);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[0]?.[1]).toMatchObject({ maxRetries: 0 });
    expect(parse.mock.calls[1]?.[0]).not.toHaveProperty("service_tier");
  });
});
