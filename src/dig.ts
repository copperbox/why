// `why dig --episodes` (DESIGN.md §6 step 1): the deterministic half of
// archaeology. Walks git history over a ref range and clusters commits into
// candidate episodes — merge/PR boundaries first, then temporal + file-overlap
// clustering for direct commits — and flags *tells* (reverts, fix-chains,
// sudden churn on old-quiet files, comment tells) that mark high-value dig
// sites. Emits a stable JSON report (schema: docs/dig-episodes.md).
//
// Everything here is deterministic over (repo state, range): no wall-clock
// timestamps, stable ordering everywhere — reports get cached and diffed.
// Judgment (what an episode *means*) belongs to the agent steps, never here.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { git, gitOrThrow } from "./git.js";

/** Operational failure (bad repo, bad range) — the CLI reports it and exits 1. */
export class DigError extends Error {
  /**
   * True when the range start (`from`) is what failed — a caller holding a
   * stored high-water mark can safely retry over full history.
   */
  constructor(
    message: string,
    readonly staleFrom = false,
  ) {
    super(message);
  }
}

// --- Report shape (the stable JSON surface; see docs/dig-episodes.md) -------

export const EPISODES_SCHEMA = "why-dig-episodes";
export const EPISODES_SCHEMA_VERSION = 1;

export interface DigCommit {
  sha: string;
  /** First line of the message. */
  subject: string;
  /** Full commit message, trailing whitespace trimmed. */
  message: string;
  author: { name: string; email: string };
  /** Author date, strict ISO 8601. */
  date: string;
}

export interface FileChurn {
  path: string;
  additions: number;
  deletions: number;
}

/** How the episode boundary was found. */
export type EpisodeKind = "merge" | "squash" | "direct";

export interface RevertTell {
  sha: string;
  subject: string;
}

export interface FixChainTell {
  path: string;
  /** The fix-prefixed commits touching the path, oldest first. */
  shas: string[];
}

export interface SuddenChurnTell {
  path: string;
  /** additions + deletions on the path in this episode. */
  churn: number;
  zScore: number;
}

export interface CommentTell {
  sha: string;
  path: string;
  /** The added line, `+` stripped and trimmed. */
  line: string;
}

export interface EpisodeTells {
  reverts: RevertTell[];
  fixChains: FixChainTell[];
  suddenChurn: SuddenChurnTell[];
  /** `count` is always the true total; `sample` is capped (never silently). */
  commentTells: { count: number; sample: CommentTell[] };
}

export interface Episode {
  /** Unique, stable: the episode's newest commit sha, abbreviated to 12. */
  id: string;
  kind: EpisodeKind;
  /** PR number parsed from the merge/squash boundary commit, if any. */
  pr: number | null;
  /** Oldest first; for `merge` episodes the merge commit itself is last. */
  commits: DigCommit[];
  /** Per-path churn summed over the episode's commits, sorted by path. */
  files: FileChurn[];
  /** PR/issue numbers referenced in commit messages, sorted unique. */
  refs: number[];
  /** Min/max author date over the episode's commits. */
  dates: { start: string; end: string };
  tells: EpisodeTells;
}

export interface TellCounts {
  count: number;
  /** Ids of episodes carrying at least one tell of this kind. */
  episodes: string[];
}

export interface TellsSummary {
  reverts: TellCounts;
  fixChains: TellCounts;
  suddenChurn: TellCounts;
  commentTells: TellCounts;
}

export interface EpisodesReport {
  schema: typeof EPISODES_SCHEMA;
  version: typeof EPISODES_SCHEMA_VERSION;
  /** Repository the walk ran in (git toplevel). */
  repo: string;
  /** Resolved range: commits in `from..to`; from null = full history to `to`. */
  range: { from: string | null; to: string };
  /** Oldest first (first-parent order) — synthesis wants causal order. */
  episodes: Episode[];
  tells: TellsSummary;
}

// --- Tunables (documented in docs/dig-episodes.md; changing one is a
// --- schema-version conversation, not a quiet edit) --------------------------

/** Direct commits by the same author within this window may share an episode. */
export const CLUSTER_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Trailing episodes considered when scoring a file's churn. */
export const CHURN_WINDOW = 20;
/** A file must be at least this many episodes old before churn can be "sudden". */
export const CHURN_MIN_AGE = 5;
/** z-score at or above which churn on an old-quiet file is flagged. */
export const CHURN_Z_THRESHOLD = 3;
/** Comment-tell samples kept per episode (count stays exact). */
export const COMMENT_TELL_SAMPLE_CAP = 20;

const MERGE_PR_RE = /^Merge pull request #(\d+)/;
const SQUASH_PR_RE = /\(#(\d+)\)\s*$/;
const REVERT_RE = /^Revert "/;
const FIX_RE = /^fix/i;
/** Added diff lines matching this are comment tells (issue-defined pattern). */
export const COMMENT_TELL_RE = /\b(hack|workaround|do not|don't|because|temporarily)\b/i;
const REF_RE = /(?:^|[^\w&])#(\d+)\b|(?:issues|pull)\/(\d+)\b/g;

// --- Extraction --------------------------------------------------------------

export interface DigOptions {
  /** Exclusive start of the range; omitted = full history. */
  from?: string;
  /** Inclusive end of the range; default HEAD. */
  to?: string;
}

interface RawCommit extends DigCommit {
  files: FileChurn[];
  commentTells: CommentTell[];
}

const C = "\x01"; // commit separator
const F = "\x1f"; // field separator
const E = "\x1e"; // end of header

function resolveCommit(repo: string, rev: string, what: "range start" | "range end"): string {
  const r = git(repo, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]);
  if (r.status !== 0) {
    throw new DigError(`${what} "${rev}" does not resolve to a commit`, what === "range start");
  }
  return r.stdout.trim();
}

/** Read every commit in the range: metadata + per-file churn, one git call. */
function readCommits(repo: string, range: string[]): Map<string, RawCommit> {
  const out = gitOrThrow(repo, [
    "log",
    "--no-renames",
    "--numstat",
    `--format=${C}%H${F}%an${F}%ae${F}%aI${F}%B${E}`,
    ...range,
  ]);
  const commits = new Map<string, RawCommit>();
  for (const chunk of out.split(C).slice(1)) {
    const end = chunk.indexOf(E);
    const [sha, name, email, date, message] = chunk.slice(0, end).split(F) as [
      string,
      string,
      string,
      string,
      string,
    ];
    const files: FileChurn[] = [];
    for (const line of chunk.slice(end + 1).split("\n")) {
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
      if (m === null) continue;
      // Binary files numstat as "-"; count their churn as 0 but keep the path.
      files.push({
        path: m[3]!,
        additions: m[1] === "-" ? 0 : Number(m[1]),
        deletions: m[2] === "-" ? 0 : Number(m[2]),
      });
    }
    const trimmed = message.trimEnd();
    commits.set(sha, {
      sha,
      subject: trimmed.split("\n", 1)[0]!,
      message: trimmed,
      author: { name, email },
      date,
      files,
      commentTells: [],
    });
  }
  return commits;
}

/** Second pass: scan added diff lines for comment tells. */
function scanCommentTells(repo: string, range: string[], commits: Map<string, RawCommit>): void {
  const out = gitOrThrow(repo, ["log", "--no-renames", "-p", `--format=${C}%H`, ...range]);
  for (const chunk of out.split(C).slice(1)) {
    const lines = chunk.split("\n");
    const commit = commits.get(lines[0]!.trim());
    if (commit === undefined) continue;
    let path: string | null = null;
    for (const line of lines.slice(1)) {
      const target = /^\+\+\+ (?:b\/(.*)|\/dev\/null)$/.exec(line);
      if (target !== null) {
        path = target[1] ?? null;
        continue;
      }
      if (path === null || !line.startsWith("+") || line.startsWith("+++")) continue;
      if (COMMENT_TELL_RE.test(line)) {
        commit.commentTells.push({ sha: commit.sha, path, line: line.slice(1).trim() });
      }
    }
  }
}

interface ProtoEpisode {
  kind: EpisodeKind;
  pr: number | null;
  commits: RawCommit[];
}

/** Cluster a contiguous run of direct commits: same author, <48h, shared paths. */
function clusterDirectRun(run: RawCommit[]): ProtoEpisode[] {
  const clusters: ProtoEpisode[] = [];
  let current: RawCommit[] = [];
  let paths = new Set<string>();
  let lastMs = 0;
  const flush = () => {
    if (current.length > 0) clusters.push({ kind: "direct", pr: null, commits: current });
    current = [];
    paths = new Set();
    lastMs = 0; // author dates are not monotonic (rebases) — never leak across clusters
  };
  for (const commit of run) {
    const ms = Date.parse(commit.date);
    // abs(): walk order is topological, so a rebased commit can carry an
    // author date older than the cluster tip — "apart" cuts both ways.
    const joins =
      current.length > 0 &&
      commit.author.email === current[0]!.author.email &&
      Math.abs(ms - lastMs) < CLUSTER_WINDOW_MS &&
      commit.files.some((f) => paths.has(f.path));
    if (!joins) flush();
    current.push(commit);
    for (const f of commit.files) paths.add(f.path);
    lastMs = Math.max(lastMs, ms);
  }
  flush();
  return clusters;
}

/** Walk the first-parent chain of the range and group commits into episodes. */
function groupEpisodes(
  repo: string,
  range: string[],
  commits: Map<string, RawCommit>,
): ProtoEpisode[] {
  const walk = gitOrThrow(repo, ["rev-list", "--first-parent", "--reverse", "--parents", ...range])
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => l.split(" "));

  const episodes: ProtoEpisode[] = [];
  const assigned = new Set<string>();
  let directRun: RawCommit[] = [];
  const flushRun = () => {
    episodes.push(...clusterDirectRun(directRun));
    directRun = [];
  };
  const take = (sha: string): RawCommit | undefined => {
    const c = commits.get(sha);
    if (c === undefined || assigned.has(sha)) return undefined;
    assigned.add(sha);
    return c;
  };

  for (const [sha, ...parents] of walk) {
    const commit = take(sha!);
    if (commit === undefined) continue;
    if (parents.length >= 2) {
      flushRun();
      // Side-branch commits: reachable from the merged parents, not mainline.
      const side = gitOrThrow(repo, [
        "rev-list",
        "--reverse",
        ...parents.slice(1),
        "--not",
        parents[0]!,
      ])
        .split("\n")
        .filter((s) => s !== "")
        .map(take)
        .filter((c): c is RawCommit => c !== undefined);
      const pr = MERGE_PR_RE.exec(commit.subject)?.[1];
      episodes.push({
        kind: "merge",
        pr: pr === undefined ? null : Number(pr),
        commits: [...side, commit],
      });
      continue;
    }
    const squash = SQUASH_PR_RE.exec(commit.subject)?.[1];
    if (squash !== undefined) {
      flushRun();
      episodes.push({ kind: "squash", pr: Number(squash), commits: [commit] });
      continue;
    }
    directRun.push(commit);
  }
  flushRun();
  return episodes;
}

function extractRefs(commits: RawCommit[]): number[] {
  const refs = new Set<number>();
  for (const c of commits) {
    for (const m of c.message.matchAll(REF_RE)) refs.add(Number(m[1] ?? m[2]));
  }
  return [...refs].sort((a, b) => a - b);
}

function sumChurn(commits: RawCommit[]): FileChurn[] {
  const byPath = new Map<string, FileChurn>();
  for (const c of commits) {
    for (const f of c.files) {
      const entry = byPath.get(f.path) ?? { path: f.path, additions: 0, deletions: 0 };
      entry.additions += f.additions;
      entry.deletions += f.deletions;
      byPath.set(f.path, entry);
    }
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function fixChains(commits: RawCommit[]): FixChainTell[] {
  const byPath = new Map<string, string[]>();
  for (const c of commits) {
    if (!FIX_RE.test(c.subject)) continue;
    for (const f of c.files) {
      byPath.set(f.path, [...(byPath.get(f.path) ?? []), c.sha]);
    }
  }
  return [...byPath.entries()]
    .filter(([, shas]) => shas.length >= 2)
    .map(([path, shas]) => ({ path, shas }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Sudden churn on old-quiet files: for each (episode, file), z-score the
 * episode's churn against the file's churn over the trailing CHURN_WINDOW
 * episodes (0 when untouched). Only files first seen at least CHURN_MIN_AGE
 * episodes earlier qualify — brand-new files are always "sudden" and never
 * interesting. The stddev floor of 1 keeps a dead-quiet history from making
 * every touch infinitely surprising.
 */
function markSuddenChurn(episodes: Episode[]): void {
  const firstSeen = new Map<string, number>();
  const history: Map<string, number>[] = [];
  episodes.forEach((ep, i) => {
    const churn = new Map<string, number>();
    for (const f of ep.files) {
      churn.set(f.path, f.additions + f.deletions);
      if (!firstSeen.has(f.path)) firstSeen.set(f.path, i);
    }
    history.push(churn);
  });
  episodes.forEach((ep, i) => {
    for (const f of ep.files) {
      if (i - firstSeen.get(f.path)! < CHURN_MIN_AGE) continue;
      const window: number[] = [];
      for (let j = Math.max(0, i - CHURN_WINDOW); j < i; j++) {
        window.push(history[j]!.get(f.path) ?? 0);
      }
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;
      const sigma = Math.max(Math.sqrt(variance), 1);
      const churn = f.additions + f.deletions;
      const z = (churn - mean) / sigma;
      if (z >= CHURN_Z_THRESHOLD) {
        ep.tells.suddenChurn.push({ path: f.path, churn, zScore: Number(z.toFixed(2)) });
      }
    }
  });
}

function buildEpisode(proto: ProtoEpisode): Episode {
  const commits = proto.commits;
  // Chronological, not lexicographic — ISO dates carry varying UTC offsets.
  const dates = commits.map((c) => c.date).sort((a, b) => Date.parse(a) - Date.parse(b));
  const allTells = commits.flatMap((c) => c.commentTells);
  return {
    id: commits[commits.length - 1]!.sha.slice(0, 12),
    kind: proto.kind,
    pr: proto.pr,
    commits: commits.map(({ sha, subject, message, author, date }) => ({
      sha,
      subject,
      message,
      author,
      date,
    })),
    files: sumChurn(commits),
    refs: extractRefs(commits),
    dates: { start: dates[0]!, end: dates[dates.length - 1]! },
    tells: {
      reverts: commits
        .filter((c) => REVERT_RE.test(c.subject))
        .map((c) => ({ sha: c.sha, subject: c.subject })),
      fixChains: fixChains(commits),
      suddenChurn: [],
      commentTells: { count: allTells.length, sample: allTells.slice(0, COMMENT_TELL_SAMPLE_CAP) },
    },
  };
}

function summarizeTells(episodes: Episode[]): TellsSummary {
  const summarize = (count: (e: Episode) => number): TellCounts => ({
    count: episodes.reduce((n, e) => n + count(e), 0),
    episodes: episodes.filter((e) => count(e) > 0).map((e) => e.id),
  });
  return {
    reverts: summarize((e) => e.tells.reverts.length),
    fixChains: summarize((e) => e.tells.fixChains.length),
    suddenChurn: summarize((e) => e.tells.suddenChurn.length),
    commentTells: summarize((e) => e.tells.commentTells.count),
  };
}

/**
 * Extract episodes + tells over `from..to` (full history to `to` when `from`
 * is omitted). `repo` must be inside a git work tree with at least one commit.
 */
export function extractEpisodes(repo: string, options: DigOptions = {}): EpisodesReport {
  const toplevel = git(repo, ["rev-parse", "--show-toplevel"]);
  if (toplevel.status !== 0) {
    throw new DigError(`${repo} is not inside a git repository`);
  }
  const root = toplevel.stdout.trim();
  const to = resolveCommit(root, options.to ?? "HEAD", "range end");
  let from: string | null = null;
  if (options.from !== undefined) {
    from = resolveCommit(root, options.from, "range start");
    if (git(root, ["merge-base", "--is-ancestor", from, to]).status !== 0) {
      throw new DigError(
        `range start ${options.from} is not an ancestor of ${options.to ?? "HEAD"}`,
        true,
      );
    }
  }
  const range = from === null ? [to] : [`${from}..${to}`];

  const commits = readCommits(root, range);
  scanCommentTells(root, range, commits);
  const episodes = groupEpisodes(root, range, commits).map(buildEpisode);
  markSuddenChurn(episodes);

  return {
    schema: EPISODES_SCHEMA,
    version: EPISODES_SCHEMA_VERSION,
    repo: root,
    range: { from, to },
    episodes,
    tells: summarizeTells(episodes),
  };
}

// --- High-water mark ---------------------------------------------------------

/**
 * Read the dig high-water mark from `<bundle>/.dig-state.json` if one exists
 * and is usable; anything else (absent, unparseable, wrong shape) means a
 * full-history run — re-digging is always safe (synthesis dedupes), a hard
 * failure on stale state would not be. Writing the state file is the
 * incremental-digs issue's job (issues/304), not this module's.
 */
export function readHighWaterMark(bundleRoot: string): { sha: string } | { note: string } | null {
  let raw: string;
  try {
    raw = readFileSync(join(bundleRoot, ".dig-state.json"), "utf8");
  } catch {
    return null; // no state file — first run, full history
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const sha =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>).lastProcessed
        : undefined;
    if (typeof sha === "string" && sha !== "") return { sha };
    return { note: ".dig-state.json has no usable lastProcessed — running full history" };
  } catch {
    return { note: ".dig-state.json is not valid JSON — running full history" };
  }
}

// --- Rendering ---------------------------------------------------------------

function day(iso: string): string {
  return iso.slice(0, 10);
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function tellBadges(e: Episode): string {
  const badges: string[] = [];
  if (e.tells.reverts.length > 0) badges.push(`revert×${e.tells.reverts.length}`);
  if (e.tells.fixChains.length > 0) badges.push(`fix-chain×${e.tells.fixChains.length}`);
  if (e.tells.suddenChurn.length > 0) badges.push(`sudden-churn×${e.tells.suddenChurn.length}`);
  if (e.tells.commentTells.count > 0) badges.push(`comment×${e.tells.commentTells.count}`);
  return badges.length === 0 ? "" : `  tells: ${badges.join(", ")}`;
}

export function renderEpisodesReport(report: EpisodesReport): string[] {
  const lines: string[] = [];
  const commits = report.episodes.reduce((n, e) => n + e.commits.length, 0);
  const from = report.range.from === null ? "full history" : `${report.range.from.slice(0, 12)}..`;
  lines.push(
    `why dig --episodes: ${plural(report.episodes.length, "episode")}, ` +
      `${plural(commits, "commit")} (${from} → ${report.range.to.slice(0, 12)})`,
  );
  lines.push("");
  for (const e of report.episodes) {
    const span = e.dates.start === e.dates.end ? day(e.dates.start) : `${day(e.dates.start)}..${day(e.dates.end)}`;
    const pr = e.pr === null ? "" : ` #${e.pr}`;
    lines.push(
      `  ${e.id}  ${e.kind}${pr}  ${span}  ${plural(e.commits.length, "commit")}, ` +
        `${plural(e.files.length, "file")}${tellBadges(e)}`,
    );
  }
  lines.push("");
  const t = report.tells;
  lines.push(
    `tells: ${plural(t.reverts.count, "revert")}, ${plural(t.fixChains.count, "fix-chain")}, ` +
      `${t.suddenChurn.count} sudden-churn, ${plural(t.commentTells.count, "comment tell")}`,
  );
  lines.push("(full data: --json or --out <file>; schema: docs/dig-episodes.md)");
  return lines;
}
