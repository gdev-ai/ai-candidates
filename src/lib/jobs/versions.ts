/**
 * Job search versions: an exact snapshot of the job details and
 * requirements a search ran with. Client-safe: types and pure logic only
 * (the server side is ensureJobVersion in versionsServer.ts).
 */

export interface VersionRequirement {
  kind: string;
  text: string;
}

export interface JobVersionSnapshot {
  title: string;
  description: string;
  company_id: string | null;
  employment_type: string | null;
  work_arrangement: string | null;
  seniority: string | null;
  city: string | null;
  country_code: string;
  min_experience: number | null;
  max_experience: number | null;
  requirements: VersionRequirement[];
}

/** One version as GET /api/jobs/[id]/versions returns it. */
export interface JobVersionSummary {
  id: string;
  version: number;
  created_at: string;
  created_by_name: string | null;
  snapshot: JobVersionSnapshot;
  /** Candidates first found by this version's searches. */
  candidates: number;
  scored: number;
  searches: {
    id: string;
    status: string;
    created_at: string;
    queries: string[];
    candidates_found: number;
  }[];
}

interface SnapshotSource {
  title: string;
  description: string;
  company_id: string | null;
  employment_type: string | null;
  work_arrangement: string | null;
  seniority: string | null;
  city: string | null;
  country_code: string;
  min_experience: number | string | null;
  max_experience: number | string | null;
}

const toNumber = (v: number | string | null): number | null =>
  v === null || v === "" ? null : Number(v);

export function buildSnapshot(
  job: SnapshotSource,
  requirements: VersionRequirement[],
): JobVersionSnapshot {
  return {
    title: job.title,
    description: job.description,
    company_id: job.company_id,
    employment_type: job.employment_type,
    work_arrangement: job.work_arrangement,
    seniority: job.seniority,
    city: job.city,
    country_code: job.country_code,
    min_experience: toNumber(job.min_experience),
    max_experience: toNumber(job.max_experience),
    requirements: requirements.map((r) => ({ kind: r.kind, text: r.text })),
  };
}

/** Coerces a stored jsonb snapshot (older or partial ones included). */
export function readSnapshot(value: unknown): JobVersionSnapshot {
  const v = (value ?? {}) as Partial<Record<keyof JobVersionSnapshot, unknown>>;
  const str = (x: unknown) => (typeof x === "string" ? x : null);
  const num = (x: unknown) =>
    x === null || x === undefined || x === "" ? null : Number(x);
  return {
    title: str(v.title) ?? "",
    description: str(v.description) ?? "",
    company_id: str(v.company_id),
    employment_type: str(v.employment_type),
    work_arrangement: str(v.work_arrangement),
    seniority: str(v.seniority),
    city: str(v.city),
    country_code: str(v.country_code) ?? "EG",
    min_experience: num(v.min_experience),
    max_experience: num(v.max_experience),
    requirements: Array.isArray(v.requirements)
      ? v.requirements.flatMap((r) =>
          r && typeof r === "object" && "kind" in r && "text" in r
            ? [{ kind: String(r.kind), text: String(r.text) }]
            : [],
        )
      : [],
  };
}

/**
 * Same search spec: every field equal and the same requirements (order and
 * letter case aside, matching diffSnapshots).
 */
export function sameSnapshot(
  a: JobVersionSnapshot,
  b: JobVersionSnapshot,
): boolean {
  const key = (s: JobVersionSnapshot) =>
    JSON.stringify([
      s.title.trim(),
      s.description.trim(),
      s.company_id,
      s.employment_type,
      s.work_arrangement,
      s.seniority,
      s.city,
      s.country_code,
      s.min_experience,
      s.max_experience,
      s.requirements
        .map((r) => `${r.kind}\u0000${r.text.trim().toLowerCase()}`)
        .sort(),
    ]);
  return key(a) === key(b);
}

export const SNAPSHOT_FIELD_LABELS: Partial<
  Record<keyof JobVersionSnapshot, string>
> = {
  title: "Title",
  seniority: "Seniority",
  employment_type: "Employment type",
  work_arrangement: "Work arrangement",
  city: "City",
  min_experience: "Min experience",
  max_experience: "Max experience",
  company_id: "Company",
  description: "Job description",
};

export interface SnapshotChanges {
  fields: { field: keyof JobVersionSnapshot; from: string; to: string }[];
  added: VersionRequirement[];
  removed: VersionRequirement[];
}

function show(value: unknown): string {
  return value === null || value === undefined || value === ""
    ? "—"
    : String(value);
}

/** What changed from one version to the next (requirements by kind + text). */
export function diffSnapshots(
  from: JobVersionSnapshot,
  to: JobVersionSnapshot,
): SnapshotChanges {
  const fields: SnapshotChanges["fields"] = [];
  for (const field of Object.keys(
    SNAPSHOT_FIELD_LABELS,
  ) as (keyof JobVersionSnapshot)[]) {
    const a = from[field];
    const b = to[field];
    if (field === "description") {
      if (String(a).trim() !== String(b).trim())
        fields.push({ field, from: "", to: "" });
      continue;
    }
    if (show(a) !== show(b)) fields.push({ field, from: show(a), to: show(b) });
  }
  const id = (r: VersionRequirement) =>
    `${r.kind}\u0000${r.text.trim().toLowerCase()}`;
  const before = new Set(from.requirements.map(id));
  const after = new Set(to.requirements.map(id));
  return {
    fields,
    added: to.requirements.filter((r) => !before.has(id(r))),
    removed: from.requirements.filter((r) => !after.has(id(r))),
  };
}

export function hasChanges(changes: SnapshotChanges): boolean {
  return (
    changes.fields.length > 0 ||
    changes.added.length > 0 ||
    changes.removed.length > 0
  );
}
