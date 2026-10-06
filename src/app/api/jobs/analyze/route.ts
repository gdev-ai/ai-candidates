import { NextResponse } from "next/server";
import { z } from "zod";

import { analyzeJobDescription } from "@/lib/ai/prompts/job-analysis";
import { requireUser } from "@/lib/api/requireUser";
import { withErrorHandling } from "@/lib/errors";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const requestSchema = z.object({
  description: z
    .string({ message: "description is required." })
    .trim()
    .min(50, "Job description is too short to analyze.")
    .max(30_000, "Job description is too long."),
});

/**
 * Runs the AI job analysis server-side. The result is logged in
 * provider_calls (raw Responses object, incl. `output_parsed`) under the
 * caller's user id; POST /api/jobs copies it into job_analyses by
 * `analysisCallId`, so the client never supplies analysis JSON itself.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  await enforceRateLimit(
    `ai:${auth.user.id}`,
    RATE_LIMITS.aiRequest.limit,
    RATE_LIMITS.aiRequest.windowSeconds,
  );

  const body: unknown = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const result = await analyzeJobDescription(parsed.data.description, {
    userId: auth.user.id,
  });
  return NextResponse.json({
    analysis: result.data,
    analysisCallId: result.callId,
  });
});
