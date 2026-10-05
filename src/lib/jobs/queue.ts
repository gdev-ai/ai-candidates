import { start } from "workflow/api";

import { sourcingRunWorkflow } from "@/workflows/sourcingRun";

/**
 * Starts the durable sourcing workflow for a search_runs row and returns
 * the workflow run id (stored on search_runs.workflow_run_id). Replaces the
 * old in-process waitUntil queue, which left runs stuck when the function
 * instance was frozen.
 */
export async function startSourcingRun(searchRunId: string): Promise<string> {
  const run = await start(sourcingRunWorkflow, [searchRunId]);
  return run.runId;
}
