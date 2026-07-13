// The UI data contract (issue 501, docs/ui-contract.md): the schemas in
// schemas/ must validate the real payloads the engine emits, mutated payloads
// must fail (the schemas actually constrain), and hedging must live in the
// data — a renderer that ignores confidence still cannot display unhedged
// speculation. Validation runs through ajv, an implementation independent of
// this codebase, so a schema bug can't be masked by a matching validator bug.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import { main } from "../src/cli.ts";
import { capture, git, makeBundle, makeRepo, write } from "./helpers.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const HARBOR = join(root, "examples/harbor");

const ajv = new Ajv2020({ allErrors: true });
// The contract's own top-level version marker (each schema document carries
// one), not a JSON Schema keyword — registered so ajv stays in strict mode.
ajv.addKeyword("schemaVersion");

function compile(schemaFile: string): ValidateFunction {
  return ajv.compile(JSON.parse(readFileSync(join(root, "schemas", schemaFile), "utf8")));
}

const validateStory = compile("story.schema.json");
const validateCoverage = compile("coverage.schema.json");
const validateGraph = compile("graph.schema.json");

function assertValid(validate: ValidateFunction, payload: unknown, label: string): void {
  assert.ok(
    validate(payload),
    `${label} failed schema validation:\n${JSON.stringify(validate.errors, null, 2)}\n\npayload:\n${JSON.stringify(payload, null, 2)}`,
  );
}

async function runJson(args: string[], cwd = root): Promise<any> {
  const { io, out, err } = capture();
  const code = await main(args, cwd, io);
  assert.equal(code, 0, `why ${args.join(" ")} exited ${code}:\n${err.join("\n")}`);
  return JSON.parse(out.join("\n"));
}

// --- story -------------------------------------------------------------------

test("story: real blame --json over harbor validates, expired warning included", async () => {
  const story = await runJson(["blame", "src/lock.rs:47", "--bundle", HARBOR, "--json"]);
  assertValid(validateStory, story, "blame src/lock.rs:47");
  assert.equal(story.schemaVersion, 1);
  assert.equal(story.hits[0].id, "decisions/queue-based-locking");
  const acme = story.warnings.find((w: { id: string }) => w.id === "constraints/acme-45s-timeout");
  assert.ok(acme, "the expired Acme constraint must warn on src/lock.rs:47");
  assert.equal(acme.status, "expired");
  assert.deepEqual(acme.downstream[0], {
    title: "47s request deadline",
    id: "decisions/47s-request-deadline",
    type: "decision",
    status: "active",
  });
});

test("story: the nearest-concepts fallback for uncovered targets validates too", async () => {
  const story = await runJson(["blame", "does/not/exist.rs", "--bundle", HARBOR, "--json"]);
  assertValid(validateStory, story, "blame does/not/exist.rs");
  assert.equal(story.hits.length, 0);
  assert.ok(story.nearby.length > 0, "fallback must list nearby anchored concepts, never nothing");
});

test("hedging lives in the data: an inferred hit carries hedged + the prefix, schema-enforced", async () => {
  const bundle = await makeBundle({
    "decisions/hunch.md": [
      "---",
      "type: decision",
      "title: Hunch",
      "description: The cache is sized to fit one shard.",
      "why:",
      "  status: active",
      "  happened_on: 2024-01-01",
      "  confidence: inferred",
      "  anchors:",
      "    - path: src/cache.ts",
      "      lines: 1-10",
      "---",
      "",
      "# Hunch",
      "",
      "# Why",
      "",
      "Body.",
    ].join("\n"),
  });
  try {
    const story = await runJson(["blame", "src/cache.ts:5", "--bundle", bundle, "--json"]);
    assertValid(validateStory, story, "inferred-hit story");
    const hit = story.hits[0];
    assert.equal(hit.hedged, true);
    assert.ok(hit.renderedRationale.startsWith("likely — "), hit.renderedRationale);

    // The invariant is structural, not just producer behavior: the same
    // payload claiming an unhedged inferred rationale must fail the schema.
    hit.hedged = false;
    assert.equal(validateStory(story), false, "schema must reject hedged: false on an inferred hit");
  } finally {
    await rm(bundle, { recursive: true, force: true });
  }
});

test("story: hand-mutated payloads fail validation", async () => {
  const pristine = await runJson(["blame", "src/lock.rs:47", "--bundle", HARBOR, "--json"]);
  const mutate = (change: (s: any) => void): boolean => {
    const copy = JSON.parse(JSON.stringify(pristine));
    change(copy);
    return validateStory(copy) as boolean;
  };
  assert.equal(mutate(() => {}), true, "the unmutated payload must validate");
  assert.equal(mutate((s) => (s.schemaVersion = 2)), false, "wrong schemaVersion");
  assert.equal(mutate((s) => delete s.hits[0].renderedRationale), false, "missing renderedRationale");
  assert.equal(mutate((s) => (s.hits[0].confidence = "certain")), false, "off-ladder confidence");
  assert.equal(mutate((s) => (s.hits[0].surprise = 1)), false, "unknown key on a hit");
  assert.equal(mutate((s) => (s.target.lines.start = 0)), false, "0-based line range");
  assert.equal(mutate((s) => delete s.warnings), false, "missing warnings");
});

// --- coverage (`why export ui-index`) -----------------------------------------

test("coverage: ui-index over a temp repo matching the harbor anchors validates", async () => {
  const repo = await makeRepo("why-ui-index-");
  try {
    const line = (n: number) => `// line ${n}\n`;
    const body = (n: number) => Array.from({ length: n }, (_, i) => line(i + 1)).join("");
    await write(repo, "src/lock.rs", body(80));
    await write(repo, "src/dispatch/queue.rs", body(30));
    await write(repo, "src/server/deadline.rs", body(20));
    await write(repo, "config/defaults.toml", body(40));
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "files matching the harbor anchors");
    await cp(HARBOR, join(repo, ".why"), { recursive: true });

    const coverage = await runJson(["export", "ui-index"], repo);
    assertValid(validateCoverage, coverage, "ui-index");
    assert.equal(coverage.head, git(repo, "rev-parse", "HEAD"), "head must be the temp repo's HEAD");

    assert.deepEqual(
      coverage.files.map((f: { path: string }) => f.path),
      ["config/defaults.toml", "src/dispatch/queue.rs", "src/lock.rs", "src/server/deadline.rs"],
      "files ordered by path",
    );
    const defaults = coverage.files.find((f: { path: string }) => f.path === "config/defaults.toml");
    assert.deepEqual(defaults.spans, [
      {
        conceptId: "decisions/47s-request-deadline",
        type: "decision",
        glyph: "●",
        status: "active",
        confidence: "corroborated",
        lines: { start: 22, end: 24 },
      },
      {
        conceptId: "questions/why-retry-jitter-disabled",
        type: "question",
        glyph: "?",
        status: "open",
        lines: { start: 31, end: 31 },
      },
    ]);
    const lock = coverage.files.find((f: { path: string }) => f.path === "src/lock.rs");
    assert.equal(lock.spans[0].conceptId, "incidents/2024-03-lock-stall");
    assert.equal(lock.spans[0].lines, undefined, "whole-file claims come first, without lines");
    assert.deepEqual(lock.spans[1].lines, { start: 41, end: 58 });
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("coverage: lost anchors never paint spans — a last-known location is not a live claim", async () => {
  const repo = await makeRepo("why-ui-lost-");
  try {
    await write(repo, "src/gone.ts", "x\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "init");
    await write(
      repo,
      ".why/decisions/gone.md",
      [
        "---",
        "type: decision",
        "title: Gone",
        "description: This anchor was lost.",
        "why:",
        "  status: active",
        "  confidence: recorded",
        "  anchors:",
        "    - path: src/gone.ts",
        "      lines: 1-5",
        "      state: lost",
        "---",
        "",
        "# Gone",
        "",
        "# Why",
        "",
        "Body.",
      ].join("\n"),
    );
    const coverage = await runJson(["export", "ui-index"], repo);
    assertValid(validateCoverage, coverage, "ui-index with only a lost anchor");
    assert.deepEqual(coverage.files, [], "a lost anchor must not appear in coverage");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("coverage: ui-index outside a git repo is an operational error, never an unstamped payload", async () => {
  const bundle = await makeBundle({});
  try {
    const { io, err } = capture();
    const code = await main(["export", "ui-index", "--bundle", bundle], bundle, io);
    assert.equal(code, 1);
    assert.ok(err.join("\n").includes("staleness"), err.join("\n"));
  } finally {
    await rm(bundle, { recursive: true, force: true });
  }
});

test("coverage: hand-mutated payloads fail validation", async () => {
  const repo = await makeRepo("why-ui-mut-");
  try {
    await write(repo, "a.txt", "x\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "init");
    await cp(HARBOR, join(repo, ".why"), { recursive: true });
    const pristine = await runJson(["export", "ui-index"], repo);
    const mutate = (change: (c: any) => void): boolean => {
      const copy = JSON.parse(JSON.stringify(pristine));
      change(copy);
      return validateCoverage(copy) as boolean;
    };
    assert.equal(mutate(() => {}), true, "the unmutated payload must validate");
    assert.equal(mutate((c) => delete c.head), false, "missing head");
    assert.equal(mutate((c) => (c.head = "HEAD")), false, "head must be a full sha");
    assert.equal(mutate((c) => (c.files[0].spans[0].glyph = "x")), false, "off-vocabulary glyph");
    assert.equal(mutate((c) => (c.files[0].spans = [])), false, "a file entry with no spans");
    assert.equal(mutate((c) => (c.files[0].spans[0].stale = true)), false, "unknown key on a span");
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

// --- graph ---------------------------------------------------------------------

test("graph: harbor exports all six nodes and the §3 typed edges, schema-valid", async () => {
  const graph = await runJson(["export", "graph", "--bundle", HARBOR]);
  assertValid(validateGraph, graph, "graph");
  assert.equal(graph.nodes.length, 6);
  assert.deepEqual(
    graph.nodes.map((n: { id: string }) => n.id),
    [...graph.nodes.map((n: { id: string }) => n.id)].sort(),
    "nodes ordered by id",
  );
  const edges = graph.edges.map((e: any) => `${e.from} ${e.relation} ${e.to}`);
  assert.deepEqual(edges, [
    "attempts/striped-rwlock ledTo incidents/2024-03-lock-stall",
    "constraints/acme-45s-timeout ledTo decisions/47s-request-deadline",
    "decisions/47s-request-deadline becauseOf constraints/acme-45s-timeout",
    "decisions/queue-based-locking becauseOf attempts/striped-rwlock",
    "decisions/queue-based-locking becauseOf incidents/2024-03-lock-stall",
    "decisions/queue-based-locking insteadOf attempts/striped-rwlock",
    "incidents/2024-03-lock-stall ledTo decisions/queue-based-locking",
  ]);
});

test("graph: hand-mutated payloads fail validation", async () => {
  const pristine = await runJson(["export", "graph", "--bundle", HARBOR]);
  const mutate = (change: (g: any) => void): boolean => {
    const copy = JSON.parse(JSON.stringify(pristine));
    change(copy);
    return validateGraph(copy) as boolean;
  };
  assert.equal(mutate(() => {}), true, "the unmutated payload must validate");
  assert.equal(mutate((g) => (g.edges[0].relation = "leadsTo")), false, "off-vocabulary relation");
  assert.equal(mutate((g) => delete g.nodes[0].title), false, "missing node title");
  assert.equal(mutate((g) => (g.nodes[0].type = "note")), false, "off-vocabulary type");
});

// --- CLI surface -----------------------------------------------------------------

test("export usage: a missing or unknown target is a usage error", async () => {
  for (const args of [["export"], ["export", "nonsense"], ["export", "ui-index", "graph"]]) {
    const { io, err } = capture();
    const code = await main([...args, "--bundle", HARBOR], root, io);
    assert.equal(code, 2, `why ${args.join(" ")} should be a usage error`);
    assert.ok(err.join("\n").includes("ui-index|graph"), err.join("\n"));
  }
});

test("export --out writes the payload to a file", async () => {
  const dir = await makeBundle({});
  try {
    const outFile = join(dir, "graph.json");
    const { io, out } = capture();
    const code = await main(["export", "graph", "--bundle", HARBOR, "--out", outFile], root, io);
    assert.equal(code, 0);
    assert.ok(out.join("\n").includes(outFile), out.join("\n"));
    const graph = JSON.parse(await readFile(outFile, "utf8"));
    assertValid(validateGraph, graph, "graph via --out");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- docs/ui-contract.md ----------------------------------------------------------

test("docs/ui-contract.md: exists, examples validate against their schemas, policy stated", () => {
  const doc = readFileSync(join(root, "docs/ui-contract.md"), "utf8");
  const examples = [...doc.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]!));
  assert.equal(examples.length, 3, "the doc must example all three schemas: story, coverage, graph");
  assertValid(validateStory, examples[0], "doc story example");
  assertValid(validateCoverage, examples[1], "doc coverage example");
  assertValid(validateGraph, examples[2], "doc graph example");
  for (const needle of [
    "schemaVersion",
    "Additive changes are minor",
    "Breaking changes are major",
    "renderedRationale",
    "●",
    "⚠",
    "?",
    "schemas/story.schema.json",
    "schemas/coverage.schema.json",
    "schemas/graph.schema.json",
  ]) {
    assert.ok(doc.includes(needle), `docs/ui-contract.md: missing "${needle}"`);
  }
});
