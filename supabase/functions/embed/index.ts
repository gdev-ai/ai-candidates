// Text embeddings with Supabase's built-in gte-small model (384 dims, mean
// pooled, unit length). Called by the app's server (src/lib/ai/embeddings.ts)
// with the service-role key; no external API or billing involved.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MODEL = "gte-small";
/** ~125 ms of CPU per text; the runtime stops a request at ~2 s of CPU. */
const MAX_INPUTS = 8;
/** gte-small reads at most 512 tokens; longer text is truncated anyway. */
const MAX_CHARS = 2_000;

const session = new Supabase.ai.Session(MODEL);

/** The gateway has verified the JWT already (verify_jwt); only allow the
 * service role, so the public anon key can't spend this function's CPU. */
function isServiceRole(req: Request): boolean {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const payload = token?.split(".")[1];
  if (!payload) return false;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return (JSON.parse(json) as { role?: string }).role === "service_role";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405 });
  }
  if (!isServiceRole(req)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let input: unknown;
  try {
    ({ input } = await req.json());
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.length > MAX_INPUTS ||
    !input.every((text) => typeof text === "string")
  ) {
    return Response.json(
      { error: `input must be 1-${MAX_INPUTS} strings` },
      { status: 400 },
    );
  }

  const embeddings: number[][] = [];
  for (const text of input as string[]) {
    const vector = (await session.run(text.slice(0, MAX_CHARS) || " ", {
      mean_pool: true,
      normalize: true,
    })) as number[];
    embeddings.push(Array.from(vector));
  }
  return Response.json({
    model: MODEL,
    dimensions: embeddings[0]?.length ?? 0,
    embeddings,
  });
});
