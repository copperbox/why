// Contract parsing (issue 503): the fixture payloads are copies of the
// validated examples in the root repo's docs/ui-contract.md. When that doc is
// reachable (i.e. these tests run inside the why repo), its examples are also
// parsed directly so a contract change cannot silently strand the fixtures.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ContractError, parseCoverage, parseStory } from "../src/core/contract.ts";

const here = __dirname;
const fixture = (name: string) => readFileSync(join(here, "fixtures", name), "utf8");

test("coverage fixture parses: head + per-file spans, whole-file spans line-less", () => {
  const coverage = parseCoverage(fixture("coverage.json"));
  assert.equal(coverage.head, "8b7d3f0c2f4f4b0d9a1e6c5b4a3928170f6e5d4c");
  assert.deepEqual(
    coverage.files.map((f) => f.path),
    ["config/defaults.toml", "src/lock.rs"],
  );
  const lock = coverage.files[1]!;
  assert.equal(lock.spans[0]!.conceptId, "incidents/2024-03-lock-stall");
  assert.equal(lock.spans[0]!.lines, undefined, "a whole-file claim has no lines");
  assert.deepEqual(lock.spans[1]!.lines, { start: 41, end: 58 });
  assert.equal(lock.spans[1]!.glyph, "●");
  assert.equal(lock.spans[1]!.confidence, "recorded");
});

test("story fixture parses: hits, the expired warning with its blast radius, citations", () => {
  const story = parseStory(fixture("story.json"));
  assert.equal(story.target.path, "src/lock.rs");
  assert.deepEqual(story.target.lines, { start: 47, end: 47 });
  assert.equal(story.span, "src/lock.rs:41-58 · acquire_shared");
  assert.equal(story.hits[0]!.id, "decisions/queue-based-locking");
  assert.equal(story.hits[0]!.hedged, false);
  assert.equal(story.hits[0]!.edges.becauseOf[0]!.title, "2024-03 lock stall");
  const acme = story.warnings[0]!;
  assert.equal(acme.id, "constraints/acme-45s-timeout");
  assert.equal(acme.expired_on, "2025-06-30");
  assert.equal(acme.downstream[0]!.id, "decisions/47s-request-deadline");
  assert.equal(acme.citations[0]!.url, "https://github.com/acme/harbor/issues/612");
});

test("the fixtures have not drifted from docs/ui-contract.md's examples", (t) => {
  const doc = join(here, "..", "..", "docs", "ui-contract.md");
  if (!existsSync(doc)) {
    t.skip("running outside the why repo — the root ui-contract tests own the doc");
    return;
  }
  const blocks = [...readFileSync(doc, "utf8").matchAll(/```json\n([\s\S]*?)```/g)].map((m) =>
    JSON.parse(m[1]!),
  );
  const docStory = blocks.find((b) => Array.isArray(b.hits));
  const docCoverage = blocks.find((b) => Array.isArray(b.files) && b.files[0]?.spans !== undefined);
  assert.ok(docStory && docCoverage, "ui-contract.md no longer carries story/coverage examples");
  assert.deepEqual(JSON.parse(fixture("story.json")), docStory, "fixtures/story.json drifted from the doc");
  assert.deepEqual(JSON.parse(fixture("coverage.json")), docCoverage, "fixtures/coverage.json drifted from the doc");
  // And the doc's examples parse through the same code path the extension uses.
  parseStory(JSON.stringify(docStory));
  parseCoverage(JSON.stringify(docCoverage));
});

test("a schemaVersion above 1 is said out loud, never guessed at", () => {
  const newer = JSON.stringify({ ...JSON.parse(fixture("coverage.json")), schemaVersion: 2 });
  assert.throws(() => parseCoverage(newer), (e: unknown) => {
    assert.ok(e instanceof ContractError);
    assert.match(e.message, /schemaVersion 2 is newer.*update the extension/);
    return true;
  });
  const newerStory = JSON.stringify({ ...JSON.parse(fixture("story.json")), schemaVersion: 3 });
  assert.throws(() => parseStory(newerStory), ContractError);
});

test("malformed payloads are ContractErrors, not silently-wrong renders", () => {
  assert.throws(() => parseCoverage("not json"), ContractError);
  assert.throws(() => parseCoverage(JSON.stringify({ files: [] })), ContractError, "missing schemaVersion");
  assert.throws(
    () => parseCoverage(JSON.stringify({ schemaVersion: 1, files: [] })),
    ContractError,
    "missing head",
  );
  assert.throws(
    () =>
      parseCoverage(
        JSON.stringify({
          schemaVersion: 1,
          head: "8b7d3f0c2f4f4b0d9a1e6c5b4a3928170f6e5d4c",
          files: [{ path: "a.rs", spans: [{ conceptId: "x" }] }],
        }),
      ),
    ContractError,
    "span without type/glyph",
  );
  assert.throws(
    () => parseStory(JSON.stringify({ schemaVersion: 1, target: { path: "a.rs" }, hits: [{}], warnings: [], nearby: [] })),
    ContractError,
    "hit missing required fields",
  );
});
