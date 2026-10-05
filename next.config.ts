import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

// Enables "use workflow" / "use step" (src/workflows) and the
// /.well-known/workflow/ endpoints (excluded in the middleware matcher).
export default withWorkflow(nextConfig);
