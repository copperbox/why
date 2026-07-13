import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { main } from "../src/cli.ts";
import { capture, makeBundle } from "./helpers.ts";

const HARBOR = ["--bundle", "examples/harbor"];

async function blame(args: string[]): Promise<{ code: number; out: string; err: string }> {
  const { io, out, err } = capture();
  const code = await main(["blame", ...args], process.cwd(), io);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

function concept(fields: {
  type: string;
  title: string;
  description: string;
  confidence?: string;
  anchor: string;
}): string {
  return [
    "---",
    `type: ${fields.type}`,
    `title: ${fields.title}`,
    `description: ${fields.description}`,
    "why:",
    "  status: active",
    "  happened_on: 2024-01-01",
    ...(fields.confidence ? [`  confidence: ${fields.confidence}`] : []),
    "  anchors:",
    ...fields.anchor.split("\n"),
    "---",
    "",
    `# ${fields.title}`,
    "",
    "# Why",
    "",
    "Body.",
  ].join("\n");
}

test("blame src/lock.rs:47 tells the queue-locking story with the expired-Acme warning", async () => {
  const { code, out } = await blame(["src/lock.rs:47", ...HARBOR]);
  assert.equal(code, 0);
  assert.ok(out.includes("src/lock.rs:41-58"), `missing anchor span header:\n${out}`);
  assert.ok(out.includes("acquire_shared"), `missing anchor symbol:\n${out}`);
  assert.ok(out.includes("● Queue-based locking"), `missing decision block:\n${out}`);
  assert.ok(out.includes("recorded"), `missing confidence:\n${out}`);
  assert.ok(out.includes("because of ▸ 2024-03 lock stall (incident)"), `missing because-of edge:\n${out}`);
  assert.ok(out.includes("instead of ▸ Striped RwLock (attempt — failed)"), `missing instead-of edge:\n${out}`);
  assert.ok(out.includes("evidence"), `missing evidence line:\n${out}`);
  assert.ok(out.includes("PR #212"), `missing citation:\n${out}`);
  assert.ok(out.includes("⚠ Acme 45s gateway timeout"), `missing expired warning:\n${out}`);
  assert.ok(out.includes("EXPIRED 2025-06-30"), `missing expiry date:\n${out}`);
  assert.ok(
    out.includes('downstream decision "47s request deadline" may now be scar tissue'),
    `missing downstream note:\n${out}`,
  );
});

test("blame renders matched concepts newest-first", async () => {
  const { out } = await blame(["src/lock.rs:47", ...HARBOR]);
  const queue = out.indexOf("● Queue-based locking");
  const stall = out.indexOf("● 2024-03 lock stall");
  assert.ok(queue >= 0 && stall >= 0, `expected both blocks:\n${out}`);
  assert.ok(queue < stall, `2024-03-14 decision should render before 2024-03-11 incident:\n${out}`);
});

test("config/defaults.toml:31 surfaces the open question with ? glyph and no invented rationale", async () => {
  const { code, out } = await blame(["config/defaults.toml:31", ...HARBOR]);
  assert.equal(code, 0);
  assert.ok(out.includes("? Why is retry jitter disabled?"), `missing question block:\n${out}`);
  assert.ok(out.includes("question · 2024-06-02 · open"), `missing question meta:\n${out}`);
  assert.ok(!out.includes("likely —"), `a question must not get hedged rationale:\n${out}`);
  assert.ok(!out.includes("speculation"), `a question must not get invented rationale:\n${out}`);
});

test("a line outside every anchored range falls back to nearby concepts, nearest first", async () => {
  const { code, out } = await blame(["config/defaults.toml:999", ...HARBOR]);
  assert.equal(code, 0);
  assert.ok(out.includes("No concepts anchor config/defaults.toml:999"), out);
  const deadline = out.indexOf("47s request deadline");
  const jitter = out.indexOf("Why is retry jitter disabled?");
  const queue = out.indexOf("Queue-based locking");
  assert.ok(deadline >= 0 && jitter >= 0 && queue >= 0, `expected nearby concepts listed:\n${out}`);
  assert.ok(deadline < queue, `config/ concepts should list before src/ ones:\n${out}`);
  assert.ok(jitter < queue, `config/ concepts should list before src/ ones:\n${out}`);
});

test("a path with no anchors anywhere still lists the nearest anchored concepts", async () => {
  const { code, out } = await blame(["does/not/exist.rs", ...HARBOR]);
  assert.equal(code, 0);
  assert.ok(out.includes("No concepts anchor does/not/exist.rs"), out);
  assert.ok(out.includes("Queue-based locking") || out.includes("47s request deadline"), `never empty output:\n${out}`);
});

test("hedging is rendering logic: inferred and speculative get their prefixes, unstated hedges hardest", async () => {
  const root = await makeBundle({
    "decisions/hunch.md": concept({
      type: "decision",
      title: "Hunch",
      description: "The cache is sized to fit one shard.",
      confidence: "inferred",
      anchor: "    - path: src/cache.ts\n      lines: 1-10",
    }),
    "decisions/guess.md": concept({
      type: "decision",
      title: "Guess",
      description: "Retries were capped for a reason.",
      confidence: "speculative",
      anchor: "    - path: src/guess.ts",
    }),
    "decisions/blank.md": concept({
      type: "decision",
      title: "Blank",
      description: "Nobody recorded a confidence.",
      anchor: "    - path: src/blank.ts",
    }),
  });
  try {
    const hunch = await blame(["src/cache.ts:5", "--bundle", root]);
    assert.ok(
      hunch.out.includes("likely — The cache is sized to fit one shard."),
      `inferred must hedge with "likely —":\n${hunch.out}`,
    );
    const guess = await blame(["src/guess.ts", "--bundle", root]);
    assert.ok(
      guess.out.includes("speculation, thin evidence — Retries were capped for a reason."),
      `speculative must hedge with "speculation, thin evidence —":\n${guess.out}`,
    );
    const blank = await blame(["src/blank.ts", "--bundle", root]);
    assert.ok(
      blank.out.includes("speculation, thin evidence — Nobody recorded a confidence."),
      `unstated confidence must never hedge less than the evidence supports:\n${blank.out}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a lost anchor never matches — a last-known location is not a live claim", async () => {
  const root = await makeBundle({
    "decisions/gone.md": concept({
      type: "decision",
      title: "Gone",
      description: "This anchor was lost.",
      confidence: "recorded",
      anchor: "    - path: src/gone.ts\n      lines: 1-5\n      state: lost",
    }),
  });
  try {
    const { code, out } = await blame(["src/gone.ts:3", "--bundle", root]);
    assert.equal(code, 0);
    assert.ok(out.includes("No concepts anchor src/gone.ts:3"), out);
    assert.ok(!out.includes("Gone"), `a lost anchor must not surface as if live:\n${out}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--json emits the versioned story contract (docs/ui-contract.md)", async () => {
  const { code, out } = await blame(["src/lock.rs:47", ...HARBOR, "--json"]);
  assert.equal(code, 0);
  const report = JSON.parse(out);
  assert.equal(report.schemaVersion, 1);
  assert.deepEqual(report.target, { path: "src/lock.rs", lines: { start: 47, end: 47 } });
  const hit = report.hits[0];
  assert.equal(hit.id, "decisions/queue-based-locking");
  assert.equal(hit.edges.becauseOf.length, 2);
  assert.equal(hit.edges.insteadOf[0].title, "Striped RwLock");
  assert.equal(hit.hedged, false, "recorded confidence must not hedge");
  assert.equal(hit.renderedRationale, hit.description, "unhedged rationale is the description verbatim");
  const pr = hit.citations.find((c: { label: string }) => c.label.startsWith("PR #212"));
  assert.ok(pr, `citations must carry label + url:\n${JSON.stringify(hit.citations)}`);
  assert.equal(pr.url, "https://github.com/acme/harbor/pull/212");
  const acme = report.warnings.find((w: { id: string }) => w.id === "constraints/acme-45s-timeout");
  assert.ok(acme, "expired constraint missing from warnings");
  assert.equal(acme.downstream[0].title, "47s request deadline");
});

test("--json precomputes hedging into the data: inferred hits carry hedged + the prefix", async () => {
  const root = await makeBundle({
    "decisions/hunch.md": concept({
      type: "decision",
      title: "Hunch",
      description: "The cache is sized to fit one shard.",
      confidence: "inferred",
      anchor: "    - path: src/cache.ts\n      lines: 1-10",
    }),
  });
  try {
    const { out } = await blame(["src/cache.ts:5", "--bundle", root, "--json"]);
    const hit = JSON.parse(out).hits[0];
    assert.equal(hit.hedged, true, "inferred confidence must be hedged in the data");
    assert.ok(
      hit.renderedRationale.startsWith("likely — "),
      `renderedRationale must carry the hedge prefix:\n${hit.renderedRationale}`,
    );
    assert.equal(hit.renderedRationale, "likely — The cache is sized to fit one shard.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("blame without a target, or with a backwards range, is a usage error", async () => {
  const missing = await blame([...HARBOR]);
  assert.equal(missing.code, 2);
  assert.ok(missing.err.includes("why blame <path>[:line[-line]]"), missing.err);
  const backwards = await blame(["src/lock.rs:5-3", ...HARBOR]);
  assert.equal(backwards.code, 2);
});

test("acceptance: npx tsx src/cli.ts blame src/lock.rs:47 --bundle examples/harbor", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "blame", "src/lock.rs:47", "--bundle", "examples/harbor"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("Queue-based locking"), result.stdout);
  assert.ok(result.stdout.includes("Acme 45s gateway timeout"), result.stdout);
});
