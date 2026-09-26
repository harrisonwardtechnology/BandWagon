import { parseAppRole, runsWorker } from "@/lib/job-policy";
import { startWorker } from "@/lib/worker";

// Node-only startup, loaded from instrumentation.ts register().
const role = parseAppRole(process.env.APP_ROLE);
if (process.env.NEXT_PHASE !== "phase-production-build" && runsWorker(role) && process.env.DATABASE_URL) {
  startWorker();
}
