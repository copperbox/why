import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { traceRange } from "../src/trace-range.ts";

// Every test builds a throwaway repo in a temp dir — nothing here depends on
// this repository's own history (issue 202 acceptance criterion).

function git(repo: string, ...args: string[]): string {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  }
  return r.stdout;
}

function makeRepo(t: { after(fn: () => void): void }): string {
  const repo = mkdtempSync(join(tmpdir(), "why-trace-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "test@example.invalid");
  git(repo, "config", "user.name", "trace-test");
  return repo;
}

function write(repo: string, rel: string, lines: string[]): void {
  const abs = join(repo, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, lines.join("\n") + "\n");
}

function commit(repo: string, msg: string): string {
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", msg);
  return git(repo, "rev-parse", "HEAD").trim();
}

function seq(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);
}

// Ten context lines, a five-line "function" at lines 11-15, five more below.
const FN_START = 11;
const FN_END = 15;
function baseFile(): string[] {
  return [...seq("top", 10), ...seq("fn", 5), ...seq("bottom", 5)];
}

const ANCHOR_LINES = { start: FN_START, end: FN_END };

test("as_of at HEAD: range returned unchanged", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  const asOf = commit(repo, "c1");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, { lost: false, path: "src/a.txt", lines: ANCHOR_LINES });
});

test("edits to other files leave the range untouched", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  const asOf = commit(repo, "c1");
  write(repo, "src/b.txt", seq("other", 3));
  commit(repo, "c2 touch other file");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, { lost: false, path: "src/a.txt", lines: ANCHOR_LINES });
});

test("edits below the range leave it untouched", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  const asOf = commit(repo, "c1");
  write(repo, "src/a.txt", [...baseFile(), ...seq("appended", 4)]);
  commit(repo, "c2 append below");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, { lost: false, path: "src/a.txt", lines: ANCHOR_LINES });
});

test("shift: 10 lines inserted above move the range down 10, same content", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  const asOf = commit(repo, "c1");
  write(repo, "src/a.txt", [...seq("inserted", 10), ...baseFile()]);
  commit(repo, "c2 insert 10 above");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, {
    lost: false,
    path: "src/a.txt",
    lines: { start: FN_START + 10, end: FN_END + 10 },
  });
  // The traced lines must hold the same content the anchor claimed at as_of.
  const head = git(repo, "show", "HEAD:src/a.txt").split("\n");
  assert.deepEqual(head.slice(FN_START + 10 - 1, FN_END + 10), seq("fn", 5));
});

test("deletion above shifts the range up", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  const asOf = commit(repo, "c1");
  write(repo, "src/a.txt", [...seq("top", 10).slice(3), ...seq("fn", 5), ...seq("bottom", 5)]);
  commit(repo, "c2 delete 3 above");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, {
    lost: false,
    path: "src/a.txt",
    lines: { start: FN_START - 3, end: FN_END - 3 },
  });
});

test("rename: git mv plus an edit elsewhere updates the path, lines stable", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  const asOf = commit(repo, "c1");
  git(repo, "mv", "src/a.txt", "src/renamed.txt");
  commit(repo, "c2 rename");
  write(repo, "src/b.txt", seq("other", 3));
  commit(repo, "c3 edit elsewhere");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, { lost: false, path: "src/renamed.txt", lines: ANCHOR_LINES });
});

test("rename and insert-above in the same commit: path and shift both applied", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  const asOf = commit(repo, "c1");
  rmSync(join(repo, "src/a.txt"));
  write(repo, "src/moved.txt", [...seq("inserted", 4), ...baseFile()]);
  commit(repo, "c2 move and edit");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, {
    lost: false,
    path: "src/moved.txt",
    lines: { start: FN_START + 4, end: FN_END + 4 },
  });
});

test("partial edit: tail of the range deleted shrinks to the surviving head", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  const asOf = commit(repo, "c1");
  // Kill the last two fn lines (14-15); fn 1..3 survive at 11-13.
  write(repo, "src/a.txt", [...seq("top", 10), ...seq("fn", 3), ...seq("bottom", 5)]);
  commit(repo, "c2 trim tail of range");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, {
    lost: false,
    path: "src/a.txt",
    lines: { start: FN_START, end: FN_START + 2 },
  });
});

test("partial edit: interior replacement keeps the bounding span of survivors", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  const asOf = commit(repo, "c1");
  // Replace fn 2..4 (lines 12-14) with two new lines; fn 1 and fn 5 survive.
  write(repo, "src/a.txt", [
    ...seq("top", 10),
    "fn 1",
    "changed x",
    "changed y",
    "fn 5",
    ...seq("bottom", 5),
  ]);
  commit(repo, "c2 rewrite interior");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  // Policy (documented in trace-range.ts): the result is the bounding span of
  // lines that verifiably survived — fn 1 at 11 and fn 5 at 14.
  assert.deepEqual(res, { lost: false, path: "src/a.txt", lines: { start: 11, end: 14 } });
});

test("rewrite: replacing the range wholesale reports content-rewritten, never a wrong range", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  const asOf = commit(repo, "c1");
  write(repo, "src/a.txt", [...seq("top", 10), ...seq("totally new", 7), ...seq("bottom", 5)]);
  commit(repo, "c2 rewrite the function");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, { lost: true, reason: "content-rewritten" });
});

test("file deleted reports lost: file-deleted", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  const asOf = commit(repo, "c1");
  git(repo, "rm", "-q", "src/a.txt");
  commit(repo, "c2 delete file");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, { lost: true, reason: "file-deleted" });
});

test("multi-commit history: insert above, then rename, then edit below", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  const asOf = commit(repo, "c1");
  write(repo, "src/a.txt", [...seq("inserted", 6), ...baseFile()]);
  commit(repo, "c2 insert above");
  mkdirSync(join(repo, "lib"));
  git(repo, "mv", "src/a.txt", "lib/z.txt");
  commit(repo, "c3 rename");
  write(repo, "lib/z.txt", [...seq("inserted", 6), ...baseFile(), ...seq("tail", 2)]);
  commit(repo, "c4 append below");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, {
    lost: false,
    path: "lib/z.txt",
    lines: { start: FN_START + 6, end: FN_END + 6 },
  });
});

test("file deleted then re-added stays lost: file-deleted (resurrection is not traced)", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  const asOf = commit(repo, "c1");
  git(repo, "rm", "-q", "src/a.txt");
  commit(repo, "c2 delete");
  write(repo, "src/a.txt", baseFile());
  commit(repo, "c3 re-add identical content");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, { lost: true, reason: "file-deleted" });
});

test("as_of on mainline: feature-side changes arrive via the merge step", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  const asOf = commit(repo, "c1");
  git(repo, "checkout", "-q", "-b", "feature");
  write(repo, "src/a.txt", [...seq("feature", 5), ...baseFile()]);
  commit(repo, "feature: insert 5 above");
  git(repo, "checkout", "-q", "main");
  write(repo, "src/other.txt", ["main work"]);
  commit(repo, "main: unrelated");
  git(repo, "merge", "-q", "--no-ff", "-m", "merge feature", "feature");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, {
    lost: false,
    path: "src/a.txt",
    lines: { start: FN_START + 5, end: FN_END + 5 },
  });
});

test("as_of on a merged feature branch (second parent): live lines stay live", (t) => {
  // Regression: a first-parent walk of asOf..HEAD diffs the feature commit
  // against an unrelated main commit and misreads branch divergence as a
  // rewrite. This is the standard topology for dig-produced anchors.
  const repo = makeRepo(t);
  write(repo, "src/a.txt", seq("top", 10));
  commit(repo, "base");
  git(repo, "checkout", "-q", "-b", "feature");
  write(repo, "src/a.txt", [...seq("top", 10), ...seq("fn", 5)]);
  const asOf = commit(repo, "feature: append fn 1..5");
  git(repo, "checkout", "-q", "main");
  write(repo, "src/other.txt", ["main work"]);
  commit(repo, "main: unrelated");
  git(repo, "merge", "-q", "--no-ff", "-m", "merge feature", "feature");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, { lost: false, path: "src/a.txt", lines: ANCHOR_LINES });
});

test("file created on a merged feature branch is live, not file-deleted", (t) => {
  // Regression: the same broken first-parent step made a file that no commit
  // ever deleted report lost: file-deleted.
  const repo = makeRepo(t);
  write(repo, "src/other.txt", ["base"]);
  commit(repo, "base");
  git(repo, "checkout", "-q", "-b", "feature");
  write(repo, "src/new.txt", baseFile());
  const asOf = commit(repo, "feature: add new file");
  git(repo, "checkout", "-q", "main");
  write(repo, "src/other.txt", ["base", "main work"]);
  commit(repo, "main: unrelated");
  git(repo, "merge", "-q", "--no-ff", "-m", "merge feature", "feature");
  const res = traceRange(repo, { path: "src/new.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, { lost: false, path: "src/new.txt", lines: ANCHOR_LINES });
});

test("as_of on a feature branch: main-side edits above arrive via the merge step", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  commit(repo, "base");
  git(repo, "checkout", "-q", "-b", "feature");
  write(repo, "src/b.txt", ["feature work"]);
  const asOf = commit(repo, "feature: unrelated file");
  git(repo, "checkout", "-q", "main");
  write(repo, "src/a.txt", [...seq("main-inserted", 3), ...baseFile()]);
  commit(repo, "main: insert 3 above the range");
  git(repo, "merge", "-q", "--no-ff", "-m", "merge feature", "feature");
  const res = traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf });
  assert.deepEqual(res, {
    lost: false,
    path: "src/a.txt",
    lines: { start: FN_START + 3, end: FN_END + 3 },
  });
});

test("as_of several commits deep on a feature branch merged after main advances", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  commit(repo, "base");
  git(repo, "checkout", "-q", "-b", "feature");
  write(repo, "src/a.txt", [...seq("feat-top", 2), ...baseFile()]);
  const asOf = commit(repo, "feature: insert 2 above");
  write(repo, "src/a.txt", [...seq("more", 3), ...seq("feat-top", 2), ...baseFile()]);
  commit(repo, "feature: insert 3 more above");
  git(repo, "checkout", "-q", "main");
  write(repo, "src/other.txt", ["main work"]);
  commit(repo, "main: unrelated");
  git(repo, "merge", "-q", "--no-ff", "-m", "merge feature", "feature");
  // At asOf the fn range sits at 13-17 (two lines inserted above); the later
  // feature commit shifts it three further down, the merge not at all.
  const res = traceRange(repo, {
    path: "src/a.txt",
    lines: { start: FN_START + 2, end: FN_END + 2 },
    asOf,
  });
  assert.deepEqual(res, {
    lost: false,
    path: "src/a.txt",
    lines: { start: FN_START + 5, end: FN_END + 5 },
  });
});

test("throws on an as_of that does not resolve to a commit", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  commit(repo, "c1");
  assert.throws(
    () => traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf: "deadbeef" }),
    /as_of/,
  );
});

test("throws when as_of is not an ancestor of HEAD", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  commit(repo, "c1");
  git(repo, "checkout", "-q", "-b", "side");
  write(repo, "src/side.txt", ["side"]);
  const sideSha = commit(repo, "side commit");
  git(repo, "checkout", "-q", "main");
  write(repo, "src/c.txt", ["main goes on"]);
  commit(repo, "c2");
  assert.throws(
    () => traceRange(repo, { path: "src/a.txt", lines: ANCHOR_LINES, asOf: sideSha }),
    /ancestor/,
  );
});

test("throws when the path does not exist at as_of", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile());
  const asOf = commit(repo, "c1");
  assert.throws(
    () => traceRange(repo, { path: "src/nope.txt", lines: ANCHOR_LINES, asOf }),
    /not found at as_of/,
  );
});

test("throws when the range is out of bounds at as_of", (t) => {
  const repo = makeRepo(t);
  write(repo, "src/a.txt", baseFile()); // 20 lines
  const asOf = commit(repo, "c1");
  assert.throws(
    () => traceRange(repo, { path: "src/a.txt", lines: { start: 18, end: 25 }, asOf }),
    /out of bounds/,
  );
  assert.throws(
    () => traceRange(repo, { path: "src/a.txt", lines: { start: 0, end: 3 }, asOf }),
    /invalid/i,
  );
  assert.throws(
    () => traceRange(repo, { path: "src/a.txt", lines: { start: 5, end: 4 }, asOf }),
    /invalid/i,
  );
});
