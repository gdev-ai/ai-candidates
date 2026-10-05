/**
 * Errors raised by the OpenAI layer. `errors.ts` maps AIProviderError and
 * AIResponseValidationError (and so their subclasses) to safe 502s.
 */

export class AIProviderError extends Error {
  constructor(provider: string, cause?: unknown) {
    super(`AI provider "${provider}" failed to generate a response.`);
    this.name = "AIProviderError";
    this.cause = cause;
  }
}

/**
 * The model answered, but not with usable structured output: invalid JSON,
 * a schema mismatch, a truncated (`incomplete`) response or a refusal.
 * Never retried unchanged — the same request would fail the same way.
 */
export class AIResponseValidationError extends Error {
  constructor(context: string, cause?: unknown) {
    super(`AI response for "${context}" was not valid JSON matching the expected schema.`);
    this.name = "AIResponseValidationError";
    this.cause = cause;
  }
}

/** `status === "incomplete"`, e.g. max_output_tokens was hit. */
export class AIIncompleteResponseError extends AIResponseValidationError {
  constructor(
    context: string,
    public readonly reason: string | null,
  ) {
    super(context, new Error(`Response incomplete: ${reason ?? "unknown reason"}`));
    this.name = "AIIncompleteResponseError";
  }
}

/** The model refused to answer. */
export class AIRefusalError extends AIResponseValidationError {
  constructor(
    context: string,
    public readonly refusal: string,
  ) {
    super(context, new Error(`Model refused: ${refusal}`));
    this.name = "AIRefusalError";
  }
}
