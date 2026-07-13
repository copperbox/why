// Merge-time capture (DESIGN.md open problem #5): draft a concept from a PR
// while the discussion still holds the why, at confidence `recorded`. The CLI
// half is deterministic assembly only — gh/git evidence via the dig evidence
// module, anchors from the merge diff's hunks, rationale candidates quoted
// verbatim — and everything it emits is a *draft* under `.why/.drafts/`.
// Drafts are deliberately a dot-directory: okf-mcp serves every non-dot
// `.md` under the bundle root (verified against its walkMarkdownFiles), so a
// plain `drafts/` would leak unedited machine output into `why blame` and the
// served bundle. Promotion out of drafts is an editorial act, lint-gated by
// `why capture --promote`; the judgment step lives in skills/capture/SKILL.md.

import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { serializeDocument, splitFrontmatter, writeConcept } from "@copperbox/okf-mcp";
import type { ConceptFrontmatter } from "@copperbox/okf-mcp";
import { parseLineRange, type LineRange } from "./anchors.js";
import { CONCEPT_TYPES, isOneOf, isPlainMap, loadBundle, type WhyBundle } from "./bundle.js";
import {
  asComments,
  buildEvidencePack,
  runCommand,
  type CommandRunner,
  type Episode,
  type GhComment,
} from "./evidence.js";
import { lintBundle, type Finding } from "./lint.js";

/** A capture step that must stop the command cleanly (exit 1), not crash. */
export class CaptureError extends Error {}

/**
 * Where drafts live, relative to the bundle root. Must stay a dot-directory:
 * okf-mcp's bundle walk skips dot-dirs only, and drafts must never serve.
 */
export const DRAFTS_DIRNAME = ".drafts";
/** Suffix of the evidence pack written beside each draft. */
export const EVIDENCE_SUFFIX = ".evidence.md";
/** Above this many hunks a file gets one whole-file anchor, said out loud. */
export const MAX_HUNK_ANCHORS_PER_FILE = 4;
/** Rationale candidates quoted into the draft; the rest point at the pack. */
export const MAX_RATIONALE_CANDIDATES = 12;
/**
 * A discussion paragraph is a rationale candidate when it matches this —
 * dig's comment-tell vocabulary widened with decision language.
 */
export const RATIONALE_TELL_RE =
  /\b(because|instead|rather than|so that|decided?|decision|chose|choice|why|trade-?off|workaround|hack|constraint|blocked|reverted?)\b/i;

export interface CaptureResult {
  /** Absolute path of the draft concept file. */
  draftPath: string;
  /** Absolute path of the evidence pack written beside it. */
  evidencePath: string;
  type: "decision" | "attempt";
  candidateCount: number;
  anchorCount: number;
  /** Degradations and collapses, said out loud (also embedded in the draft). */
  notes: string[];
}

export interface CaptureOptions {
  /** Injectable so tests answer gh from fixtures and never hit the network. */
  runner?: CommandRunner;
}

// --- Anchors from the diff's hunks --------------------------------------------

interface CapturedAnchor {
  path: string;
  lines?: string;
  as_of: string;
  state: "live";
}

interface PatchFile {
  path: string;
  deleted: boolean;
  ranges: LineRange[];
}

/**
 * Derive anchor claims from a zero-context (`-U0`) patch: one anchor per
 * hunk's new-side span, exact to the changed lines. A pure deletion anchors
 * the single line the cut sits after; a file with no hunks (binary,
 * rename-only) anchors whole-file; a deleted file anchors nothing; a file
 * with more than MAX_HUNK_ANCHORS_PER_FILE hunks collapses to one whole-file
 * anchor with a note — never a silent cap.
 */
export function anchorsFromPatch(
  patch: string,
  asOf: string,
): { anchors: CapturedAnchor[]; files: string[]; notes: string[] } {
  const files: PatchFile[] = [];
  let current: PatchFile | undefined;
  for (const line of patch.split("\n")) {
    const header = /^diff --git a\/.* b\/(.*)$/.exec(line);
    if (header !== null) {
      current = { path: header[1]!, deleted: false, ranges: [] };
      files.push(current);
      continue;
    }
    if (current === undefined) continue;
    if (/^deleted file mode /.test(line)) current.deleted = true;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk !== null) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (count > 0) {
        current.ranges.push({ start, end: start + count - 1 });
      } else {
        // Pure deletion: new side has no lines; claim the line the cut sits after.
        const at = Math.max(start, 1);
        current.ranges.push({ start: at, end: at });
      }
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));

  const anchors: CapturedAnchor[] = [];
  const notes: string[] = [];
  const touched: string[] = [];
  for (const file of files) {
    touched.push(file.path);
    if (file.deleted) {
      notes.push(`${file.path} was deleted by this change — nothing to anchor there`);
      continue;
    }
    if (file.ranges.length === 0 || file.ranges.length > MAX_HUNK_ANCHORS_PER_FILE) {
      if (file.ranges.length > MAX_HUNK_ANCHORS_PER_FILE) {
        notes.push(`${file.path}: ${file.ranges.length} hunks collapsed into one whole-file anchor`);
      }
      anchors.push({ path: file.path, as_of: asOf, state: "live" });
      continue;
    }
    for (const range of file.ranges) {
      const lines = range.start === range.end ? String(range.start) : `${range.start}-${range.end}`;
      // The anchor machinery must be able to read back every span we write.
      if (parseLineRange(lines) === undefined) {
        throw new CaptureError(`internal: derived an unparseable anchor span ${file.path}:${lines}`);
      }
      anchors.push({ path: file.path, lines, as_of: asOf, state: "live" });
    }
  }
  return { anchors, files: touched, notes };
}

// --- Rationale candidates ------------------------------------------------------

interface RationaleCandidate {
  /** Verbatim text — the draft quotes it, never paraphrases. */
  text: string;
  /** Attribution rendered under the quote, e.g. `PR #7 comment by @bob`. */
  source: string;
}

function rationaleParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== "" && RATIONALE_TELL_RE.test(p));
}

function commentCandidates(
  value: unknown,
  kind: "comment" | "review",
  n: number,
): RationaleCandidate[] {
  const out: RationaleCandidate[] = [];
  for (const c of asComments(value)) {
    const paragraphs = rationaleParagraphs(c.body ?? "");
    if (paragraphs.length === 0) continue;
    out.push({ text: paragraphs.join("\n\n"), source: `PR #${n} ${kind} by ${attribution(c)}` });
  }
  return out;
}

function attribution(c: GhComment): string {
  const login = c.author?.login ?? "unknown";
  const date = (c.createdAt ?? c.submittedAt ?? "").slice(0, 10);
  return date === "" ? `@${login}` : `@${login} (${date})`;
}

// --- Shared assembly -----------------------------------------------------------

function firstLine(text: string): string {
  return text.split("\n").find((l) => l.trim() !== "")?.trim() ?? "";
}

/** Short kebab-case slug from a title; empty when nothing survives. */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, 48).replace(/-+$/, "");
}

/** Origin URL normalized to https, or undefined when none is derivable. */
function remoteHttpsUrl(runner: CommandRunner, repo: string): string | undefined {
  const r = runner("git", ["remote", "get-url", "origin"], repo);
  if (r.status !== 0) return undefined;
  const url = r.stdout.trim();
  const ssh = /^git@([^:]+):(.+)$/.exec(url) ?? /^ssh:\/\/git@([^/]+)\/(.+)$/.exec(url);
  if (ssh !== null) return `https://${ssh[1]}/${ssh[2]!.replace(/\.git$/, "")}`;
  if (/^https?:\/\//.test(url)) return url.replace(/\.git$/, "");
  return undefined;
}

function blockquote(text: string): string {
  return text
    .trimEnd()
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
}

function draftBody(opts: {
  title: string;
  kind: "decision" | "attempt";
  provenance: string;
  candidates: RationaleCandidate[];
  citations: string[];
  notes: string[];
  evidenceName: string;
}): string {
  const lines: string[] = [`# ${opts.title}`, ""];
  lines.push(
    `<!-- capture draft from ${opts.provenance}. Replace this comment with a`,
    `one-paragraph summary: what is true now because of this ${opts.kind}. -->`,
  );
  for (const note of opts.notes) lines.push(`<!-- capture: ${note} -->`);
  lines.push("", "# Why", "");
  lines.push(
    "<!-- Rationale candidates quoted verbatim by `why capture` — keep what states",
    "the why, rewrite it into narrative, and delete the rest. Never keep a claim",
    `the quotes below do not support (DESIGN.md §2). Full evidence pack:`,
    `${DRAFTS_DIRNAME}/${opts.evidenceName} (removed on promote) -->`,
  );
  const shown = opts.candidates.slice(0, MAX_RATIONALE_CANDIDATES);
  for (const candidate of shown) {
    lines.push("", blockquote(candidate.text), "", `— ${candidate.source}`);
  }
  const omitted = opts.candidates.length - shown.length;
  if (omitted > 0) {
    lines.push("", `[capture: ${omitted} more rationale candidate(s) omitted — see the evidence pack]`);
  }
  if (opts.candidates.length === 0) {
    lines.push(
      "",
      "(no rationale candidates found in the evidence — if the why cannot be stated",
      "from the pack, turn this draft into a `question` instead of promoting it)",
    );
  }
  if (opts.citations.length > 0) {
    lines.push("", "# Citations", "", ...opts.citations);
  }
  return `${lines.join("\n")}\n`;
}

interface DraftSpec {
  base: string;
  frontmatter: Record<string, unknown>;
  body: string;
  episode: Episode;
}

/** Write the draft and its evidence pack; refuses to overwrite a draft. */
async function emitDraft(
  bundle: WhyBundle,
  spec: DraftSpec,
  repo: string,
  runner: CommandRunner,
): Promise<{ draftPath: string; evidencePath: string }> {
  const draftsDir = join(bundle.root, DRAFTS_DIRNAME);
  const draftPath = join(draftsDir, `${spec.base}.md`);
  if (existsSync(draftPath)) {
    throw new CaptureError(`${draftPath} already exists — promote or remove it before re-capturing`);
  }
  await mkdir(draftsDir, { recursive: true });
  const pack = await buildEvidencePack(spec.episode, { repo, runner });
  const evidencePath = join(draftsDir, `${spec.base}${EVIDENCE_SUFFIX}`);
  await writeFile(evidencePath, pack.markdown, "utf8");
  await writeFile(draftPath, serializeDocument(spec.frontmatter, spec.body), "utf8");
  return { draftPath, evidencePath };
}

function whyMap(opts: {
  status: string;
  happenedOn?: string;
  candidateCount: number;
  anchors: CapturedAnchor[];
  notes: string[];
}): Record<string, unknown> {
  const why: Record<string, unknown> = { status: opts.status };
  if (opts.happenedOn !== undefined) why.happened_on = opts.happenedOn;
  if (opts.candidateCount > 0) {
    // Verbatim human-written rationale from the time of the change is the
    // `recorded` bar; the promotion step confirms the kept quotes state it.
    why.confidence = "recorded";
  } else {
    opts.notes.push(
      "no rationale candidates found — confidence left unset; consider a question instead of promoting",
    );
  }
  if (opts.anchors.length > 0) why.anchors = opts.anchors;
  return why;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Link text must not break the `[text](url)` citation form. */
function linkText(text: string): string {
  return text.replace(/[[\]]/g, "");
}

// --- `why capture --pr <n>` ----------------------------------------------------

const PR_FIELDS = "state,title,body,author,url,mergedAt,closedAt,mergeCommit,headRefOid,comments,reviews,files";

export async function capturePr(
  bundle: WhyBundle,
  n: number,
  options: CaptureOptions = {},
): Promise<CaptureResult> {
  const runner = options.runner ?? runCommand;
  const repo = dirname(bundle.root);
  const r = runner("gh", ["pr", "view", String(n), "--json", PR_FIELDS], repo);
  if (r.status === 127) {
    throw new CaptureError(
      "gh is not installed or not on PATH — `--pr` needs it; `--commit <sha>` is the gh-free fallback",
    );
  }
  if (r.status !== 0) {
    throw new CaptureError(`gh pr view ${n} failed: ${firstLine(r.stderr) || `exit ${r.status}`}`);
  }
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(r.stdout);
    if (!isPlainMap(parsed)) throw new Error("not an object");
    data = parsed;
  } catch {
    throw new CaptureError(`gh pr view ${n} returned unparseable JSON`);
  }

  const state = asString(data.state);
  if (state === "OPEN") {
    throw new CaptureError(`PR #${n} is still open — capture records outcomes; run it after the merge or close`);
  }
  if (state !== "MERGED" && state !== "CLOSED") {
    throw new CaptureError(`PR #${n} has unexpected state "${String(data.state)}"`);
  }
  const merged = state === "MERGED";
  const type = merged ? "decision" : "attempt";
  const title = asString(data.title) ?? `PR #${n}`;
  const author = isPlainMap(data.author) ? asString(data.author.login) ?? "unknown" : "unknown";
  const notes: string[] = [];

  const whenRaw = merged ? asString(data.mergedAt) : asString(data.closedAt);
  const happenedOn = whenRaw?.slice(0, 10);
  if (happenedOn === undefined) {
    notes.push(`gh reported no ${merged ? "merge" : "close"} date — happened_on left unset`);
  }

  // Anchors come from the merge commit's diff hunks; an attempt's diff never
  // landed on the mainline, so anchoring it there would be silently wrong.
  let anchors: CapturedAnchor[] = [];
  let touched = ghFilePaths(data.files);
  const mergeSha = merged && isPlainMap(data.mergeCommit) ? asString(data.mergeCommit.oid) : undefined;
  let mergeShaLocal = false;
  if (merged) {
    if (mergeSha === undefined) {
      notes.push("gh reported no merge commit — no anchors derived");
    } else if (runner("git", ["rev-parse", "--verify", `${mergeSha}^{commit}`], repo).status !== 0) {
      notes.push(`merge commit ${mergeSha.slice(0, 7)} is not in this clone (fetch first?) — no anchors derived`);
    } else {
      mergeShaLocal = true;
      const patch = runner(
        "git",
        ["show", "-m", "--first-parent", "--format=", "--patch", "--no-color", "-U0", mergeSha],
        repo,
      );
      if (patch.status !== 0) {
        throw new CaptureError(`git show ${mergeSha} failed: ${firstLine(patch.stderr)}`);
      }
      const derived = anchorsFromPatch(patch.stdout, mergeSha);
      anchors = derived.anchors;
      touched = derived.files;
      notes.push(...derived.notes);
    }
  } else {
    notes.push(
      "closed without merging — the diff never landed, so no anchors were derived (anchors are optional on an attempt)",
    );
  }

  const candidates: RationaleCandidate[] = [];
  const prBody = asString(data.body)?.trim();
  if (prBody !== undefined && prBody !== "") {
    candidates.push({ text: prBody, source: `PR #${n} description by @${author}` });
  }
  candidates.push(...commentCandidates(data.comments, "comment", n));
  candidates.push(...commentCandidates(data.reviews, "review", n));

  const citations: string[] = [];
  const url = asString(data.url);
  if (url !== undefined) {
    citations.push(`[1] [PR #${n}: ${linkText(title)}](${url})`);
  } else {
    notes.push("gh reported no PR url — add a citation by hand before promoting");
  }
  const remote = remoteHttpsUrl(runner, repo);
  if (merged && mergeSha !== undefined && remote !== undefined) {
    citations.push(`[${citations.length + 1}] [merge commit ${mergeSha.slice(0, 7)}](${remote}/commit/${mergeSha})`);
  }

  const why = whyMap({
    status: merged ? "active" : "abandoned",
    candidateCount: candidates.length,
    anchors,
    notes,
    happenedOn,
  });
  const frontmatter: Record<string, unknown> = {
    type,
    title,
    description: `Draft captured from PR #${n} — replace with the one-line truth this ${type} created.`,
    why,
  };

  const headRefOid = asString(data.headRefOid);
  let commits: { sha: string }[] = [];
  if (mergeSha !== undefined && mergeShaLocal) {
    commits = [{ sha: mergeSha }];
  } else if (headRefOid !== undefined) {
    commits = [{ sha: headRefOid }];
  }
  const episode: Episode = { id: `pr-${n}`, commits, files: touched, prs: [n], issues: [] };

  const slug = slugify(title);
  const base = slug === "" ? `pr-${n}` : `pr-${n}-${slug}`;
  const provenance = `PR #${n} (${merged ? "merged" : "closed unmerged"}${happenedOn === undefined ? "" : ` ${happenedOn}`})`;
  const body = draftBody({
    title,
    kind: type,
    provenance,
    candidates,
    citations,
    notes,
    evidenceName: `${base}${EVIDENCE_SUFFIX}`,
  });
  const { draftPath, evidencePath } = await emitDraft(bundle, { base, frontmatter, body, episode }, repo, runner);
  return { draftPath, evidencePath, type, candidateCount: candidates.length, anchorCount: anchors.length, notes };
}

function ghFilePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const paths = value
    .filter(isPlainMap)
    .map((f) => asString(f.path))
    .filter((p): p is string => p !== undefined);
  return [...new Set(paths)].sort();
}

// --- `why capture --commit <sha>` ------------------------------------------------

export async function captureCommit(
  bundle: WhyBundle,
  ref: string,
  options: CaptureOptions = {},
): Promise<CaptureResult> {
  const runner = options.runner ?? runCommand;
  const repo = dirname(bundle.root);
  const verify = runner("git", ["rev-parse", "--verify", `${ref}^{commit}`], repo);
  if (verify.status !== 0) {
    throw new CaptureError(`"${ref}" does not name a commit in ${repo}`);
  }
  const sha = verify.stdout.trim();
  const sha7 = sha.slice(0, 7);
  const shown = runner("git", ["show", "-s", "--format=%as%n%B", sha], repo);
  if (shown.status !== 0) {
    throw new CaptureError(`git show ${sha} failed: ${firstLine(shown.stderr)}`);
  }
  const [date, subject, ...rest] = shown.stdout.split("\n");
  const messageBody = rest.join("\n").trim();
  const title = subject?.trim() || `commit ${sha7}`;
  const happenedOn = asString(date?.trim());
  const notes: string[] = [];

  const patch = runner(
    "git",
    ["show", "-m", "--first-parent", "--format=", "--patch", "--no-color", "-U0", sha],
    repo,
  );
  if (patch.status !== 0) {
    throw new CaptureError(`git show ${sha} failed: ${firstLine(patch.stderr)}`);
  }
  const derived = anchorsFromPatch(patch.stdout, sha);
  notes.push(...derived.notes);

  // The commit message body is the only rationale a bare commit can record.
  const candidates: RationaleCandidate[] =
    messageBody === "" ? [] : [{ text: messageBody, source: `commit ${sha7} message` }];

  const remote = remoteHttpsUrl(runner, repo);
  const citations = remote === undefined ? [] : [`[1] [commit ${sha7}](${remote}/commit/${sha})`];
  if (remote === undefined) {
    notes.push("no git remote to build a commit link from — add a citation by hand before promoting");
  }

  const why = whyMap({
    status: "active",
    candidateCount: candidates.length,
    anchors: derived.anchors,
    notes,
    happenedOn,
  });
  const frontmatter: Record<string, unknown> = {
    type: "decision",
    title,
    description: `Draft captured from commit ${sha7} — replace with the one-line truth this decision created.`,
    why,
  };
  const episode: Episode = { id: `commit-${sha7}`, commits: [{ sha }], files: derived.files, prs: [], issues: [] };

  const slug = slugify(title);
  const base = slug === "" ? `commit-${sha7}` : `commit-${sha7}-${slug}`;
  const body = draftBody({
    title,
    kind: "decision",
    provenance: `commit ${sha7}${happenedOn === undefined ? "" : ` (${happenedOn})`}`,
    candidates,
    citations,
    notes,
    evidenceName: `${base}${EVIDENCE_SUFFIX}`,
  });
  const { draftPath, evidencePath } = await emitDraft(bundle, { base, frontmatter, body, episode }, repo, runner);
  return {
    draftPath,
    evidencePath,
    type: "decision",
    candidateCount: candidates.length,
    anchorCount: derived.anchors.length,
    notes,
  };
}

// --- `why capture --promote <draft>` ----------------------------------------------

export interface PromoteResult {
  promoted: boolean;
  /** Bundle-relative target path in the type directory. */
  path: string;
  /** Lint findings on the promoted file (errors when refused, else warnings). */
  findings: Finding[];
}

/**
 * Move one draft into its type directory, gated on lint: the concept is
 * written through okf-mcp writeConcept (which stamps `timestamp` and
 * normalizes citations), the reloaded bundle is linted, and any error-severity
 * finding on the new file rolls the write back and keeps the draft. Findings
 * elsewhere in the bundle never block a promotion.
 */
export async function promoteDraft(bundle: WhyBundle, ref: string, cwd: string): Promise<PromoteResult> {
  const draftsDir = resolve(join(bundle.root, DRAFTS_DIRNAME));
  // A bare name always means a file in the drafts dir; a path resolves as one.
  const inDrafts = join(draftsDir, ref);
  const draftPath =
    basename(ref) === ref || existsSync(inDrafts) ? inDrafts : resolve(cwd, ref);
  if (resolve(dirname(draftPath)) !== draftsDir) {
    throw new CaptureError(`${ref} is not in ${draftsDir} — promotion only moves drafts out of the drafts directory`);
  }
  if (basename(draftPath).endsWith(EVIDENCE_SUFFIX)) {
    throw new CaptureError(`${basename(draftPath)} is an evidence pack, not a draft`);
  }
  if (!existsSync(draftPath)) {
    throw new CaptureError(`no draft at ${draftPath}`);
  }
  const split = splitFrontmatter(await readFile(draftPath, "utf8"));
  if (split.data === null) {
    throw new CaptureError(`${basename(draftPath)}: no parseable frontmatter — a draft must carry the concept's frontmatter`);
  }
  const type = split.data.type;
  if (!isOneOf(CONCEPT_TYPES, type)) {
    throw new CaptureError(
      `${basename(draftPath)}: type "${String(type)}" is not a concept type (${CONCEPT_TYPES.join(", ")})`,
    );
  }
  const relPath = `${type}s/${basename(draftPath)}`;
  try {
    await writeConcept(bundle.root, relPath, split.data as ConceptFrontmatter, split.body, {
      failIfExists: true,
    });
  } catch (e) {
    throw new CaptureError(`cannot promote to ${relPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const fresh = await loadBundle(bundle.root);
  const findings = (await lintBundle(fresh)).filter((f) => f.file === relPath);
  if (findings.some((f) => f.severity === "error")) {
    await rm(join(bundle.root, relPath));
    return { promoted: false, path: relPath, findings };
  }
  await rm(draftPath);
  await rm(draftPath.replace(/\.md$/, EVIDENCE_SUFFIX), { force: true });
  return { promoted: true, path: relPath, findings };
}
