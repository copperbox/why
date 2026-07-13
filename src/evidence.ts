// Evidence-pack assembly (DESIGN.md §6 step 2): turn one episode from
// `why dig --episodes` into a single markdown document holding everything a
// reconstruction agent may cite — full commit messages, PR and issue threads
// via `gh`, per-file-clipped diffs, and local exported context — so the agent
// never fetches on its own. Packs are deterministic (no timestamps, stable
// ordering, stable formatting) because they get cached and diffed. Anything
// unreachable degrades to an explicit `[unavailable: …]` marker and anything
// dropped for size to a `[clipped: …]` marker — never a silent gap.

import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

export class EvidenceError extends Error {}

/** Default total pack budget (~50k tokens): bounded context for one agent run. */
export const DEFAULT_MAX_CHARS = 200_000;
/** Default cap on any single file's diff (or local evidence file) inside a pack. */
export const DEFAULT_PER_FILE_CHARS = 8_000;

// --- Command-runner seam -----------------------------------------------------

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** Every external command (git, gh) goes through this so tests never hit the network. */
export type CommandRunner = (cmd: string, args: string[], cwd: string) => RunResult;

export const runCommand: CommandRunner = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.error) {
    if ((r.error as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: 127, stdout: "", stderr: `${cmd}: command not found` };
    }
    throw new Error(`failed to run ${cmd}: ${r.error.message}`);
  }
  return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
};

// --- Episode input -----------------------------------------------------------

export interface EpisodeCommit {
  sha: string;
  /** Fallback only — the pack prefers the full message from `git show`. */
  message?: string;
}

export interface Episode {
  id: string;
  commits: EpisodeCommit[];
  /** Touched paths, used for --evidence-dir matching and the pack header. */
  files: string[];
  prs: number[];
  issues: number[];
}

/**
 * Parse `why dig --episodes` output tolerantly: a bare array or an
 * `{episodes: [...]}` wrapper; commits as objects (`sha` required) or bare
 * sha strings; files as strings or `{path}` objects with churn fields;
 * PR/issue references as numbers or digit strings. Anything that cannot be
 * an episode is an EvidenceError, never a silently-empty pack.
 */
export function readEpisodes(raw: string, source: string): Episode[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new EvidenceError(`${source}: not valid JSON: ${e instanceof Error ? e.message : e}`);
  }
  let list: unknown[];
  if (Array.isArray(json)) {
    list = json;
  } else if (isRecord(json) && Array.isArray(json.episodes)) {
    list = json.episodes;
  } else {
    throw new EvidenceError(`${source}: expected an array of episodes or {"episodes": [...]}`);
  }
  return list.map((entry, i) => readEpisode(entry, `${source}: episode ${i}`));
}

function readEpisode(entry: unknown, where: string): Episode {
  if (!isRecord(entry)) throw new EvidenceError(`${where}: not an object`);
  const commits = readCommits(entry.commits, where);
  let id: string;
  if (typeof entry.id === "string" && entry.id !== "") {
    id = entry.id;
  } else if (typeof entry.id === "number") {
    id = String(entry.id);
  } else {
    id = commits[0]!.sha.slice(0, 7);
  }
  return {
    id,
    commits,
    files: readFiles(entry.files, where),
    prs: readRefs(entry.prs, `${where}: prs`),
    issues: readRefs(entry.issues, `${where}: issues`),
  };
}

function readCommits(value: unknown, where: string): EpisodeCommit[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new EvidenceError(`${where}: an episode needs a non-empty "commits" array`);
  }
  return value.map((c, i) => {
    if (typeof c === "string" && c !== "") return { sha: c };
    if (isRecord(c) && typeof c.sha === "string" && c.sha !== "") {
      return typeof c.message === "string" ? { sha: c.sha, message: c.message } : { sha: c.sha };
    }
    throw new EvidenceError(`${where}: commit ${i} has no sha`);
  });
}

function readFiles(value: unknown, where: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new EvidenceError(`${where}: "files" must be an array`);
  const paths = value.map((f, i) => {
    if (typeof f === "string" && f !== "") return f;
    if (isRecord(f) && typeof f.path === "string" && f.path !== "") return f.path;
    throw new EvidenceError(`${where}: file ${i} has no path`);
  });
  return [...new Set(paths)].sort();
}

function readRefs(value: unknown, where: string): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new EvidenceError(`${where} must be an array of numbers`);
  const refs = value.map((n) => {
    if (typeof n === "number" && Number.isInteger(n) && n > 0) return n;
    if (typeof n === "string" && /^[0-9]+$/.test(n)) return Number(n);
    throw new EvidenceError(`${where}: "${n}" is not a PR/issue number`);
  });
  return [...new Set(refs)].sort((a, b) => a - b);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// --- Pack assembly -----------------------------------------------------------

export interface EvidencePackOptions {
  /** Repository the episode's commits live in. */
  repo: string;
  runner?: CommandRunner;
  /** Total pack budget in characters. */
  maxChars?: number;
  /** Per-file cap for diffs and local evidence files. */
  perFileChars?: number;
  /** Local exported context (postmortems, chat exports) to merge in. */
  evidenceDir?: string;
}

export interface EvidencePack {
  episodeId: string;
  markdown: string;
  /** Human notes of what was clipped where (also embedded as markers). */
  clipped: string[];
  /** `[unavailable: …]` reasons emitted into the pack. */
  unavailable: string[];
}

/** One budgeted unit of the pack; `desc` names it in clip markers. */
interface Block {
  text: string;
  desc: string;
}

const FENCE = "````";

export async function buildEvidencePack(
  episode: Episode,
  options: EvidencePackOptions,
): Promise<EvidencePack> {
  const runner = options.runner ?? runCommand;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const perFile = options.perFileChars ?? DEFAULT_PER_FILE_CHARS;
  const { repo } = options;
  const clipped: string[] = [];
  const unavailable: string[] = [];
  const note = (marker: string): string => {
    unavailable.push(marker);
    return `[unavailable: ${marker}]`;
  };

  const blocks: Block[] = [];
  blocks.push({ text: renderHeader(episode), desc: "pack header" });

  // Commits: the full message from git is the ground truth; the episode's
  // copy is only a fallback when the sha is gone from this clone.
  episode.commits.forEach((commit, i) => {
    const sha7 = commit.sha.slice(0, 7);
    const shown = runner("git", ["show", "-s", "--format=%an <%ae>%n%as%n%B", commit.sha], repo);
    let body: string;
    if (shown.status === 0) {
      const [author, date, ...message] = shown.stdout.split("\n");
      body = [`- author: ${author}`, `- date: ${date}`, "", message.join("\n").trimEnd()].join("\n");
    } else {
      body = note(`commit ${commit.sha} — not found in this repository`);
      if (commit.message !== undefined) {
        body += `\n\nMessage as recorded by --episodes:\n\n${commit.message.trimEnd()}`;
      }
    }
    blocks.push({
      text: `${i === 0 ? "## Commits\n\n" : ""}### commit ${sha7}\n\n${body}\n`,
      desc: `commit ${sha7}`,
    });
  });

  // Remote things: one explicit degradation reason covers every fetch. With
  // no remote there is nothing gh could resolve, so it is never invoked.
  const hasRefs = episode.prs.length > 0 || episode.issues.length > 0;
  const remote = hasRefs ? runner("git", ["remote", "get-url", "origin"], repo) : undefined;
  const noRemote = remote !== undefined && remote.status !== 0 ? "no git remote configured" : undefined;

  episode.prs.forEach((n, i) => {
    const heading = i === 0 ? "## Pull requests\n\n" : "";
    const body = noRemote
      ? note(`PR #${n} — ${noRemote}`)
      : renderThread(runner, repo, "pr", n, note);
    blocks.push({ text: `${heading}${body}\n`, desc: `PR #${n}` });
  });

  episode.issues.forEach((n, i) => {
    const heading = i === 0 ? "## Issues\n\n" : "";
    const body = noRemote
      ? note(`issue #${n} — ${noRemote}`)
      : renderThread(runner, repo, "issue", n, note);
    blocks.push({ text: `${heading}${body}\n`, desc: `issue #${n}` });
  });

  if (options.evidenceDir !== undefined) {
    const locals = await collectLocalEvidence(episode, options.evidenceDir, perFile, clipped);
    if (locals.length === 0) {
      blocks.push({
        text: `## Local evidence\n\nNo files in ${options.evidenceDir} matched this episode's PR/issue numbers or touched paths.\n`,
        desc: "local evidence",
      });
    } else {
      locals.forEach((text, i) => {
        blocks.push({ text: `${i === 0 ? "## Local evidence\n\n" : ""}${text}`, desc: "local evidence" });
      });
    }
  }

  // Diffs go last: the bulkiest, least rationale-dense evidence — under
  // budget pressure prose survives and code is what gets clipped.
  let sawDiff = false;
  for (const commit of episode.commits) {
    const sha7 = commit.sha.slice(0, 7);
    // -m --first-parent: a merge commit diffs against its first parent (the
    // PR's net effect); plain commits are unaffected.
    const shown = runner(
      "git",
      ["show", "-m", "--first-parent", "--format=", "--patch", "--no-color", commit.sha],
      repo,
    );
    if (shown.status !== 0) continue; // the commit block above already carries the unavailable marker
    let firstOfCommit = true;
    for (const fileDiff of splitPerFile(shown.stdout)) {
      const heading = `${sawDiff ? "" : "## Diffs\n\n"}${firstOfCommit ? `### diff of commit ${sha7}\n\n` : ""}`;
      sawDiff = true;
      firstOfCommit = false;
      const body = clipText(fileDiff.text, perFile, `diff of ${fileDiff.path} in ${sha7}`, clipped);
      blocks.push({
        text: `${heading}${FENCE}diff\n${body}\n${FENCE}\n`,
        desc: `diff of ${fileDiff.path} in ${sha7}`,
      });
    }
  }

  const markdown = assemble(blocks, maxChars, clipped);
  return { episodeId: episode.id, markdown, clipped, unavailable };
}

function renderHeader(episode: Episode): string {
  const lines = [
    `# Evidence pack: ${episode.id}`,
    "",
    `- commits: ${episode.commits.map((c) => c.sha.slice(0, 7)).join(", ")}`,
  ];
  if (episode.files.length > 0) lines.push(`- files touched: ${episode.files.join(", ")}`);
  const refs = [
    ...episode.prs.map((n) => `PR #${n}`),
    ...episode.issues.map((n) => `issue #${n}`),
  ];
  if (refs.length > 0) lines.push(`- references: ${refs.join(", ")}`);
  return `${lines.join("\n")}\n`;
}

// --- gh threads --------------------------------------------------------------

export interface GhComment {
  author?: { login?: string };
  body?: string;
  createdAt?: string;
  submittedAt?: string;
  state?: string;
}

function renderThread(
  runner: CommandRunner,
  repo: string,
  kind: "pr" | "issue",
  n: number,
  note: (marker: string) => string,
): string {
  const label = kind === "pr" ? `PR #${n}` : `issue #${n}`;
  const fields = kind === "pr" ? "title,body,author,comments,reviews" : "title,body,author,comments";
  const r = runner("gh", [kind, "view", String(n), "--json", fields], repo);
  if (r.status === 127) return note(`${label} — gh is not installed or not on PATH`);
  if (r.status !== 0) {
    const reason = r.stderr.split("\n").find((l) => l.trim() !== "")?.trim() ?? `gh exited ${r.status}`;
    return note(`${label} — gh ${kind} view failed: ${reason}`);
  }
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(r.stdout);
    if (!isRecord(parsed)) throw new Error("not an object");
    data = parsed;
  } catch {
    return note(`${label} — gh ${kind} view returned unparseable output`);
  }

  const title = typeof data.title === "string" ? data.title : "(no title)";
  const author = isRecord(data.author) && typeof data.author.login === "string" ? data.author.login : "unknown";
  const body = typeof data.body === "string" && data.body.trim() !== "" ? data.body.trim() : "(no description)";
  const lines = [`### ${kind === "pr" ? "PR" : "Issue"} #${n} — ${title}`, "", `by @${author}`, "", body];

  const comments = asComments(data.comments);
  if (comments.length > 0) {
    lines.push("", "Comments:", "");
    for (const c of comments) lines.push(renderComment(c));
  }
  if (kind === "pr") {
    // gh's `reviews` carry the review-thread verdicts and their top-level
    // bodies; bodyless "COMMENTED" entries are noise and are dropped.
    const reviews = asComments(data.reviews).filter(
      (review) =>
        (review.body ?? "").trim() !== "" ||
        (review.state !== undefined && review.state !== "COMMENTED"),
    );
    if (reviews.length > 0) {
      lines.push("", "Reviews:", "");
      for (const c of reviews) lines.push(renderComment(c));
    }
  }
  return `${lines.join("\n")}\n`;
}

/** The comment/review shape `gh` returns, tolerantly filtered. */
export function asComments(value: unknown): GhComment[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function renderComment(c: GhComment): string {
  const login = c.author?.login ?? "unknown";
  const date = (c.createdAt ?? c.submittedAt ?? "").slice(0, 10);
  const state = c.state !== undefined && c.state !== "COMMENTED" ? ` [${c.state.toLowerCase()}]` : "";
  const body = (c.body ?? "").trim() || "(no comment)";
  const indented = body.split("\n").map((l) => `  ${l}`).join("\n");
  return `- **${login}**${state}${date === "" ? "" : ` (${date})`}:\n${indented}`;
}

// --- Local evidence (--evidence-dir) -----------------------------------------

/**
 * A file matches an episode when its *name* mentions one of the episode's
 * PR/issue numbers (digit-bounded, so `notes-30.md` never matches #3) or a
 * touched path's basename — with extension, or the bare stem when it is at
 * least 3 characters (so a stem like `db` can't match everything).
 */
export function matchEvidenceFile(name: string, episode: Episode): string[] {
  const mentionsNumber = (n: number) => new RegExp(`(?<![0-9])${n}(?![0-9])`).test(name);
  const reasons: string[] = [];
  for (const n of episode.prs) {
    if (mentionsNumber(n)) reasons.push(`PR #${n}`);
  }
  for (const n of episode.issues) {
    if (mentionsNumber(n)) reasons.push(`issue #${n}`);
  }
  const lower = name.toLowerCase();
  for (const path of episode.files) {
    const base = basename(path).toLowerCase();
    const stem = base.replace(/\.[^.]+$/, "");
    if (lower.includes(base) || (stem.length >= 3 && lower.includes(stem))) {
      reasons.push(`path ${path}`);
    }
  }
  return reasons;
}

async function collectLocalEvidence(
  episode: Episode,
  dir: string,
  perFile: number,
  clipped: string[],
): Promise<string[]> {
  const rels: string[] = [];
  try {
    await listFiles(dir, "", rels);
  } catch (e) {
    throw new EvidenceError(`--evidence-dir ${dir}: ${e instanceof Error ? e.message : e}`);
  }
  rels.sort();
  const out: string[] = [];
  for (const rel of rels) {
    const reasons = matchEvidenceFile(basename(rel), episode);
    if (reasons.length === 0) continue;
    const provenance = `[source: ${join(dir, rel)} — matched ${reasons.join(", ")}]`;
    const raw = await readFile(join(dir, rel));
    const text = raw.toString("utf8");
    const body = text.includes("\u0000")
      ? `[unavailable: ${rel} — not UTF-8 text, content omitted]`
      : clipText(text.trimEnd(), perFile, `local evidence ${rel}`, clipped);
    out.push(`### ${rel}\n\n${provenance}\n\n${body}\n`);
  }
  return out;
}

async function listFiles(dir: string, prefix: string, out: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await listFiles(join(dir, entry.name), rel, out);
    else out.push(rel);
  }
}

// --- Diffs -------------------------------------------------------------------

interface FileDiff {
  path: string;
  text: string;
}

function splitPerFile(patch: string): FileDiff[] {
  const out: FileDiff[] = [];
  const lines = patch.split("\n");
  let current: string[] | undefined;
  let path = "unknown";
  // `current` always starts with its `diff --git` line, so defined means non-empty.
  const flush = () => {
    if (current !== undefined) {
      out.push({ path, text: current.join("\n").trimEnd() });
    }
  };
  for (const line of lines) {
    const m = /^diff --git a\/.* b\/(.*)$/.exec(line);
    if (m !== null) {
      flush();
      current = [line];
      path = m[1]!;
    } else if (current !== undefined) {
      current.push(line);
    }
  }
  flush();
  return out;
}

// --- Budgets -----------------------------------------------------------------

/** Truncate one file-sized text at `max`, recording the clip both ways. */
function clipText(text: string, max: number, desc: string, clipped: string[]): string {
  if (text.length <= max) return text;
  clipped.push(`${desc}: showing ${max} of ${text.length} chars`);
  return `${text.slice(0, max)}\n[clipped: ${desc} — showing ${max} of ${text.length} chars]`;
}

/**
 * Join blocks under the total budget. The first block that would overflow is
 * truncated in place with a marker (re-closing an open diff fence so the
 * document stays well-formed); everything after it collapses into one final
 * omission marker. Only the markers themselves may exceed `maxChars`.
 */
function assemble(blocks: Block[], maxChars: number, clipped: string[]): string {
  const parts: string[] = [];
  let used = 0;
  let exhausted = false;
  const omitted: string[] = [];
  for (const block of blocks) {
    const text = block.text.endsWith("\n") ? `${block.text}\n` : `${block.text}\n\n`;
    if (exhausted) {
      omitted.push(block.desc);
      continue;
    }
    if (used + text.length <= maxChars) {
      parts.push(text);
      used += text.length;
      continue;
    }
    exhausted = true;
    const marker = `[clipped: --max-chars ${maxChars} reached — ${block.desc} truncated]`;
    const keep = maxChars - used - marker.length - 2;
    if (keep <= 0) {
      omitted.push(block.desc);
      continue;
    }
    let kept = text.slice(0, keep).trimEnd();
    const fences = kept.split(FENCE).length - 1;
    if (fences % 2 === 1) kept += `\n${FENCE}`;
    parts.push(`${kept}\n${marker}\n\n`);
    clipped.push(`${block.desc} truncated at --max-chars ${maxChars}`);
  }
  if (omitted.length > 0) {
    const shown = omitted.slice(0, 8);
    const more = omitted.length - shown.length;
    const list = shown.join("; ") + (more > 0 ? `; and ${more} more` : "");
    parts.push(`[clipped: --max-chars ${maxChars} reached — omitted: ${list}]\n`);
    clipped.push(`omitted ${omitted.length} block(s) at --max-chars ${maxChars}: ${list}`);
  }
  return parts.join("").trimEnd().concat("\n");
}
