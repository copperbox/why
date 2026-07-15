// Issue 403 acceptance: the CI recipes and the self-hosting switch. The
// workflows under .github/workflows/ must be structurally valid GitHub
// Actions files (the actionlint-equivalent check), reference only npm
// scripts that exist, and appear verbatim in docs/ci.md so the doc and the
// live workflows cannot drift. The repo's own .why/ bundle — the Decision
// log converted into concepts — must lint clean and read healthy to doctor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { loadBundle } from "../src/bundle.ts";
import { buildDoctorReport } from "../src/doctor.ts";
import { lintBundle } from "../src/lint.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(join(root, path), "utf8");

const WORKFLOWS_DIR = ".github/workflows";
const EXPECTED_WORKFLOWS = ["why-pr-gate.yml", "why-anchor.yml", "why-audit.yml", "why-capture.yml"];

function workflowFiles(): string[] {
  return readdirSync(join(root, WORKFLOWS_DIR)).filter((f) => /\.ya?ml$/.test(f)).sort();
}

test("the why workflows exist under .github/workflows/", () => {
  const files = workflowFiles();
  for (const expected of EXPECTED_WORKFLOWS) {
    assert.ok(files.includes(expected), `${WORKFLOWS_DIR}/${expected} is missing (have: ${files.join(", ")})`);
  }
});

test("every workflow is structurally valid GitHub Actions YAML", () => {
  for (const file of workflowFiles()) {
    const doc: unknown = parse(read(join(WORKFLOWS_DIR, file)));
    assert.ok(doc !== null && typeof doc === "object", `${file}: not a YAML map`);
    const workflow = doc as Record<string, unknown>;
    assert.equal(typeof workflow.name, "string", `${file}: needs a name`);
    // The yaml package reads YAML 1.2, so `on:` stays the string key "on".
    const on = workflow.on as Record<string, unknown> | string | string[];
    assert.ok(on !== undefined && on !== null, `${file}: needs an "on:" trigger`);
    if (typeof on === "object" && !Array.isArray(on) && "schedule" in on) {
      for (const entry of on.schedule as Array<{ cron?: string }>) {
        assert.equal(typeof entry.cron, "string", `${file}: schedule entries need a cron string`);
        assert.equal(entry.cron!.trim().split(/\s+/).length, 5, `${file}: cron "${entry.cron}" must have 5 fields`);
      }
    }
    const jobs = workflow.jobs as Record<string, Record<string, unknown>>;
    assert.ok(jobs && typeof jobs === "object" && Object.keys(jobs).length > 0, `${file}: needs jobs`);
    for (const [jobId, job] of Object.entries(jobs)) {
      assert.equal(typeof job["runs-on"], "string", `${file}: job ${jobId} needs runs-on`);
      const steps = job.steps as Array<Record<string, unknown>>;
      assert.ok(Array.isArray(steps) && steps.length > 0, `${file}: job ${jobId} needs steps`);
      for (const [i, step] of steps.entries()) {
        assert.ok(
          typeof step.uses === "string" || typeof step.run === "string",
          `${file}: job ${jobId} step ${i} needs uses: or run:`,
        );
      }
    }
  }
});

/** Every `npm run <script>` (and `npm ci`) a workflow executes must exist. */
test("workflows reference only npm scripts that exist", () => {
  const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
  let checked = 0;
  for (const file of workflowFiles()) {
    for (const match of read(join(WORKFLOWS_DIR, file)).matchAll(/npm run\s+([^\n]*)/g)) {
      // First non-flag token after `npm run` is the script name.
      const script = match[1]!.split(/\s+/).find((token) => token !== "" && !token.startsWith("-"));
      assert.ok(script !== undefined, `${file}: "npm run" with no script name`);
      assert.ok(script in scripts, `${file}: npm script "${script}" is not in package.json`);
      checked++;
    }
  }
  assert.ok(checked > 0, "expected the workflows to run npm scripts");
});

test("docs/ci.md carries each live workflow verbatim, so the doc cannot drift", () => {
  const doc = read("docs/ci.md");
  for (const file of workflowFiles()) {
    const content = read(join(WORKFLOWS_DIR, file)).trim();
    assert.ok(doc.includes(content), `docs/ci.md: the fenced block for ${WORKFLOWS_DIR}/${file} is missing or drifted`);
    assert.ok(doc.includes(file), `docs/ci.md: never names ${file}`);
  }
});

// --- The self-hosted bundle -------------------------------------------------

test("why lint passes on the repo's own .why/ bundle", async () => {
  const bundle = await loadBundle(join(root, ".why"));
  assert.ok(bundle.concepts.size >= 9, `expected the nine Decision log concepts, got ${bundle.concepts.size}`);
  const findings = await lintBundle(bundle);
  assert.deepEqual(findings, [], "lint findings on .why/");
});

test("why doctor reads the repo's own .why/ bundle as healthy", async () => {
  const bundle = await loadBundle(join(root, ".why"));
  const report = await buildDoctorReport(bundle);
  assert.equal(report.sections.lostAnchors.count, 0, "lost anchors in .why/");
  assert.equal(report.sections.lintErrors.count, 0, "lint errors in .why/");
  assert.equal(report.healthy, true, "doctor says .why/ is unhealthy");
});

/** Spot-assert two bootstrap Decision log entries survived as concepts (issue 403). */
test("bootstrap decision-log entries are recorded decision concepts", async () => {
  const bundle = await loadBundle(join(root, ".why"));
  for (const slug of ["decisions/okf-as-substrate", "decisions/escalation-circuit-breaker"]) {
    const concept = bundle.concepts.get(slug);
    assert.ok(concept !== undefined, `.why/ has no concept "${slug}"`);
    assert.equal(concept.frontmatter.type, "decision", `${slug}: wrong type`);
    assert.equal(concept.why.confidence, "recorded", `${slug}: Decision log entries are recorded rationale`);
    assert.ok(concept.links.length + concept.body.length > 0, `${slug}: empty concept`);
  }
});
