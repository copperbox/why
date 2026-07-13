// Hover markdown + staleness-note logic (issue 503 acceptance): the hedge
// prefix arrives pre-baked in renderedRationale and must survive verbatim,
// and an expired-upstream warning renders FIRST, ahead of the hits.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStory, type Story, type StoryHit } from "../src/core/contract.ts";
import { glyphFor, hoverMarkdown, stalenessNote } from "../src/core/hover.ts";

const here = __dirname;
const story = parseStory(readFileSync(join(here, "fixtures", "story.json"), "utf8"));

const HEAD = "8b7d3f0c2f4f4b0d9a1e6c5b4a3928170f6e5d4c";

test("staleness: same HEAD → no note; a moved or unresolvable HEAD → muted as-of note", () => {
  assert.equal(stalenessNote(HEAD, HEAD), undefined);
  assert.equal(stalenessNote(HEAD, "0000000000000000000000000000000000000000"), "as of 8b7d3f0");
  // Unverifiable is never fresh: no resolvable current HEAD still notes the sha.
  assert.equal(stalenessNote(HEAD, undefined), "as of 8b7d3f0");
});

test("the expired-upstream warning renders before the hit, blast radius included", () => {
  const md = hoverMarkdown(story)!;
  const warning = md.indexOf("Acme 45s gateway timeout");
  const hit = md.indexOf("Queue-based locking");
  assert.ok(warning >= 0 && hit >= 0, md);
  assert.ok(warning < hit, "expired-upstream warning must come first");
  assert.ok(md.includes("EXPIRED 2025-06-30"), md);
  assert.ok(md.includes('downstream decision "47s request deadline" may now be scar tissue'), md);
  assert.ok(md.indexOf("⚠") < md.indexOf("●"), "status glyphs lead their cards");
});

test("cards carry glyph, title, confidence badge, verbatim rationale, citation links", () => {
  const md = hoverMarkdown(story)!;
  assert.ok(md.includes("`recorded`"), "confidence badge");
  assert.ok(
    md.includes("Serialize all shard mutations through a single ordered command queue instead of striped RwLocks."),
    "renderedRationale verbatim",
  );
  assert.ok(md.includes("](https://github.com/acme/harbor/pull/212)"), "citation link");
  assert.ok(md.includes("](https://github.com/acme/harbor/issues/612)"), "warning citation link");
});

test("a hedged hit's mandatory hedge prefix survives verbatim — never re-derived", () => {
  const hedged: Story = {
    target: { path: "src/cache.rs", lines: { start: 3, end: 3 } },
    hits: [
      {
        id: "decisions/cache-shard-sizing",
        title: "Cache sized to one shard",
        type: "decision",
        status: "active",
        confidence: "inferred",
        description: "The cache is sized to fit one shard.",
        hedged: true,
        renderedRationale: "likely — The cache is sized to fit one shard.",
        anchors: [],
        edges: { becauseOf: [], insteadOf: [], supersededBy: [] },
        citations: [],
        evidence: [],
        downstream: [],
      },
    ],
    warnings: [],
    nearby: [],
  };
  const md = hoverMarkdown(hedged)!;
  assert.ok(md.includes("likely — The cache is sized to fit one shard."), md);
});

test("the staleness note lands muted at the end when supplied", () => {
  const fresh = hoverMarkdown(story)!;
  assert.ok(!fresh.includes("as of"), "no note when none supplied");
  const stale = hoverMarkdown(story, { staleNote: stalenessNote(HEAD, undefined) })!;
  assert.ok(stale.endsWith("*as of 8b7d3f0*"), stale.slice(-60));
});

test("questions render the ? glyph and no confidence badge", () => {
  const question: StoryHit = {
    id: "questions/why-retry-jitter-disabled",
    title: "Why is retry jitter disabled?",
    type: "question",
    status: "open",
    description: "",
    hedged: false,
    renderedRationale: "",
    anchors: [],
    edges: { becauseOf: [], insteadOf: [], supersededBy: [] },
    citations: [],
    evidence: [],
    downstream: [],
  };
  assert.equal(glyphFor("question", "open"), "?");
  const md = hoverMarkdown({ target: { path: "config/defaults.toml" }, hits: [question], warnings: [], nearby: [] })!;
  assert.ok(md.startsWith("? **Why is retry jitter disabled?"), md);
  assert.ok(!md.includes("`recorded`") && !md.includes("`inferred`"), "no confidence badge on a question");
});

test("an empty story yields no hover at all", () => {
  assert.equal(
    hoverMarkdown({ target: { path: "a.rs" }, hits: [], warnings: [], nearby: [] }),
    undefined,
  );
});
