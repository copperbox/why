// `why serve` (issue 502): every JSON endpoint must emit a schema-valid
// UI-contract payload (docs/ui-contract.md), the server must be localhost-only
// and provably read-only, and the built SPA assets must be self-contained —
// no http(s):// reference anywhere, the same guarantee okf-mcp's html export
// makes. Endpoints run against a temp repo whose fabricated sources match the
// harbor bundle's anchors, so the story for src/lock.rs:47 must carry the
// expired-Acme warning.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import { JSDOM } from "jsdom";
import { main } from "../src/cli.ts";
import { buildUiAssets } from "../src/serve-assets.ts";
import { startWhyServer, type RunningWhyServer } from "../src/serve.ts";
import { capture, git, makeHarborRepo } from "./helpers.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const HARBOR = join(root, "examples/harbor");

const ajv = new Ajv2020({ allErrors: true });
ajv.addKeyword("schemaVersion"); // the contract's own version marker, not a JSON Schema keyword

function compile(schemaFile: string): ValidateFunction {
  return ajv.compile(JSON.parse(readFileSync(join(root, "schemas", schemaFile), "utf8")));
}

const validateStory = compile("story.schema.json");
const validateCoverage = compile("coverage.schema.json");
const validateGraph = compile("graph.schema.json");
const validateFiles = compile("files.schema.json");
const validateGitBlame = compile("gitblame.schema.json");
const validateDoctorSummary = compile("doctor.schema.json");

function assertValid(validate: ValidateFunction, payload: unknown, label: string): void {
  assert.ok(
    validate(payload),
    `${label} failed schema validation:\n${JSON.stringify(validate.errors, null, 2)}\n\npayload:\n${JSON.stringify(payload, null, 2)}`,
  );
}

const repo = await makeHarborRepo("why-serve-");
const running: RunningWhyServer = await startWhyServer(join(repo, ".why"));
test.after(async () => {
  await running.close();
  await rm(repo, { recursive: true, force: true });
});

async function get(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(new URL(path, running.url));
  return { status: res.status, body: await res.json() };
}

async function getOk(path: string): Promise<any> {
  const { status, body } = await get(path);
  assert.equal(status, 200, `GET ${path} → ${status}: ${JSON.stringify(body)}`);
  return body;
}

// --- Endpoints --------------------------------------------------------------

test("the server binds 127.0.0.1 on a random free port", () => {
  assert.match(running.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.ok(running.port > 0);
});

test("GET /api/files: schema-valid, lists the tracked files", async () => {
  const files = await getOk("/api/files");
  assertValid(validateFiles, files, "files");
  assert.ok(files.files.includes("src/lock.rs"), JSON.stringify(files.files));
  assert.ok(files.files.includes("config/defaults.toml"));
  assert.ok(
    files.files.includes(".why/decisions/queue-based-locking.md"),
    "tracked bundle files appear too — the tree is honest git ls-files output",
  );
});

test("GET /api/blame: schema-valid, one entry per line with content at HEAD", async () => {
  const blame = await getOk("/api/blame?path=src/lock.rs");
  assertValid(validateGitBlame, blame, "gitblame");
  assert.equal(blame.path, "src/lock.rs");
  assert.equal(blame.head, git(repo, "rev-parse", "HEAD"));
  assert.equal(blame.lines.length, 80);
  assert.equal(blame.lines[0].text, "// line 1");
  assert.equal(blame.lines[46].text, "// line 47");
  assert.equal(blame.lines[0].author, "why tests");
  assert.equal(blame.lines[0].summary, "files matching the harbor anchors");
});

test("GET /api/coverage: schema-valid, stamped with the repo HEAD", async () => {
  const coverage = await getOk("/api/coverage");
  assertValid(validateCoverage, coverage, "coverage");
  assert.equal(coverage.head, git(repo, "rev-parse", "HEAD"));
  const lock = coverage.files.find((f: { path: string }) => f.path === "src/lock.rs");
  assert.ok(lock, "src/lock.rs must be covered");
});

test("GET /api/story for src/lock.rs:47: schema-valid, includes the expired-constraint warning", async () => {
  const story = await getOk("/api/story?path=src/lock.rs&start=47&end=47");
  assertValid(validateStory, story, "story");
  assert.equal(story.hits[0].id, "decisions/queue-based-locking");
  const acme = story.warnings.find((w: { id: string }) => w.id === "constraints/acme-45s-timeout");
  assert.ok(acme, "the expired Acme constraint must warn on src/lock.rs:47");
  assert.equal(acme.status, "expired");
  assert.equal(acme.downstream[0].id, "decisions/47s-request-deadline");
});

test("GET /api/story without lines: a whole-file story, still schema-valid", async () => {
  const story = await getOk("/api/story?path=config/defaults.toml");
  assertValid(validateStory, story, "whole-file story");
  assert.ok(story.hits.length >= 2, "the deadline decision and the jitter question both anchor here");
});

test("GET /api/graph: schema-valid with harbor's six nodes", async () => {
  const graph = await getOk("/api/graph");
  assertValid(validateGraph, graph, "graph");
  assert.equal(graph.nodes.length, 6);
  assert.ok(graph.edges.length > 0);
});

test("GET /api/doctor: schema-valid summary with all seven sections in order", async () => {
  const doctor = await getOk("/api/doctor");
  assertValid(validateDoctorSummary, doctor, "doctor summary");
  assert.deepEqual(
    doctor.sections.map((s: { key: string }) => s.key),
    [
      "lostAnchors",
      "staleAsOf",
      "reviewByPastDue",
      "unknownConstraints",
      "expiredConstraints",
      "openQuestions",
      "lintErrors",
    ],
  );
  const open = doctor.sections.find((s: { key: string }) => s.key === "openQuestions");
  assert.equal(open.count, 1, "harbor has one open question");
  assert.ok(open.items[0].includes("questions/why-retry-jitter-disabled"), open.items[0]);
  const expired = doctor.sections.find((s: { key: string }) => s.key === "expiredConstraints");
  assert.ok(expired.items[0].includes("constraints/acme-45s-timeout"), expired.items[0]);
});

test("the page shell and assets are served", async () => {
  for (const [path, needle] of [
    ["/", "<!doctype html>"],
    ["/app.js", "api/"],
    ["/app.css", "--bg"],
  ] as const) {
    const res = await fetch(new URL(path, running.url));
    assert.equal(res.status, 200, path);
    assert.ok((await res.text()).includes(needle), `${path} must include ${needle}`);
  }
});

// --- Errors and the read-only guarantee ------------------------------------------

test("errors: unknown endpoint 404, unknown file 404, bad params 400, mutation 405", async () => {
  assert.equal((await get("/api/nope")).status, 404);
  assert.equal((await get("/api/blame?path=does/not/exist.rs")).status, 404);
  assert.equal((await get("/api/blame")).status, 400);
  assert.equal((await get("/api/story?path=src/lock.rs&start=0")).status, 400);
  assert.equal((await get("/api/story?path=src/lock.rs&start=9&end=3")).status, 400);
  const post = await fetch(new URL("/api/files", running.url), { method: "POST" });
  assert.equal(post.status, 405, "the server is read-only — non-GET refused");
  assert.ok(((await post.json()) as { error: string }).error.includes("read-only"));
});

test("read-only: serving mutates neither the repo nor the bundle", async () => {
  // Exercised by every test above; the strongest check is byte-level: the
  // committed tree is untouched and no derived state (anchor-index cache)
  // was written into the bundle.
  assert.equal(git(repo, "status", "--porcelain"), "");
  assert.ok(!existsSync(join(repo, ".why/.cache")), "no cache dir may be written by a read-only server");
});

// --- Self-containment --------------------------------------------------------------

test("built assets contain no http(s):// references — fully self-contained", async () => {
  const assets = await buildUiAssets();
  for (const [name, text] of Object.entries(assets)) {
    assert.ok(text.length > 0, `${name} asset is empty`);
    assert.ok(!/https?:\/\//i.test(text), `${name} asset references an external URL`);
  }
});

// --- The whole SPA in jsdom -----------------------------------------------------------

test("the built app boots in jsdom: tree renders, gutter paints, click tells the story", async () => {
  const assets = await buildUiAssets();
  const dom = new JSDOM("<!doctype html><html><body><div id=\"app\"></div></body></html>", {
    url: running.url,
    runScripts: "outside-only",
  });
  const win = dom.window as any;
  // jsdom ships no fetch; route the app's relative calls at the real server.
  win.fetch = (path: string) => fetch(new URL(path, running.url));
  win.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 16);

  const until = async (find: () => Element | null, what: string): Promise<Element> => {
    for (let i = 0; i < 100; i++) {
      const found = find();
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail(`timed out waiting for ${what}; body:\n${dom.window.document.body.innerHTML}`);
  };

  win.eval(assets.js);
  const doc = dom.window.document;
  await until(() => doc.querySelector(".tree a.file"), "the file tree");
  assert.ok(doc.querySelector("#chips .chip"), "doctor chips render in the header");

  // Navigate to the covered file; the why gutter must paint 41-58 by
  // confidence (queue-based-locking is recorded) and line 47 must be covered.
  win.location.hash = `#/file/${encodeURIComponent("src/lock.rs")}`;
  win.dispatchEvent(new win.HashChangeEvent("hashchange"));
  await until(() => doc.querySelector("table.code tr"), "the blame table");
  const rows = doc.querySelectorAll("table.code tr");
  assert.equal(rows.length, 80);
  const line47 = rows[46]!;
  const gutter = line47.querySelector("td.why")!;
  assert.ok(gutter.classList.contains("why-conf-recorded"), gutter.className);
  assert.equal(gutter.textContent, "●");

  // Click line 47 → the story panel renders the loud warning first (matching
  // the VS Code hover/webview order), then the hit.
  (line47 as HTMLElement).click();
  const panel = await until(() => doc.querySelector(".story-panel .card"), "the story panel");
  const text = doc.querySelector(".story-panel")!.textContent!;
  assert.ok(panel.classList.contains("warning"), `first card should be the warning: ${text}`);
  assert.ok(panel.textContent!.includes("EXPIRED 2025-06-30"), text);
  assert.ok(text.includes("Queue-based locking"), text);
  assert.ok(text.includes("may now be scar tissue"), text);
});

// --- CLI surface --------------------------------------------------------------------

test("serve usage: positionals and a malformed --port are usage errors", async () => {
  for (const args of [
    ["serve", "positional", "--bundle", HARBOR],
    ["serve", "--port", "not-a-port", "--bundle", HARBOR],
    ["serve", "--port", "0", "--bundle", HARBOR],
    ["serve", "--port", "70000", "--bundle", HARBOR],
  ]) {
    const { io, err } = capture();
    const code = await main(args, root, io);
    assert.equal(code, 2, `why ${args.join(" ")} should be a usage error: ${err.join("\n")}`);
  }
});

test("serve: a taken port is an operational error naming the bind", async () => {
  const { io, err } = capture();
  const code = await main(
    ["serve", "--port", String(running.port), "--bundle", join(repo, ".why")],
    repo,
    io,
  );
  assert.equal(code, 1);
  assert.ok(err.join("\n").includes("cannot bind 127.0.0.1"), err.join("\n"));
});
