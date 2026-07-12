import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildAnchorIndex,
  loadAnchorIndex,
  lookupAnchors,
  parseLineRange,
  resolveHead,
  type AnchorHit,
} from "../src/anchors.ts";
import { loadBundle, type WhyBundle } from "../src/bundle.ts";
import { makeBundle } from "./helpers.ts";

const HEAD = "a3f9c2e0000000000000000000000000deadbeef";

function concept(fields: { type: string; title: string; anchors: string[] }): string {
  return [
    "---",
    `type: ${fields.type}`,
    `title: ${fields.title}`,
    `description: ${fields.title}.`,
    "why:",
    "  status: active",
    "  anchors:",
    ...fields.anchors.map((line) => `  ${line}`),
    "---",
    "",
    `# ${fields.title}`,
    "",
    "# Why",
    "",
    "Body.",
  ].join("\n");
}

/** A bundle with every span shape on one path: two ranges, whole-file, lost. */
async function overlapBundle(): Promise<{ root: string; bundle: WhyBundle }> {
  const root = await makeBundle({
    "decisions/low.md": concept({
      type: "decision",
      title: "Low",
      anchors: ["  - path: src/x.ts", "    lines: 1-10", `    as_of: ${HEAD.slice(0, 7)}`],
    }),
    "decisions/high.md": concept({
      type: "decision",
      title: "High",
      anchors: ["  - path: src/x.ts", "    lines: 20-30", "    as_of: beefbeef"],
    }),
    "incidents/whole.md": concept({
      type: "incident",
      title: "Whole",
      anchors: ["  - path: src/x.ts"],
    }),
    "decisions/gone.md": concept({
      type: "decision",
      title: "Gone",
      anchors: ["  - path: src/x.ts", "    lines: 5-8", "    state: lost"],
    }),
  });
  return { root, bundle: await loadBundle(root) };
}

function ids(hits: AnchorHit[]): string[] {
  return hits.map((h) => h.conceptId).sort();
}

test("parseLineRange reads single lines and ranges, rejects garbage", () => {
  assert.deepEqual(parseLineRange("41-58"), { start: 41, end: 58 });
  assert.deepEqual(parseLineRange("31"), { start: 31, end: 31 });
  assert.equal(parseLineRange("58-41"), undefined);
  assert.equal(parseLineRange("acquire_shared"), undefined);
  assert.equal(parseLineRange("0"), undefined);
});

test("point query inside a range hits that range plus whole-file anchors", async () => {
  const { root, bundle } = await overlapBundle();
  try {
    const index = buildAnchorIndex(bundle, HEAD);
    const hits = lookupAnchors(index, { path: "src/x.ts", lines: { start: 5, end: 5 } });
    assert.deepEqual(ids(hits), ["decisions/low", "incidents/whole"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("range query straddling two anchors hits both", async () => {
  const { root, bundle } = await overlapBundle();
  try {
    const index = buildAnchorIndex(bundle, HEAD);
    const hits = lookupAnchors(index, { path: "src/x.ts", lines: { start: 5, end: 25 } });
    assert.deepEqual(ids(hits), ["decisions/high", "decisions/low", "incidents/whole"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a whole-file query names every live anchor on the path; other paths miss", async () => {
  const { root, bundle } = await overlapBundle();
  try {
    const index = buildAnchorIndex(bundle, HEAD);
    const wholeFile = lookupAnchors(index, { path: "src/x.ts" });
    assert.deepEqual(ids(wholeFile), ["decisions/high", "decisions/low", "incidents/whole"]);
    assert.deepEqual(lookupAnchors(index, { path: "src/y.ts" }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lost anchors are excluded from normal lookup but retrievable via includeLost", async () => {
  const { root, bundle } = await overlapBundle();
  try {
    const index = buildAnchorIndex(bundle, HEAD);
    const query = { path: "src/x.ts", lines: { start: 6, end: 6 } };
    assert.ok(!ids(lookupAnchors(index, query)).includes("decisions/gone"));
    const withLost = lookupAnchors(index, query, { includeLost: true });
    const gone = withLost.find((h) => h.conceptId === "decisions/gone");
    assert.ok(gone, "lost anchor covering the span must surface under includeLost");
    assert.equal(gone.anchor.state, "lost");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("staleness: a hit is fresh only when as_of names the HEAD the index saw", async () => {
  const { root, bundle } = await overlapBundle();
  try {
    const index = buildAnchorIndex(bundle, HEAD);
    const hits = lookupAnchors(index, { path: "src/x.ts", lines: { start: 1, end: 30 } });
    const byId = new Map(hits.map((h) => [h.conceptId, h]));
    assert.equal(byId.get("decisions/low")!.stale, false, "abbreviated as_of prefix of HEAD is fresh");
    assert.equal(byId.get("decisions/high")!.stale, true, "as_of naming another commit is stale");
    assert.equal(byId.get("incidents/whole")!.stale, true, "missing as_of can never be confirmed fresh");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("without a known HEAD every hit is stale — unverifiable is never fresh", async () => {
  const { root, bundle } = await overlapBundle();
  try {
    const index = buildAnchorIndex(bundle);
    const hits = lookupAnchors(index, { path: "src/x.ts" });
    assert.ok(hits.length > 0);
    assert.ok(hits.every((h) => h.stale));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an unparseable lines value matches whole-file queries only, as in Phase 1", async () => {
  const root = await makeBundle({
    "decisions/odd.md": concept({
      type: "decision",
      title: "Odd",
      anchors: ["  - path: src/odd.ts", "    lines: not-a-range"],
    }),
  });
  try {
    const index = buildAnchorIndex(await loadBundle(root), HEAD);
    assert.deepEqual(ids(lookupAnchors(index, { path: "src/odd.ts" })), ["decisions/odd"]);
    assert.deepEqual(lookupAnchors(index, { path: "src/odd.ts", lines: { start: 1, end: 999 } }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("harbor: the index reproduces the Phase 1 matches for src/lock.rs:47", async () => {
  const bundle = await loadBundle("examples/harbor");
  const index = buildAnchorIndex(bundle, resolveHead("examples/harbor"));
  const hits = lookupAnchors(index, { path: "src/lock.rs", lines: { start: 47, end: 47 } });
  assert.deepEqual(ids(hits), ["decisions/queue-based-locking", "incidents/2024-03-lock-stall"]);
});

test("cache: reused while nothing changes, rebuilt when a concept file mutates", async () => {
  const { root, bundle } = await overlapBundle();
  try {
    const first = await loadAnchorIndex(bundle, { head: HEAD });
    assert.equal(first.source, "built");
    const second = await loadAnchorIndex(bundle, { head: HEAD });
    assert.equal(second.source, "cache", "unchanged bundle + HEAD must reuse the cache");
    assert.deepEqual(
      lookupAnchors(second.index, { path: "src/x.ts", lines: { start: 5, end: 5 } }),
      lookupAnchors(first.index, { path: "src/x.ts", lines: { start: 5, end: 5 } }),
    );

    const path = join(root, "decisions", "low.md");
    await writeFile(path, (await readFile(path, "utf8")).replace("lines: 1-10", "lines: 2-11"));
    const mutated = await loadAnchorIndex(await loadBundle(root), { head: HEAD });
    assert.equal(mutated.source, "built", "a mutated concept file must invalidate the cache");
    const atLineOne = ids(lookupAnchors(mutated.index, { path: "src/x.ts", lines: { start: 1, end: 1 } }));
    assert.ok(!atLineOne.includes("decisions/low"), "the rebuilt index must reflect the edited span");
    assert.deepEqual(atLineOne, ["incidents/whole"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cache: a moved HEAD invalidates even with identical bundle content", async () => {
  const { root, bundle } = await overlapBundle();
  try {
    assert.equal((await loadAnchorIndex(bundle, { head: HEAD })).source, "built");
    const moved = await loadAnchorIndex(bundle, { head: "f".repeat(40) });
    assert.equal(moved.source, "built");
    const hits = lookupAnchors(moved.index, { path: "src/x.ts", lines: { start: 5, end: 5 } });
    assert.ok(hits.every((h) => h.stale), "no as_of names the moved HEAD");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cache: a corrupt cache file is rebuilt, never trusted", async () => {
  const { root, bundle } = await overlapBundle();
  try {
    await loadAnchorIndex(bundle, { head: HEAD });
    await writeFile(join(root, ".cache", "anchor-index.json"), "{ not json");
    const reloaded = await loadAnchorIndex(bundle, { head: HEAD });
    assert.equal(reloaded.source, "built");
    assert.ok(
      lookupAnchors(reloaded.index, { path: "src/x.ts", lines: { start: 5, end: 5 } }).length > 0,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the cache directory ignores itself so bundles never commit derived state", async () => {
  const { root, bundle } = await overlapBundle();
  try {
    await loadAnchorIndex(bundle, { head: HEAD });
    assert.equal(await readFile(join(root, ".cache", ".gitignore"), "utf8"), "*\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
