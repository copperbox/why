// `why anchor` (DESIGN.md §4): an anchor is a claim — "at commit as_of, this
// concept was about these lines" — and this module re-evaluates every claim
// against HEAD. Resolution order: symbol-first, then blame-trace, then either
// `unverified` (the path is live but as_of gives nothing to trace from) or
// honestly `lost`. Nothing here may emit a plausible-but-unverified span: no
// failure mode falls through to a guess.
//
// Reading history through `as_of` is gated on ancestry (`historyOrigin`),
// writing `as_of` prefers the newest *surviving* commit but only where the
// span verifiably holds (`stampFor`), and an orphaned `as_of` on a claim that
// re-verifies at HEAD without it is repaired to a durable commit
// (`repairOrphan`). All three exist because a squash merge discards the branch
// commit an anchor was verified at — see DESIGN.md §4 "as_of and squash
// merges".
//
// Writes go through okf-mcp's updateConcept so only the `why.anchors` entries
// change — narrative bodies and every other frontmatter key (timestamp
// included) are untouchable by machinery.

import { execFile } from "node:child_process";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { updateConcept } from "@copperbox/okf-mcp";
import { anchorSpan, normalizePath, parseLineRange, type LineRange } from "./blame.js";
import { isPlainMap, type Anchor, type WhyBundle, type WhyConcept } from "./bundle.js";

const execFileAsync = promisify(execFile);

/** An anchor run that must stop cleanly (exit 1), not crash. */
export class AnchorError extends Error {}

// --- Git plumbing --------------------------------------------------------

/**
 * A read-only view of the repository at HEAD, with per-run caches. Anchor
 * paths are repo-root-relative, so everything resolves from the toplevel.
 * Exported for `why doctor`, whose as_of-freshness check is the same view.
 */
export class GitView {
  private readonly headContent = new Map<string, string | undefined>();
  private readonly renameMaps = new Map<string, Map<string, string> | undefined>();
  private readonly commitShas = new Map<string, string | undefined>();
  private readonly ancestry = new Map<string, boolean>();
  private readonly revContent = new Map<string, string | undefined>();
  private survivingBaseCache?: { sha: string | undefined };

  private constructor(
    readonly root: string,
    readonly headFull: string,
    readonly headShort: string,
  ) {}

  static async open(startDir: string): Promise<GitView> {
    let root: string;
    try {
      root = (await run(startDir, ["rev-parse", "--show-toplevel"])).trim();
    } catch {
      throw new AnchorError(
        `${startDir} is not inside a git work tree — anchors resolve against the repo enclosing the bundle`,
      );
    }
    let headFull: string;
    try {
      headFull = (await run(root, ["rev-parse", "HEAD"])).trim();
    } catch {
      throw new AnchorError(`${root} has no commits yet — nothing for anchors to resolve against`);
    }
    const headShort = (await run(root, ["rev-parse", "--short", "HEAD"])).trim();
    return new GitView(root, headFull, headShort);
  }

  /** File content at HEAD, or undefined when the path does not exist there. */
  async fileAtHead(path: string): Promise<string | undefined> {
    if (!this.headContent.has(path)) {
      let content: string | undefined;
      try {
        content = await run(this.root, ["show", `HEAD:${path}`]);
      } catch {
        content = undefined;
      }
      this.headContent.set(path, content);
    }
    return this.headContent.get(path);
  }

  /** Full sha of a commit-ish, or undefined when it does not resolve. */
  async commitSha(rev: string): Promise<string | undefined> {
    if (!this.commitShas.has(rev)) {
      let sha: string | undefined;
      try {
        sha = (await run(this.root, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`])).trim();
      } catch {
        sha = undefined;
      }
      this.commitShas.set(rev, sha);
    }
    return this.commitShas.get(rev);
  }

  /** Whether `sha` is an ancestor of (or equal to) HEAD. */
  async isAncestor(sha: string): Promise<boolean> {
    if (!this.ancestry.has(sha)) {
      this.ancestry.set(sha, await this.contains("HEAD", sha));
    }
    return this.ancestry.get(sha)!;
  }

  private async contains(ref: string, sha: string): Promise<boolean> {
    try {
      await run(this.root, ["merge-base", "--is-ancestor", sha, ref]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * An `as_of` usable as a history origin, or undefined. Usable means it both
   * resolves *and* is an ancestor of HEAD. Ancestry is not pedantry: git will
   * happily diff or blame between two commits that share no history, so an
   * `as_of` a squash merge discarded still answers rename questions in a clone
   * that kept the branch it lived on, and answers nothing in a clone that did
   * not. Ancestry is the only property of an `as_of` that every clone of the
   * same history agrees on, so it is the gate for reading history through one.
   */
  async historyOrigin(asOf: string | undefined): Promise<string | undefined> {
    if (asOf === undefined) return undefined;
    const sha = await this.commitSha(asOf);
    if (sha === undefined) return undefined;
    return (await this.isAncestor(sha)) ? sha : undefined;
  }

  /** File content at an arbitrary commit, or undefined when absent there. */
  async fileAt(rev: string, path: string): Promise<string | undefined> {
    const key = `${rev}:${path}`;
    if (!this.revContent.has(key)) {
      let content: string | undefined;
      try {
        content = await run(this.root, ["show", `${rev}:${path}`]);
      } catch {
        content = undefined;
      }
      this.revContent.set(key, content);
    }
    return this.revContent.get(key);
  }

  async shortSha(rev: string): Promise<string> {
    return (await run(this.root, ["rev-parse", "--short", rev])).trim();
  }

  /**
   * The newest commit certain to outlive this branch: the merge-base with the
   * integration branch git records as the remote's default
   * (`refs/remotes/origin/HEAD`). Undefined when there is no such record —
   * nothing to be certain about — or when HEAD is already contained in it, in
   * which case HEAD survives and is the honest stamp. See `stampFor`.
   */
  async survivingBase(): Promise<string | undefined> {
    if (this.survivingBaseCache === undefined) {
      this.survivingBaseCache = { sha: await this.computeSurvivingBase() };
    }
    return this.survivingBaseCache.sha;
  }

  private async computeSurvivingBase(): Promise<string | undefined> {
    let ref: string;
    try {
      ref = (await run(this.root, ["symbolic-ref", "refs/remotes/origin/HEAD"])).trim();
    } catch {
      return undefined; // no recorded integration branch — HEAD is all we know
    }
    if (await this.contains(ref, this.headFull)) return undefined; // HEAD survives as-is
    try {
      return (await run(this.root, ["merge-base", "HEAD", ref])).trim();
    } catch {
      return undefined; // unrelated histories — nothing shared to fall back to
    }
  }

  /**
   * Where git's rename/copy detection says `path` went between `asOf` and
   * HEAD — the "git history connects them" gate for following a symbol into
   * a different file (DESIGN.md §4 step 1).
   */
  async renamedTo(asOf: string, path: string): Promise<string | undefined> {
    if (!this.renameMaps.has(asOf)) {
      let map: Map<string, string> | undefined;
      try {
        const out = await run(this.root, ["diff", "--name-status", "-M", "-C", asOf, "HEAD"]);
        map = new Map();
        for (const line of out.split("\n")) {
          const [status, from, to] = line.split("\t");
          if (status && from && to && (status.startsWith("R") || status.startsWith("C"))) {
            map.set(from, to);
          }
        }
      } catch {
        map = undefined; // asOf unresolvable — no history to connect through
      }
      this.renameMaps.set(asOf, map);
    }
    return this.renameMaps.get(asOf)?.get(path);
  }

  /**
   * Blame-trace (DESIGN.md §4 step 2): follow the anchored lines forward from
   * `asOf` with reverse blame. Lines annotated with HEAD's sha still exist at
   * HEAD — their positions (and file, since blame follows whole-file renames)
   * are the new claim. No surviving lines → the trace honestly fails.
   */
  async traceLines(path: string, range: LineRange, asOf: string): Promise<
    { path: string; lines: LineRange } | undefined
  > {
    let out: string;
    try {
      out = await run(this.root, [
        "blame",
        "--reverse",
        "--porcelain",
        `-L${range.start},${range.end}`,
        `${asOf}..HEAD`,
        "--",
        path,
      ]);
    } catch {
      return undefined; // bad range at asOf, unrelated history, etc.
    }
    const filenames = new Map<string, string>();
    const survivors: number[] = [];
    let current: string | undefined;
    for (const line of out.split("\n")) {
      const header = /^([0-9a-f]{40}) (\d+) \d+(?: \d+)?$/.exec(line);
      if (header) {
        current = header[1]!;
        if (current === this.headFull) survivors.push(Number(header[2]));
        continue;
      }
      if (current !== undefined && line.startsWith("filename ")) {
        filenames.set(current, line.slice("filename ".length));
      }
    }
    if (survivors.length === 0) return undefined;
    return {
      path: filenames.get(this.headFull) ?? path,
      lines: { start: Math.min(...survivors), end: Math.max(...survivors) },
    };
  }
}

async function run(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

// --- Symbol resolution (grep heuristic) ----------------------------------
//
// The fallback DESIGN.md §4 names until the tree-sitter resolver lands. It
// never guesses: zero matches or more than one definition-looking line both
// fail the symbol step, and resolution falls through to blame-trace.

const DEF_KEYWORDS = new Set([
  "fn", "func", "function", "def", "class", "struct", "enum", "trait",
  "interface", "impl", "type", "const", "static", "let", "var", "val",
]);

const COMMENT_LINE = /^\s*(?:\/\/|#|;|\*|--)/;

function isDefinitionLine(line: string, symbol: string): boolean {
  if (COMMENT_LINE.test(line)) return false;
  const word = new RegExp(`(?<![A-Za-z0-9_$])${escapeRegExp(symbol)}(?![A-Za-z0-9_$])`);
  const at = line.search(word);
  if (at < 0) return false;
  const before = line.slice(0, at);
  if (before.split(/[^A-Za-z0-9_$]+/).some((token) => DEF_KEYWORDS.has(token))) return true;
  // Assignment/config form: the symbol opens the line and is immediately
  // bound — `request_deadline = 47`, `acquire_shared:`, `handler(...)`.
  return before.trim() === "" && /^\s*[:=(]/.test(line.slice(at + symbol.length));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** End of a `{}`-delimited block opened on the definition line or the next. */
function braceBlockEnd(lines: string[], start: number): number | undefined {
  let depth = 0;
  let opened = false;
  for (let i = start; i < lines.length; i++) {
    if (!opened && i > start + 1) return undefined;
    for (const ch of lines[i]!) {
      if (ch === "{") {
        depth++;
        opened = true;
      } else if (ch === "}" && opened) {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return undefined; // unbalanced — refuse to guess a span
}

/** Last line more indented than the definition (Python-style block). */
function indentBlockEnd(lines: string[], start: number): number {
  const indent = indentOf(lines[start]!);
  let end = start;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i]!.trim() === "") continue;
    if (indentOf(lines[i]!) <= indent) break;
    end = i;
  }
  return end;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * The 1-based line span of `symbol`'s definition in `content`, or undefined
 * when the symbol is absent or ambiguous. Exported for issue #10's torture
 * harness and for the doctor's diagnostics.
 */
export function findSymbolSpan(content: string, symbol: string): LineRange | undefined {
  const lines = content.split("\n");
  const definitions: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isDefinitionLine(lines[i]!, symbol)) definitions.push(i);
  }
  if (definitions.length !== 1) return undefined;
  const start = definitions[0]!;
  const end = braceBlockEnd(lines, start) ?? indentBlockEnd(lines, start);
  return { start: start + 1, end: end + 1 };
}

// --- Resolution ----------------------------------------------------------

/** What the claim resolves to at HEAD; lines stay absent for whole-file anchors. */
interface ResolvedSpan {
  path: string;
  lines?: LineRange;
}

/**
 * The outcome of re-evaluating one claim.
 *
 * `unverified` is the honest middle the resolver used to lack: the anchor's
 * path is confirmed at HEAD, but its `as_of` is unusable as a history origin
 * (see `GitView.historyOrigin`), so the *line* claim cannot be re-traced. The
 * anchor is not lost — the code is right there — but nothing here may re-line
 * it either. Collapsing this case into `lost` is what made a squash-orphaned
 * `as_of` read as rotted code; collapsing it into `span` would assert a range
 * nothing verified. It is its own answer.
 */
type Claim =
  | { kind: "span"; span: ResolvedSpan }
  | { kind: "unverified" }
  | { kind: "lost" };

/** DESIGN.md §4 resolution order for one anchor. */
async function resolveClaim(git: GitView, anchor: Anchor): Promise<Claim> {
  const path = normalizePath(anchor.path);
  const range = anchor.lines === undefined ? undefined : parseLineRange(anchor.lines);
  const origin = await git.historyOrigin(anchor.as_of);

  // 1. Symbol-first: same file, then a git-connected rename target. A found
  //    symbol re-lines the claim; a whole-file anchor keeps its granularity.
  if (anchor.symbol !== undefined) {
    const found = await findSymbolAtHead(git, anchor, path, origin);
    if (found) return { kind: "span", span: found };
  }

  // Whole-file anchors (no lines) claim the file itself: existence is the
  // whole claim — unless a symbol was set and is now gone, which step 1
  // already failed to find, and asserting "live" would outrun the evidence.
  if (anchor.lines === undefined) {
    if (anchor.symbol !== undefined) return { kind: "lost" };
    if ((await git.fileAtHead(path)) !== undefined) return { kind: "span", span: { path } };
    if (origin !== undefined) {
      const renamed = await git.renamedTo(origin, path);
      if (renamed !== undefined && (await git.fileAtHead(renamed)) !== undefined) {
        return { kind: "span", span: { path: renamed } };
      }
    }
    return { kind: "lost" };
  }

  // 2. Blame-trace the recorded lines from as_of forward.
  if (range === undefined) return { kind: "lost" };
  if (origin === undefined) {
    // No usable origin to trace from. The file still being at HEAD confirms
    // the anchor is not lost; the lines stay exactly as recorded, unverified.
    return (await git.fileAtHead(path)) !== undefined ? { kind: "unverified" } : { kind: "lost" };
  }
  if (origin === git.headFull) {
    // The claim is already about HEAD; verify it instead of tracing.
    const content = await git.fileAtHead(path);
    if (content === undefined) return { kind: "lost" };
    return range.end <= content.split("\n").length
      ? { kind: "span", span: { path, lines: range } }
      : { kind: "lost" };
  }
  const traced = await git.traceLines(path, range, origin);
  return traced === undefined ? { kind: "lost" } : { kind: "span", span: traced };
}

async function findSymbolAtHead(
  git: GitView,
  anchor: Anchor,
  path: string,
  origin: string | undefined,
): Promise<ResolvedSpan | undefined> {
  const candidates = [path];
  if ((await git.fileAtHead(path)) === undefined && origin !== undefined) {
    const renamed = await git.renamedTo(origin, path);
    if (renamed !== undefined) candidates.push(renamed);
  }
  for (const candidate of candidates) {
    const content = await git.fileAtHead(candidate);
    if (content === undefined) continue;
    const span = findSymbolSpan(content, anchor.symbol!);
    if (span) {
      return anchor.lines === undefined ? { path: candidate } : { path: candidate, lines: span };
    }
  }
  return undefined;
}

// --- Classification and the report ---------------------------------------

export type AnchorOutcome = "current" | "resolved" | "moved" | "repaired" | "unverified" | "lost";

/**
 * The commit to record as `as_of` for a re-anchored claim.
 *
 * HEAD is the commit the span was actually verified against, so HEAD is the
 * default and is always truthful. But when HEAD sits on a branch that will not
 * reach the integration branch verbatim — a squash merge rewrites the whole
 * branch into one new commit — a truthful HEAD stamp is about to become an
 * `as_of` that names nothing. So prefer the newest surviving commit, but only
 * when the very same span verifiably holds there.
 *
 * The verification is the point, not a nicety. For a span this branch just
 * changed, the merge-base is precisely where the span is *not* valid, and
 * `git blame --reverse` reads `-L` against the `as_of` revision — so stamping
 * an unverified merge-base would silently re-point the anchor at whatever text
 * occupied those line numbers back then. That is the silently-wrong anchor
 * this module exists to prevent, so an unverifiable merge-base loses to HEAD
 * every time, orphan or not. `resolveClaim` degrades such an orphan to
 * `unverified` rather than `lost`, and `why doctor` reports the gap.
 */
async function stampFor(git: GitView, span: ResolvedSpan): Promise<string> {
  const base = await git.survivingBase();
  if (base === undefined) return git.headShort;
  return (await spanHoldsAt(git, base, span)) ? await git.shortSha(base) : git.headShort;
}

/**
 * Whether `span` names the same code at `rev` that it names at HEAD.
 *
 * The question is identity, not resemblance. Comparing the text at those line
 * numbers answers the wrong one: a span this branch shifted can land on numbers
 * that coincidentally held byte-identical text at `rev` — a duplicated config
 * block, boilerplate, a repeated import — and stamping `rev` then re-points the
 * anchor at that other code. So ask git, with the same reverse blame the
 * resolver uses: an `as_of` is honest exactly when re-resolving from it
 * reproduces this span. That equivalence is also what keeps `why anchor`
 * idempotent — a stamp it writes is one the next run re-derives, rather than
 * one the next run re-traces to the wrong code and calls `lost`.
 *
 * A whole-file anchor claims its path, so the path existing at `rev` is the
 * whole claim; there is no span to re-derive.
 */
async function spanHoldsAt(git: GitView, rev: string, span: ResolvedSpan): Promise<boolean> {
  const there = await git.fileAt(rev, span.path);
  if (there === undefined) return false;
  if (span.lines === undefined) return true;
  const traced = await git.traceLines(span.path, span.lines, rev);
  return (
    traced !== undefined &&
    traced.path === span.path &&
    traced.lines.start === span.lines.start &&
    traced.lines.end === span.lines.end
  );
}

/**
 * The repaired result for an otherwise-current anchor whose recorded `as_of`
 * is orphaned, or undefined when there is nothing to repair — or nothing
 * durable to repair it with.
 *
 * A readable `as_of` — a clean ancestor of HEAD — is provenance: it means the
 * span survived unchanged since that commit, and it is never rewritten
 * (.why/decisions/as-of-is-provenance.md). An orphaned `as_of` means nothing:
 * no clone of the integration branch resolves it (typically a squash merge
 * discarded the branch commit it names), and because the anchor still resolves
 * cleanly, no re-anchoring would ever touch it — the one `why doctor` finding
 * nothing could clear. Repair is honest exactly because a claim that reaches
 * the `current` classification with an unusable origin was verified at HEAD
 * without reading `as_of` at all: the path exists, or the symbol was re-found.
 * (A bare line claim with an unusable origin is `unverified` and never gets
 * here — re-stamping it would assert lines nothing verified.)
 *
 * The stamp must be durable, or the next squash recreates the orphan. Where
 * `survivingBase` is undefined — HEAD is on the integration branch, or git
 * records no integration branch and HEAD is all there is — HEAD is that stamp.
 * On a branch that has diverged from the integration branch it is the
 * merge-base, and only when the span verifiably holds there; otherwise repair
 * declines and leaves the orphan to the post-merge run on the integration
 * branch, rather than write a branch HEAD the squash will discard and
 * re-orphan.
 */
async function repairOrphan(
  git: GitView,
  anchor: Anchor,
  span: ResolvedSpan,
): Promise<Omit<AnchorResult, "conceptId" | "index"> | undefined> {
  if (anchor.as_of === undefined) return undefined; // nothing recorded, nothing to repair
  if ((await git.historyOrigin(anchor.as_of)) !== undefined) return undefined; // readable provenance — keep it
  const base = await git.survivingBase();
  if (base !== undefined && !(await spanHoldsAt(git, base, span))) return undefined;
  // Everything but the unreadable as_of was confirmed at HEAD, so everything
  // but as_of is kept exactly as written.
  const after: Anchor = { ...anchor, as_of: base === undefined ? git.headShort : await git.shortSha(base) };
  return { before: anchor, after, outcome: "repaired", changed: true, recovered: false };
}

export interface AnchorResult {
  conceptId: string;
  /** Position within the concept's why.anchors list. */
  index: number;
  before: Anchor;
  /** The anchor as it should read now; equals `before` when nothing changed. */
  after: Anchor;
  outcome: AnchorOutcome;
  /** Whether the bundle file needs (or, under --check, would need) a write. */
  changed: boolean;
  /** A lost anchor that resolved back to live — DESIGN.md's recovery case. */
  recovered: boolean;
}

export interface AnchorReport {
  /** Short sha the run resolved against. */
  head: string;
  results: AnchorResult[];
  /** Concepts left untouched because their why.anchors have schema problems. */
  skipped: string[];
}

function formatLines(range: LineRange): string {
  return range.start === range.end ? String(range.start) : `${range.start}-${range.end}`;
}

function sameLines(before: string | undefined, after: LineRange | undefined): boolean {
  if (before === undefined || after === undefined) return before === undefined && after === undefined;
  const parsed = parseLineRange(before);
  return parsed !== undefined && parsed.start === after.start && parsed.end === after.end;
}

async function classify(
  git: GitView,
  anchor: Anchor,
  claim: Claim,
): Promise<Omit<AnchorResult, "conceptId" | "index">> {
  if (claim.kind === "lost") {
    // Lost keeps every last-known value (forensics + the recovery path);
    // only the state flips, and only once.
    const after: Anchor = { ...anchor, state: "lost" };
    return { before: anchor, after, outcome: "lost", changed: anchor.state !== "lost", recovered: false };
  }
  if (claim.kind === "unverified") {
    // The path is confirmed at HEAD but as_of gives nothing to trace from, so
    // the recorded lines can be neither re-lined nor honestly rewritten. Leave
    // the entry byte-for-byte as written and let `why doctor` name the gap.
    return { before: anchor, after: anchor, outcome: "unverified", changed: false, recovered: false };
  }
  const span = claim.span;
  const wasLive = (anchor.state ?? "live") === "live";
  if (span.path === normalizePath(anchor.path) && sameLines(anchor.lines, span.lines) && wasLive) {
    return (
      (await repairOrphan(git, anchor, span)) ?? {
        before: anchor,
        after: anchor,
        outcome: "current",
        changed: false,
        recovered: false,
      }
    );
  }
  const after: Anchor = { path: span.path };
  if (anchor.symbol !== undefined) after.symbol = anchor.symbol;
  if (span.lines !== undefined) after.lines = formatLines(span.lines);
  after.as_of = await stampFor(git, span);
  after.state = "live";
  return {
    before: anchor,
    after,
    outcome: span.path === normalizePath(anchor.path) ? "resolved" : "moved",
    changed: true,
    recovered: !wasLive,
  };
}

export interface ResolveOptions {
  /** Scope the run to one concept, by id or bundle-relative path. */
  concept?: string;
}

function findConcept(bundle: WhyBundle, idOrPath: string): WhyConcept | undefined {
  const id = idOrPath.replace(/\.md$/, "");
  return bundle.concepts.get(id) ?? [...bundle.concepts.values()].find((c) => c.path === idOrPath);
}

/** Re-evaluate every anchor claim in the bundle against HEAD. Pure read. */
export async function resolveAnchors(
  bundle: WhyBundle,
  options: ResolveOptions = {},
): Promise<AnchorReport> {
  const git = await GitView.open(dirname(bundle.root));
  let concepts = [...bundle.concepts.values()];
  if (options.concept !== undefined) {
    const scoped = findConcept(bundle, options.concept);
    if (scoped === undefined) {
      throw new AnchorError(`no concept "${options.concept}" in the bundle at ${bundle.root}`);
    }
    concepts = [scoped];
  }
  // A concept whose anchor data has schema problems is never rewritten:
  // regenerating its list from the typed view would silently drop the
  // malformed entries. `why lint` owns reporting those.
  const problematic = new Set(
    bundle.diagnostics.filter((d) => d.field.startsWith("why.anchors")).map((d) => d.path),
  );
  const results: AnchorResult[] = [];
  const skipped: string[] = [];
  for (const concept of concepts) {
    if (problematic.has(concept.path)) {
      skipped.push(concept.id);
      continue;
    }
    for (const [index, anchor] of concept.why.anchors.entries()) {
      const claim = await resolveClaim(git, anchor);
      results.push({ conceptId: concept.id, index, ...(await classify(git, anchor, claim)) });
    }
  }
  return { head: git.headShort, results, skipped };
}

// --- Writes ----------------------------------------------------------------

/** Anchor entry in DESIGN.md's key order; single lines stay bare numbers. */
function anchorEntry(anchor: Anchor): Record<string, unknown> {
  const entry: Record<string, unknown> = { path: anchor.path };
  if (anchor.symbol !== undefined) entry.symbol = anchor.symbol;
  if (anchor.lines !== undefined) entry.lines = /^\d+$/.test(anchor.lines) ? Number(anchor.lines) : anchor.lines;
  if (anchor.as_of !== undefined) entry.as_of = anchor.as_of;
  if (anchor.state !== undefined) entry.state = anchor.state;
  return entry;
}

/**
 * Persist the changed anchors through okf-mcp's updateConcept: a frontmatter
 * patch of the `why` map with `keepTimestamp`, so the body and every other
 * key survive byte-for-byte. Returns the concept ids written.
 */
export async function writeAnchorUpdates(bundle: WhyBundle, report: AnchorReport): Promise<string[]> {
  const changedByConcept = new Map<string, AnchorResult[]>();
  for (const result of report.results) {
    if (!result.changed) continue;
    const group = changedByConcept.get(result.conceptId) ?? [];
    group.push(result);
    changedByConcept.set(result.conceptId, group);
  }
  const written: string[] = [];
  for (const [conceptId, changes] of changedByConcept) {
    const concept = bundle.concepts.get(conceptId)!;
    const rawWhy = isPlainMap(concept.frontmatter.why) ? concept.frontmatter.why : {};
    // Unchanged entries keep their raw form (indexes align 1:1 because
    // concepts with anchor diagnostics were skipped during resolution).
    const anchors = Array.isArray(rawWhy.anchors) ? [...rawWhy.anchors] : [];
    for (const change of changes) anchors[change.index] = anchorEntry(change.after);
    await updateConcept(bundle.okf, conceptId, {
      frontmatter: { why: { ...rawWhy, anchors } },
      keepTimestamp: true,
    });
    written.push(conceptId);
  }
  return written;
}

// --- Rendering -------------------------------------------------------------

function detailFor(result: AnchorResult): string {
  switch (result.outcome) {
    case "current":
      return anchorSpan(result.before);
    case "lost":
      return `${anchorSpan(result.before)} (last known${result.before.as_of === undefined ? "" : `, as_of ${result.before.as_of}`})`;
    case "unverified":
      return `${anchorSpan(result.before)} (path live; as_of ${result.before.as_of ?? "unset"} is not an ancestor of HEAD)`;
    case "repaired":
      return `${anchorSpan(result.before)} (orphaned as_of ${result.before.as_of} → ${result.after.as_of})`;
    default:
      return `${anchorSpan(result.before)} → ${anchorSpan(result.after)}`;
  }
}

const OUTCOME_LABELS: Record<AnchorOutcome, string> = {
  current: "already current",
  resolved: "resolved",
  moved: "moved",
  repaired: "repaired as_of",
  unverified: "unverified as_of",
  lost: "lost",
};

export function renderAnchorReport(
  report: AnchorReport,
  mode: { check: boolean; written: string[]; allowDrift?: boolean },
): string[] {
  const lines: string[] = [];
  const counts: Record<AnchorOutcome, number> = { current: 0, resolved: 0, moved: 0, repaired: 0, unverified: 0, lost: 0 };
  for (const result of report.results) counts[result.outcome]++;

  const total = report.results.length;
  lines.push(`why anchor: ${total} anchor${total === 1 ? "" : "s"} checked against HEAD ${report.head}`);
  if (total > 0) {
    lines.push("");
    const idWidth = Math.max(...report.results.map((r) => r.conceptId.length));
    for (const result of report.results) {
      const label = OUTCOME_LABELS[result.outcome] + (result.recovered ? " (recovered)" : "");
      lines.push(`  ${label.padEnd(21)} ${result.conceptId.padEnd(idWidth)}  ${detailFor(result)}`);
    }
    lines.push("");
    // Repaired and unverified surface only when non-zero: both are rare and
    // worth reading, and a permanent `0` would train the eye past them.
    const tally = [`${counts.moved} moved`, `${counts.resolved} resolved`];
    if (counts.repaired > 0) tally.push(`${counts.repaired} repaired as_of`);
    tally.push(`${counts.lost} lost`);
    if (counts.unverified > 0) tally.push(`${counts.unverified} unverified as_of`);
    tally.push(`${counts.current} already current`);
    lines.push(tally.join(" · "));
  }
  for (const conceptId of report.skipped) {
    lines.push(`skipped ${conceptId}: its why.anchors have schema problems — run \`why lint\``);
  }
  const changed = report.results.filter((r) => r.changed).length;
  const destroyed = report.results.filter((r) => r.outcome === "lost" && r.changed).length;
  if (mode.check && mode.allowDrift === true) {
    // The PR gate's reading: this branch's HEAD is about to be squashed away,
    // so telling the author to run `why anchor` here would stamp an as_of that
    // names nothing (DESIGN.md §4). Drift is the why-anchor job's problem;
    // only an anchor this change destroyed is the author's.
    if (destroyed > 0) {
      lines.push(
        `${destroyed} anchor${destroyed === 1 ? "" : "s"} lost — the code ${destroyed === 1 ? "it claims" : "they claim"} is gone. Update the concept${destroyed === 1 ? "" : "s"} or re-dig; no re-anchoring can recover ${destroyed === 1 ? "it" : "them"}.`,
      );
    }
    const drifted = changed - destroyed;
    if (drifted > 0) {
      lines.push(
        `${drifted} anchor${drifted === 1 ? "" : "s"} drifted — the why-anchor job re-stamps ${drifted === 1 ? "it" : "them"} from main after the merge (nothing written)`,
      );
    }
  } else if (mode.check) {
    if (changed > 0) {
      lines.push(`${changed} anchor${changed === 1 ? "" : "s"} out of date — run \`why anchor\` to update (nothing written)`);
    }
  } else if (mode.written.length > 0) {
    lines.push(`updated why.anchors in ${mode.written.length} concept${mode.written.length === 1 ? "" : "s"}`);
  }
  return lines;
}
