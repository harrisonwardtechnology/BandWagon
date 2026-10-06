import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const WORKFLOW = new URL("../../../.github/workflows/production-synthetic.yml", import.meta.url);

// The shell of the "Check configuration" step, without the YAML indentation.
async function configStepScript() {
  const workflow = await readFile(WORKFLOW, "utf8");
  const start = workflow.indexOf("- name: Check configuration");
  const end = workflow.indexOf("- name: Verify live, ready, and deep health");
  assert.ok(start > 0 && end > start, "both steps exist");
  const step = workflow.slice(start, end);
  const run = step.slice(step.indexOf("run: |") + "run: |".length);
  return { workflow, step, script: run.split("\n").map((line) => line.replace(/^ {10}/, "")).join("\n") };
}

function runConfigStep(script: string, productionUrl: string) {
  const dir = mkdtempSync(join(tmpdir(), "bandwagon-synthetic-"));
  try {
    const output = join(dir, "output");
    const summary = join(dir, "summary");
    const stdout = execFileSync("bash", ["-e", "-c", script], {
      env: { ...process.env, SYNTHETIC_BASE_URL: productionUrl, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
      encoding: "utf8",
    });
    const read = (file: string) => { try { return readFileSync(file, "utf8"); } catch { return ""; } };
    return { stdout, output: read(output), summary: read(summary) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The step is bash, as on the GitHub runner. On Windows these two are skipped; the static checks below still run.
const noBash = process.platform === "win32" ? "bash step is only executed on Linux and macOS" : false;

test("the synthetic check skips with a notice when PRODUCTION_URL is unset", { skip: noBash }, async () => {
  const { script } = await configStepScript();
  // Exit code 0: execFileSync would throw on anything else.
  const skipped = runConfigStep(script, "");
  assert.match(skipped.stdout, /^::notice title=Synthetic check skipped::.*PRODUCTION_URL/m);
  assert.equal(skipped.output.trim(), "configured=false");
  assert.match(skipped.summary, /PRODUCTION_URL is not set/);
});

test("the synthetic check still runs when PRODUCTION_URL is set", { skip: noBash }, async () => {
  const { script } = await configStepScript();
  const configured = runConfigStep(script, "https://bandwagon.club");
  assert.equal(configured.output.trim(), "configured=true");
  assert.doesNotMatch(configured.stdout, /::notice/);
});

test("the health step only runs when configured, and the schedule is unchanged", async () => {
  const { workflow, step } = await configStepScript();
  assert.match(step, /id: config/);
  assert.doesNotMatch(step, /exit 1/);
  assert.match(step, /::notice title=Synthetic check skipped::/);
  assert.match(step, /echo "configured=false" >> "\$GITHUB_OUTPUT"/);
  const health = workflow.slice(workflow.indexOf("- name: Verify live, ready, and deep health"));
  assert.match(health, /^\s+if: steps\.config\.outputs\.configured == 'true'$/m);
  // A real health failure must still fail the run.
  assert.match(health, /throw new Error\(`\$\{path\} failed with HTTP/);
  assert.match(workflow, /schedule:\s+- cron: "17 \* \* \* \*"/);
});

test("the domain change guide uses a reserved example domain", async () => {
  const guide = await readFile(new URL("../../../docs/operations/CHANGING-TENANT-DOMAIN.md", import.meta.url), "utf8");
  assert.doesNotMatch(guide, /bandwagonrides\.com/);
  assert.match(guide, /Moving from `bandwagon\.club` to a new product domain, `example\.org`/);
  assert.match(guide, /TENANT_BASE_DOMAIN=example\.org/);
});
