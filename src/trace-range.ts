// Blame-trace resolver (DESIGN.md §4, resolution order step 2).
//
// Given an anchor claim {path, lines, as_of} — "at commit as_of, this concept
// was about these lines" — compute where those lines live at HEAD, or prove
// they are gone. Pure library function: no bundle knowledge, read-only git
// commands only.
//
// Approach: `git log -L` cannot express this query (it interprets both the
// range and the path at the *newest* revision — see NOTES.md for the observed
// failure modes). Instead we walk a parent→child commit chain from as_of to
// HEAD (see commitChain) and apply each step's zero-context diff hunks to the
// tracked range:
//
//   - hunks entirely above the range shift it;
//   - hunks overlapping the range kill the overlapped lines;
//   - renames (git diff --find-renames) update the tracked path;
//   - a delete of the tracked path is `lost: "file-deleted"`;
//   - all lines killed is `lost: "content-rewritten"`.
//
// Shrink policy for partially-edited ranges: every anchored line is tracked
// individually; the result is the *bounding span* of the lines that survived
// (first surviving line .. last surviving line at HEAD). Interior edits and
// insertions therefore widen or preserve the span rather than splitting the
// anchor — an anchor on a function whose body was partially edited should
// still cover the function. Lines at the edges only survive-or-die; the span
// never includes unrelated code above or below the original claim.
//
// Never-silently-wrong guarantee: before returning a live result, every
// surviving line's content at HEAD is compared byte-for-byte with its content
// at as_of. Any line that fails verification is dropped; if none survive the
// check, the result is `lost: "content-rewritten"`. A wrong range cannot be
// emitted by hunk-math bugs alone — it would have to survive this check too.

import { gitOrThrow, resolveAsOfCommit, showLines } from "./git.js";

export interface LineRange {
  /** 1-based, inclusive. */
  start: number;
  end: number;
}

export interface RangeAnchor {
  /** Repo-relative POSIX path, valid at `asOf`. */
  path: string;
  lines: LineRange;
  /** Commit-ish at which `path` + `lines` were valid. Must be an ancestor of HEAD. */
  asOf: string;
}

export type LostReason = "file-deleted" | "content-rewritten";

export type TraceResult =
  | { lost: false; path: string; lines: LineRange }
  | { lost: true; reason: LostReason };

/** One anchored line: its number at as_of and its current number as we walk. */
interface TrackedLine {
  orig: number;
  cur: number;
}

/** A zero-context diff hunk: `@@ -oldStart,oldCount +newStart,newCount @@`. */
interface Hunk {
  oldStart: number;
  oldCount: number;
  newCount: number;
}

interface FileChange {
  status: "M" | "D" | "T" | "R";
  newPath: string | null; // set for renames
}

/** How `path` changed between `from` and `to`, or null if untouched. */
function fileChange(repo: string, from: string, to: string, path: string): FileChange | null {
  const out = gitOrThrow(repo, ["diff", "--name-status", "--find-renames", "-z", from, to]);
  const tokens = out.split("\0");
  let i = 0;
  while (i < tokens.length && tokens[i] !== "") {
    const status = tokens[i++];
    const kind = status[0];
    if (kind === "R" || kind === "C") {
      const oldPath = tokens[i++];
      const newPath = tokens[i++];
      if (kind === "R" && oldPath === path) return { status: "R", newPath };
    } else {
      const p = tokens[i++];
      if (p === path && (kind === "M" || kind === "D" || kind === "T")) {
        return { status: kind, newPath: null };
      }
    }
  }
  return null;
}

/**
 * Zero-context hunks for `path` (old side) between `from` and `to`.
 * The diff is pathspec-limited to the old and new names, then the section
 * whose old path matches is selected — pathspec alone could match another
 * file that was renamed onto one of these names in the same commit.
 */
function hunksFor(repo: string, from: string, to: string, oldPath: string, newPath: string): Hunk[] {
  const paths = oldPath === newPath ? [oldPath] : [oldPath, newPath];
  const out = gitOrThrow(repo, [
    "diff",
    "--unified=0",
    "--find-renames",
    from,
    to,
    "--",
    ...paths,
  ]);
  const sections = out.split(/^(?=diff --git )/m);
  for (const section of sections) {
    const fromRename = section.match(/^rename from (.*)$/m)?.[1];
    const fromMinus = section.match(/^--- a\/(.*)$/m)?.[1];
    if ((fromRename ?? fromMinus) !== oldPath) continue;
    const hunks: Hunk[] = [];
    const re = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,(\d+))? @@/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(section)) !== null) {
      hunks.push({
        oldStart: Number(m[1]),
        oldCount: m[2] === undefined ? 1 : Number(m[2]),
        newCount: m[3] === undefined ? 1 : Number(m[3]),
      });
    }
    return hunks;
  }
  return [];
}

/**
 * Apply one commit-step's hunks to the tracked lines. All hunk positions
 * refer to the pre-step file, so deltas are computed against each line's
 * pre-step `cur` and applied at once.
 */
function applyHunks(lines: TrackedLine[], hunks: Hunk[]): TrackedLine[] {
  const survivors: TrackedLine[] = [];
  for (const line of lines) {
    let delta = 0;
    let killed = false;
    for (const h of hunks) {
      if (h.oldCount === 0) {
        // Pure insertion after old line `oldStart` (0 = top of file).
        if (h.oldStart < line.cur) delta += h.newCount;
        continue;
      }
      const oldEnd = h.oldStart + h.oldCount - 1;
      if (line.cur >= h.oldStart && line.cur <= oldEnd) {
        killed = true;
        break;
      }
      if (line.cur > oldEnd) delta += h.newCount - h.oldCount;
    }
    if (!killed) survivors.push({ orig: line.orig, cur: line.cur + delta });
  }
  return survivors;
}

/**
 * Parent→child commit chain from asOf (exclusive) to HEAD (inclusive), each
 * element a child of the one before it, preferring first parents.
 *
 * `rev-list --first-parent asOf..HEAD` is not usable here: it lists HEAD's
 * first-parent chain, so when asOf is reachable from HEAD only through a
 * merge's *second* parent (anchor created on a feature branch, branch later
 * merged — the normal workflow), consecutive listed commits are not parent
 * and child of each other, and diffing them reads branch divergence as edits:
 * a false `lost` verdict for content that is alive at HEAD. Instead, walk
 * backwards from HEAD through the ancestry-path graph, descending at each
 * merge into the first parent that still leads to asOf.
 */
function commitChain(repo: string, asOfSha: string): string[] {
  const out = gitOrThrow(repo, ["rev-list", "--ancestry-path", "--parents", `${asOfSha}..HEAD`]);
  // Commits that are both descendants of asOf and ancestors of HEAD, each
  // mapped to its parents (which may lie outside that set).
  const parentsOf = new Map<string, string[]>();
  for (const line of out.split("\n")) {
    if (line === "") continue;
    const [sha, ...parents] = line.split(" ");
    parentsOf.set(sha, parents);
  }
  if (parentsOf.size === 0) return []; // asOf is HEAD itself
  const chain: string[] = [];
  let cur = gitOrThrow(repo, ["rev-parse", "HEAD"]).trim();
  while (cur !== asOfSha) {
    chain.push(cur);
    const next = parentsOf.get(cur)?.find((p) => p === asOfSha || parentsOf.has(p));
    if (next === undefined) {
      // Unreachable: resolveAsOfCommit guarantees asOf is an ancestor of
      // HEAD, so every commit on an ancestry path has a parent on one.
      throw new Error(`no parent chain from HEAD back to as_of ${asOfSha}`);
    }
    cur = next;
  }
  return chain.reverse();
}

export function traceRange(repo: string, anchor: RangeAnchor): TraceResult {
  const { path, lines, asOf } = anchor;
  if (
    !Number.isInteger(lines.start) ||
    !Number.isInteger(lines.end) ||
    lines.start < 1 ||
    lines.end < lines.start
  ) {
    throw new Error(`invalid line range ${lines.start}-${lines.end} (need 1 <= start <= end)`);
  }

  const asOfSha = resolveAsOfCommit(repo, asOf);

  const origLines = showLines(repo, asOfSha, path);
  if (origLines === null) {
    throw new Error(`path "${path}" not found at as_of ${asOf}`);
  }
  if (lines.end > origLines.length) {
    throw new Error(
      `range ${lines.start}-${lines.end} out of bounds: "${path}" has ${origLines.length} lines at as_of ${asOf}`,
    );
  }

  let tracked: TrackedLine[] = [];
  for (let n = lines.start; n <= lines.end; n++) tracked.push({ orig: n, cur: n });
  let curPath = path;

  const commits = commitChain(repo, asOfSha);

  let prev = asOfSha;
  for (const commit of commits) {
    const change = fileChange(repo, prev, commit, curPath);
    if (change !== null) {
      if (change.status === "D") return { lost: true, reason: "file-deleted" };
      // Typechange (file became a symlink/submodule): the lines no longer
      // exist as text content.
      if (change.status === "T") return { lost: true, reason: "content-rewritten" };
      const newPath = change.newPath ?? curPath;
      tracked = applyHunks(tracked, hunksFor(repo, prev, commit, curPath, newPath));
      curPath = newPath;
      if (tracked.length === 0) return { lost: true, reason: "content-rewritten" };
    }
    prev = commit;
  }

  // Verification pass: the never-silently-wrong backstop. Only lines whose
  // HEAD content matches their as_of content count as survivors.
  const headLines = showLines(repo, "HEAD", curPath);
  if (headLines === null) return { lost: true, reason: "file-deleted" };
  const verified = tracked.filter(
    (l) => l.cur >= 1 && l.cur <= headLines.length && headLines[l.cur - 1] === origLines[l.orig - 1],
  );
  if (verified.length === 0) return { lost: true, reason: "content-rewritten" };

  return {
    lost: false,
    path: curPath,
    lines: { start: verified[0].cur, end: verified[verified.length - 1].cur },
  };
}
