import { z } from "zod";

/** An empty `NAME=` line in .env means "not set". */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({
    message: "NEXT_PUBLIC_SUPABASE_URL must be a valid URL",
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, {
    message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required",
  }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, {
    message: "SUPABASE_SERVICE_ROLE_KEY is required",
  }),
  SEARCH_PROVIDER: z
    .enum(["mock", "serpapi", "serper", "exa"], {
      message: "SEARCH_PROVIDER must be one of: mock, serpapi, serper, exa",
    })
    .default("mock"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  SERPAPI_API_KEY: z.string().optional(),
  SERPER_API_KEY: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  // Enrichment: Apify supreme_coder on the free plan's monthly credit, with
  // HarvestAPI as the pay-as-you-go fallback (docs/db-redesign.md §8.3).
  APIFY_API_TOKEN: z.string().optional(),
  APIFY_ACTOR_ID: z.string().default("supreme_coder~linkedin-profile-scraper"),
  HARVESTAPI_API_KEY: z.string().optional(),
  // "auto": Apify while its credit lasts, then HarvestAPI. "harvestapi" or
  // "apify" forces that provider (if configured).
  ENRICHMENT_PROVIDER: z.enum(["auto", "apify", "harvestapi"]).default("auto"),
  // HarvestAPI has no balance endpoint: the prepaid amount, if set, lets the
  // credits panel show what's left (prepaid minus measured spend).
  HARVESTAPI_PREPAID_USD: z.preprocess(
    blankToUndefined,
    z.coerce.number().nonnegative().optional(),
  ),
  // Search limits are shared by everyone on the same API keys. Set a name
  // here to keep the same budget across a key rotation.
  USAGE_TENANT: z.preprocess(blankToUndefined, z.string().trim().optional()),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid or missing environment variables:\n${issues}\n\nCheck .env.local against .env.example.`,
    );
  }

  return parsed.data;
}

export const env = loadEnv();
