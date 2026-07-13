// Decoration-set computation from coverage fixtures (issue 503): per-line
// treatment mirrors the serve SPA's gutter, colors are theme tokens only,
// and no mark may extend past the open document.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCoverage, type CoverageSpan } from "../src/core/contract.ts";
import {
  ALL_TOKENS,
  coveringSpans,
  decorationRanges,
  TREATMENT_TOKENS,
} from "../src/core/decorations.ts";

const here = __dirname;
const coverage = parseCoverage(readFileSync(join(here, "fixtures", "coverage.json"), "utf8"));
const spansOf = (path: string) => coverage.files.find((f) => f.path === path)!.spans;

test("theme tokens only — the vocabulary carries no hardcoded colors", () => {
  for (const token of ALL_TOKENS) {
    assert.match(token, /^[a-zA-Z.]+$/, `${token} must be a theme color token, not a color value`);
    assert.ok(!token.startsWith("#"), token);
  }
});

test("defaults.toml: the decision span colors corroborated, the question line stands apart", () => {
  const ranges = decorationRanges(spansOf("config/defaults.toml"), 40);
  assert.deepEqual(ranges.get(TREATMENT_TOKENS.corroborated), [{ start: 22, end: 24 }]);
  assert.deepEqual(ranges.get(TREATMENT_TOKENS.question), [{ start: 31, end: 31 }]);
  assert.equal(ranges.get(TREATMENT_TOKENS.expired), undefined);
});

test("lock.rs: the whole-file incident covers every line; 41-58 overlaps it", () => {
  const ranges = decorationRanges(spansOf("src/lock.rs"), 80);
  // The whole-file incident (recorded) is first everywhere, so the whole
  // file paints recorded — one contiguous range, mirroring the SPA where the
  // first covering span's confidence wins.
  assert.deepEqual(ranges.get(TREATMENT_TOKENS.recorded), [{ start: 1, end: 80 }]);
  assert.equal(coveringSpans(spansOf("src/lock.rs"), 47).length, 2, "line 47 is covered by both spans");
  assert.equal(coveringSpans(spansOf("src/lock.rs"), 5).length, 1, "line 5 only by the whole-file claim");
});

test("an expired constraint span outranks confidence coloring on its lines", () => {
  const spans: CoverageSpan[] = [
    { conceptId: "d", type: "decision", glyph: "●", status: "active", confidence: "recorded", lines: { start: 1, end: 10 } },
    { conceptId: "c", type: "constraint", glyph: "⚠", status: "expired", lines: { start: 4, end: 6 } },
  ];
  const ranges = decorationRanges(spans, 10);
  assert.deepEqual(ranges.get(TREATMENT_TOKENS.expired), [{ start: 4, end: 6 }]);
  assert.deepEqual(ranges.get(TREATMENT_TOKENS.recorded), [
    { start: 1, end: 3 },
    { start: 7, end: 10 },
  ]);
});

test("spans past the end of a shorter buffer are clipped, never painted wrong", () => {
  const spans: CoverageSpan[] = [
    { conceptId: "d", type: "decision", glyph: "●", confidence: "inferred", lines: { start: 8, end: 20 } },
  ];
  const ranges = decorationRanges(spans, 10);
  assert.deepEqual(ranges.get(TREATMENT_TOKENS.inferred), [{ start: 8, end: 10 }]);
});

test("a span with no confidence falls back to the muted token", () => {
  const spans: CoverageSpan[] = [
    { conceptId: "q", type: "attempt", glyph: "●", status: "failed", lines: { start: 2, end: 3 } },
  ];
  const ranges = decorationRanges(spans, 5);
  assert.deepEqual(ranges.get(TREATMENT_TOKENS.none), [{ start: 2, end: 3 }]);
});

test("no covering spans → no ranges at all", () => {
  assert.equal(decorationRanges([], 100).size, 0);
});
