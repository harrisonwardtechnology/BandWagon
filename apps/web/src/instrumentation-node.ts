import { parseAppRole, runsWorker } from "@/lib/job-policy";
import { startWorker } from "@/lib/worker";
import { reportErrorToGlitchTip } from "@/lib/glitchtip";

// Node-only startup, loaded from instrumentation.ts register().
const role = parseAppRole(process.env.APP_ROLE);
if (process.env.NEXT_PHASE !== "phase-production-build" && runsWorker(role) && process.env.DATABASE_URL) {
  startWorker();
}

// Errors that escape every handler (mostly background work). Next already logs
// them; this makes them visible in GlitchTip too.
if (process.env.NEXT_PHASE !== "phase-production-build") {
  process.on("unhandledRejection", (reason) => reportErrorToGlitchTip(reason, { source: role === "web" ? "server" : "worker", route: "process:unhandledRejection", level: "error" }));
  process.on("uncaughtExceptionMonitor", (error) => reportErrorToGlitchTip(error, { source: role === "web" ? "server" : "worker", route: "process:uncaughtException", level: "fatal" }));
}
