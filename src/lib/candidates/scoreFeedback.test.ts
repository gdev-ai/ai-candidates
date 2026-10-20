import { describe, expect, it } from "vitest";

import {
  COMMENT_MAX_LENGTH,
  scoreFeedbackRequestSchema,
  toScoreFeedback,
} from "@/lib/candidates/scoreFeedback";

const matchId = "6f1c2a52-7d0b-4c43-9a55-2f1f0d3b9e11";

describe("scoreFeedbackRequestSchema", () => {
  it("keeps a thumbs down with direction and trimmed comment", () => {
    const parsed = scoreFeedbackRequestSchema.parse({
      matchId,
      rating: "down",
      direction: "too_high",
      comment: "  No Kubernetes at all  ",
    });
    expect(parsed).toEqual({
      matchId,
      feedback: {
        rating: "down",
        direction: "too_high",
        comment: "No Kubernetes at all",
      },
    });
  });

  it("drops the direction on a thumbs up and blank comments", () => {
    const parsed = scoreFeedbackRequestSchema.parse({
      matchId,
      rating: "up",
      direction: "too_low",
      comment: "   ",
    });
    expect(parsed.feedback).toEqual({
      rating: "up",
      direction: null,
      comment: null,
    });
  });

  it("rejects bad input", () => {
    expect(
      scoreFeedbackRequestSchema.safeParse({ matchId: "x", rating: "up" })
        .success,
    ).toBe(false);
    expect(
      scoreFeedbackRequestSchema.safeParse({ matchId, rating: "meh" }).success,
    ).toBe(false);
    expect(
      scoreFeedbackRequestSchema.safeParse({
        matchId,
        rating: "down",
        comment: "a".repeat(COMMENT_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});

describe("toScoreFeedback", () => {
  it("reads the first embedded row", () => {
    expect(
      toScoreFeedback([
        { rating: "down", direction: "too_low", comment: "Strong lead" },
      ]),
    ).toEqual({ rating: "down", direction: "too_low", comment: "Strong lead" });
  });

  it("returns null when there is no rating", () => {
    expect(toScoreFeedback([])).toBeNull();
    expect(toScoreFeedback(null)).toBeNull();
    expect(toScoreFeedback(undefined)).toBeNull();
  });

  it("ignores unknown values", () => {
    expect(toScoreFeedback([{ rating: "sideways" }])).toBeNull();
    expect(
      toScoreFeedback({ rating: "up", direction: "weird", comment: "" }),
    ).toEqual({ rating: "up", direction: null, comment: null });
  });
});
