// Anchor index (DESIGN.md §4, §7 step 1): the shared span→concept lookup
// layer `blame`, `anchor`, and `doctor` sit on. Built in memory from every
// concept's `why.anchors`, cached on disk under `<bundle>/.cache/` keyed by
// (bundle content hash, repo HEAD) — a key mismatch always rebuilds, so the
// cache is fresh or discarded, never silently stale. Lookup distinguishes
// live from `lost` anchors and reports per hit whether `as_of` still names
// HEAD; re-resolving stale anchors belongs to `why anchor`, not this layer.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Anchor, WhyBundle } from "./bundle.js";

export interface LineRange {
  start: number;
  end: number;
}

/** A code span to look up: a whole file, or a 1-based inclusive line range. */
export interface SpanQuery {
  path: string;
  lines?: LineRange;
}

/** Parse an anchor's `lines` value (`"41-58"` or `"31"`). */
export function parseLineRange(lines: string): LineRange | undefined {
  const match = /^(\d+)\s*-\s*(\d+)$|^(\d+)$/.exec(lines.trim());
  if (!match) return undefined;
  const start = Number(match[1] ?? match[3]);
  const end = Number(match[2] ?? match[3]);
  return start >= 1 && end >= start ? { start, end } : undefined;
}

/** One anchor as indexed: where it came from, plus its parsed span. */
export interface IndexEntry {
  conceptId: string;
  /** Position in the concept's `why.anchors` list — names the entry for rewrites. */
  anchorIndex: number;
  /** The anchor exactly as written in frontmatter. */
  anchor: Anchor;
  /** Parsed `lines`; absent for whole-file anchors and unparseable spans. */
  range?: LineRange;
  /** True only when `as_of` was confirmed to name the HEAD the index saw. */
  matchesHead: boolean;
}

/**
 * The per-path buckets. Unparseable `lines` values get their own bucket: such
 * an anchor cannot verifiably cover any line span (matching it would risk a
 * silently-wrong answer), but a whole-file query still names it — the same
 * semantics `why blame` shipped with in Phase 1.
 */
interface PathBucket {
  /** Live anchors with no `lines` — whole-file claims, covering every span. */
  wholeFile: IndexEntry[];
  /** Live ranged anchors, ordered by range start. */
  intervals: IndexEntry[];
  /** Live anchors whose `lines` value does not parse. */
  unparseable: IndexEntry[];
  /** `state: lost` anchors — last-known locations, not live claims. */
  lost: IndexEntry[];
}

export interface AnchorIndex {
  /** Repo HEAD the index was built against; absent outside a git repo. */
  head?: string;
  paths: Map<string, PathBucket>;
}

/** One lookup result: which concept claims the span, and on what evidence. */
export interface AnchorHit {
  conceptId: string;
  anchorIndex: number;
  anchor: Anchor;
  /**
   * True unless `as_of` names the HEAD the index was built against. A missing
   * `as_of` or an unknown HEAD is stale too: unverifiable is never fresh.
   */
  stale: boolean;
}

/** Whether `as_of` names `head` exactly or as an abbreviated (≥4 char) prefix. */
function asOfMatchesHead(asOf: string | undefined, head: string | undefined): boolean {
  if (asOf === undefined || head === undefined) return false;
  const abbrev = asOf.toLowerCase();
  return abbrev.length >= 4 && head.toLowerCase().startsWith(abbrev);
}

/** HEAD of the git repo enclosing `dir`; undefined outside one (or before any commit). */
export function resolveHead(dir: string): string | undefined {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" });
  const head = result.status === 0 ? result.stdout.trim() : "";
  return head === "" ? undefined : head;
}

function emptyBucket(): PathBucket {
  return { wholeFile: [], intervals: [], unparseable: [], lost: [] };
}

/** Build the span→concept index from every concept's `why.anchors`. */
export function buildAnchorIndex(bundle: WhyBundle, head?: string): AnchorIndex {
  const paths = new Map<string, PathBucket>();
  for (const concept of bundle.concepts.values()) {
    concept.why.anchors.forEach((anchor, anchorIndex) => {
      let bucket = paths.get(anchor.path);
      if (!bucket) {
        bucket = emptyBucket();
        paths.set(anchor.path, bucket);
      }
      const range = anchor.lines === undefined ? undefined : parseLineRange(anchor.lines);
      const entry: IndexEntry = {
        conceptId: concept.id,
        anchorIndex,
        anchor,
        matchesHead: asOfMatchesHead(anchor.as_of, head),
      };
      if (range) entry.range = range;
      if (anchor.state === "lost") bucket.lost.push(entry);
      else if (anchor.lines === undefined) bucket.wholeFile.push(entry);
      else if (range) bucket.intervals.push(entry);
      else bucket.unparseable.push(entry);
    });
  }
  for (const bucket of paths.values()) {
    bucket.intervals.sort(
      (a, b) => a.range!.start - b.range!.start || a.range!.end - b.range!.end,
    );
  }
  const index: AnchorIndex = { paths };
  if (head !== undefined) index.head = head;
  return index;
}

/** Whether an indexed entry's span covers the queried span. */
function covers(entry: IndexEntry, query: SpanQuery): boolean {
  if (entry.anchor.lines === undefined) return true; // whole-file claim
  if (!query.lines) return true; // whole-file query names every anchor on the path
  if (!entry.range) return false; // unparseable span cannot verifiably cover lines
  return entry.range.start <= query.lines.end && query.lines.start <= entry.range.end;
}

export interface LookupOptions {
  /** Also return `lost` anchors whose last-known span covers the query. */
  includeLost?: boolean;
}

/** Every anchor covering `query`: live ones by default, lost ones on request. */
export function lookupAnchors(
  index: AnchorIndex,
  query: SpanQuery,
  options: LookupOptions = {},
): AnchorHit[] {
  const bucket = index.paths.get(query.path);
  if (!bucket) return [];
  const matched: IndexEntry[] = [...bucket.wholeFile];
  if (query.lines) {
    for (const entry of bucket.intervals) {
      if (entry.range!.start > query.lines.end) break; // ordered by start
      if (covers(entry, query)) matched.push(entry);
    }
  } else {
    matched.push(...bucket.intervals, ...bucket.unparseable);
  }
  if (options.includeLost === true) {
    matched.push(...bucket.lost.filter((entry) => covers(entry, query)));
  }
  return matched.map((entry) => ({
    conceptId: entry.conceptId,
    anchorIndex: entry.anchorIndex,
    anchor: entry.anchor,
    stale: !entry.matchesHead,
  }));
}

// --- Disk cache ----------------------------------------------------------------

export const CACHE_DIRNAME = ".cache";
const INDEX_CACHE_FILENAME = "anchor-index.json";
const CACHE_VERSION = 1;

interface SerializedBucket extends PathBucket {
  path: string;
}

interface CacheFile {
  version: number;
  bundleHash: string;
  head: string | null;
  paths: SerializedBucket[];
}

/**
 * Content hash of the bundle: every `.md` file under the root (dot
 * directories excluded — `.cache` must not invalidate itself), by path and
 * bytes, so any concept edit, addition, removal, or rename changes the key.
 */
export async function bundleContentHash(root: string): Promise<string> {
  const files: string[] = [];
  await listMarkdown(root, "", files);
  files.sort();
  const hash = createHash("sha256");
  for (const rel of files) {
    hash.update(rel);
    hash.update("\0");
    hash.update(await readFile(join(root, rel)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function listMarkdown(dir: string, prefix: string, out: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await listMarkdown(join(dir, entry.name), rel, out);
    else if (entry.name.endsWith(".md")) out.push(rel);
  }
}

function serializeIndex(index: AnchorIndex, bundleHash: string): CacheFile {
  return {
    version: CACHE_VERSION,
    bundleHash,
    head: index.head ?? null,
    paths: [...index.paths.entries()].map(([path, bucket]) => ({ path, ...bucket })),
  };
}

function deserializeIndex(cache: CacheFile): AnchorIndex {
  const paths = new Map<string, PathBucket>();
  for (const { path, wholeFile, intervals, unparseable, lost } of cache.paths) {
    paths.set(path, { wholeFile, intervals, unparseable, lost });
  }
  const index: AnchorIndex = { paths };
  if (cache.head !== null) index.head = cache.head;
  return index;
}

async function readCache(
  cachePath: string,
  bundleHash: string,
  head: string | undefined,
): Promise<AnchorIndex | undefined> {
  let cache: CacheFile;
  try {
    cache = JSON.parse(await readFile(cachePath, "utf8")) as CacheFile;
    if (
      cache.version !== CACHE_VERSION ||
      cache.bundleHash !== bundleHash ||
      (cache.head ?? undefined) !== head ||
      !Array.isArray(cache.paths)
    ) {
      return undefined;
    }
    return deserializeIndex(cache);
  } catch {
    return undefined; // absent, unreadable, or corrupt: rebuild, never trust
  }
}

/** Create `dir` as derived state: it ignores itself so no bundle commits it. */
export async function ensureSelfIgnoringDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(join(dir, ".gitignore"), "*\n", { flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
}

async function writeCache(cacheDir: string, cachePath: string, cache: CacheFile): Promise<void> {
  await ensureSelfIgnoringDir(cacheDir);
  await writeFile(cachePath, `${JSON.stringify(cache)}\n`, "utf8");
}

export interface LoadAnchorIndexOptions {
  /** Repo HEAD to key and judge staleness by; default: resolved from the bundle root. */
  head?: string;
  /** Cache directory; default: `<bundle root>/.cache`. */
  cacheDir?: string;
  /** Set false to skip persisting a rebuilt index (read-only callers). */
  write?: boolean;
}

export interface LoadedAnchorIndex {
  index: AnchorIndex;
  /** Where the index came from — how tests prove reuse without timing. */
  source: "cache" | "built";
}

/**
 * The cached anchor index for a bundle: reused only when both the bundle
 * contents and the repo HEAD still match the key it was built under,
 * rebuilt (and rewritten) otherwise.
 */
export async function loadAnchorIndex(
  bundle: WhyBundle,
  options: LoadAnchorIndexOptions = {},
): Promise<LoadedAnchorIndex> {
  const head = options.head ?? resolveHead(bundle.root);
  const cacheDir = options.cacheDir ?? join(bundle.root, CACHE_DIRNAME);
  const cachePath = join(cacheDir, INDEX_CACHE_FILENAME);
  const bundleHash = await bundleContentHash(bundle.root);
  const cached = await readCache(cachePath, bundleHash, head);
  if (cached) return { index: cached, source: "cache" };
  const index = buildAnchorIndex(bundle, head);
  if (options.write !== false) {
    await writeCache(cacheDir, cachePath, serializeIndex(index, bundleHash));
  }
  return { index, source: "built" };
}
