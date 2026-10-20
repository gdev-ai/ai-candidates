import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  AIIncompleteResponseError,
  AIProviderError,
  AIRefusalError,
  AIResponseValidationError,
} from "@/lib/ai/AIProvider";
import { setAnthropicClientForTesting } from "@/lib/ai/client";
import { runStructured } from "@/lib/ai/structured";
import { recordProviderCall } from "@/lib/providers/callLog";

vi.mock("@/lib/env", () => ({
  env: { ANTHROPIC_API_KEY: "test", ANTHROPIC_MODEL: undefined },
}));
vi.mock("@/lib/providers/callLog", () => ({
  recordProviderCall: vi.fn(async () => "call-1"),
}));

const schema = z.object({
  in_country: z.boolean().nullable(),
  evidence: z.string(),
});

function response(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    stop_reason: "end_turn",
    stop_details: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 100,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    content: [
      {
        type: "text",
        text: JSON.stringify({ in_country: true, evidence: "Cairo, Egypt" }),
      },
    ],
    ...overrides,
  };
}

function fakeClient(
  create: (body: Record<string, unknown>, opts?: unknown) => unknown,
) {
  const fn = vi.fn((body: Record<string, unknown>, opts?: unknown) => ({
    withResponse: async () => {
      const data = await create(body, opts);
      return { data, request_id: "req_1" };
    },
  }));
  setAnthropicClientForTesting({
    messages: { create: fn },
  } as unknown as Anthropic);
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
afterEach(() => setAnthropicClientForTesting(null));

describe("runStructured", () => {
  it("sends a structured-output request and logs tokens + cost", async () => {
    const create = fakeClient(() => response());
    const result = await runStructured({
      ...base,
      effort: "low",
      context: { userId: "u1" },
    });

    expect(result).toMatchObject({
      data: { in_country: true },
      callId: "call-1",
      model: "claude-haiku-5-5",
    });
    const body = create.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 300,
      system: "x",
      messages: [{ role: "user", content: "y" }],
      output_config: { effort: "low", format: { type: "json_schema" } },
    });
    expect(body).not.toHaveProperty("thinking");
    const logged = vi.mocked(recordProviderCall).mock.calls[0]?.[0];
    expect(logged).toMatchObject({
      status: "ok",
      provider: "anthropic",
      purpose: "location_check",
      userId: "u1",
      providerRequestId: "req_1",
      finishReason: "end_turn",
      promptTokens: 1000,
      completionTokens: 100,
      promptVersion: "v1",
    });
    expect(logged?.costUsd).toBeCloseTo((1000 * 0.1 + 100 * 0.5) / 1_000_000);
  });

  it("turns thinking off for effort none on Haiku", async () => {
    const create = fakeClient(() => response());
    await runStructured({ ...base, effort: "none" });
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
    });
  });

  it("keeps thinking on for effort none on models that can't disable it", async () => {
    const create = fakeClient(() => response({ model: "claude-opus-5-5" }));
    await runStructured({ ...base, effort: "none", model: "claude-opus-5-5" });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("thinking");
  });

  it("prices cache reads and writes", async () => {
    fakeClient(() =>
      response({
        usage: {
          input_tokens: 1000,
          output_tokens: 0,
          cache_read_input_tokens: 10_000,
          cache_creation_input_tokens: 2000,
        },
      }),
    );
    await runStructured({ ...base, effort: "low" });
    const logged = vi.mocked(recordProviderCall).mock.calls[0]?.[0];
    expect(logged).toMatchObject({
      promptTokens: 13_000,
      cachedTokens: 10_000,
    });
    expect(logged?.costUsd).toBeCloseTo(
      (1000 * 0.1 + 10_000 * 0.01 + 2000 * 0.125) / 1_000_000,
    );
  });

  it("records a truncated response and throws without retrying", async () => {
    const create = fakeClient(() =>
      response({
        stop_reason: "max_tokens",
        content: [{ type: "text", text: '{"in_country": tr' }],
      }),
    );
    await expect(
      runStructured({ ...base, effort: "low" }),
    ).rejects.toBeInstanceOf(AIIncompleteResponseError);
    expect(create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordProviderCall).mock.calls[0]?.[0]).toMatchObject({
      status: "truncated",
      finishReason: "max_tokens",
    });
  });

  it("records a refusal", async () => {
    fakeClient(() =>
      response({
        stop_reason: "refusal",
        stop_details: {
          type: "refusal",
          category: null,
          explanation: "declined",
        },
        content: [],
      }),
    );
    await expect(
      runStructured({ ...base, effort: "low" }),
    ).rejects.toBeInstanceOf(AIRefusalError);
    expect(vi.mocked(recordProviderCall).mock.calls[0]?.[0]).toMatchObject({
      status: "refused",
      error: "declined",
    });
  });

  it("rejects output that doesn't match the schema", async () => {
    fakeClient(() =>
      response({ content: [{ type: "text", text: '{"in_country": "yes"}' }] }),
    );
    await expect(
      runStructured({ ...base, effort: "low" }),
    ).rejects.toBeInstanceOf(AIResponseValidationError);
    expect(vi.mocked(recordProviderCall).mock.calls[0]?.[0]).toMatchObject({
      status: "error",
    });
  });

  it("logs HTTP errors as AIProviderError", async () => {
    fakeClient(() => {
      throw new Anthropic.APIError(500, undefined, "boom", new Headers());
    });
    await expect(
      runStructured({ ...base, effort: "low" }),
    ).rejects.toBeInstanceOf(AIProviderError);
    expect(vi.mocked(recordProviderCall).mock.calls[0]?.[0]).toMatchObject({
      status: "error",
      provider: "anthropic",
      httpStatus: 500,
    });
  });

  it("passes a per-call timeout with one retry", async () => {
    const create = fakeClient(() => response());
    await runStructured({ ...base, effort: "low", timeoutMs: 40_000 });
    expect(create.mock.calls[0]?.[1]).toEqual({
      timeout: 40_000,
      maxRetries: 1,
    });
  });
});
