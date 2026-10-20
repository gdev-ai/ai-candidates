import { z } from "zod";

import {
  SCORE_DIRECTIONS,
  SCORE_RATINGS,
  type ScoreFeedback,
} from "@/types/candidate";

export const COMMENT_MAX_LENGTH = 2000;

/** Body of PUT /api/score-feedback. */
export const scoreFeedbackRequestSchema = z
  .object({
    matchId: z.uuid(),
    rating: z.enum(SCORE_RATINGS),
    direction: z.enum(SCORE_DIRECTIONS).nullish(),
    comment: z
      .string()
      .max(COMMENT_MAX_LENGTH, "Comment is too long.")
      .nullish(),
  })
  // A thumbs up has no direction; a blank comment is no comment.
  .transform(({ matchId, rating, direction, comment }) => ({
    matchId,
    feedback: {
      rating,
      direction: rating === "down" ? (direction ?? null) : null,
      comment: comment?.trim() || null,
    } satisfies ScoreFeedback,
  }));

/**
 * The caller's rating from an embedded `score_feedback ( rating, direction,
 * comment )` read. RLS returns only the caller's own row, and there is at
 * most one per score.
 */
export function toScoreFeedback(rows: unknown): ScoreFeedback | null {
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || typeof row !== "object") return null;
  const { rating, direction, comment } = row as Record<string, unknown>;
  if (!SCORE_RATINGS.includes(rating as never)) return null;
  return {
    rating: rating as ScoreFeedback["rating"],
    direction: SCORE_DIRECTIONS.includes(direction as never)
      ? (direction as ScoreFeedback["direction"])
      : null,
    comment: typeof comment === "string" && comment ? comment : null,
  };
}

/** PostgREST embed of the caller's rating, for match_results selects. */
export const MY_FEEDBACK_EMBED =
  "score_feedback ( rating, direction, comment )";
