// `why serve` (issue 502): a localhost-only, read-only window onto the bundle
// — git blame and why blame side by side. The server is deliberately thin:
// every endpoint wraps the same library function the CLI uses (buildUiIndex,
// buildBlameReport, buildGraph, buildDoctorReport) and emits a payload from
// the UI data contract (docs/ui-contract.md); the SPA is a dumb renderer over
// those payloads. No endpoint mutates the bundle or the repo: the anchor
// index is loaded with `write: false`, git calls are read-only plumbing, and
// non-GET methods are refused outright.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname } from "node:path";
import { loadAnchorIndex } from "./anchors.js";
import { BlameTargetError, buildBlameReport, normalizePath, type BlameTarget } from "./blame.js";
import { loadBundle } from "./bundle.js";
import { buildDoctorReport, buildDoctorSummary } from "./doctor.js";
import { buildGraph, buildUiIndex, ExportError } from "./export.js";
import { git } from "./git.js";
import { buildUiAssets, type UiAssets } from "./serve-assets.js";

/** A request or the server cannot be served honestly; carries the HTTP status. */
export class ServeError extends Error {
  readonly httpStatus: number;
  constructor(message: string, httpStatus = 500) {
    super(message);
    this.httpStatus = httpStatus;
  }
}

/** Major versions of the serve-only payloads — policy in docs/ui-contract.md. */
export const FILES_SCHEMA_VERSION = 1;
export const GITBLAME_SCHEMA_VERSION = 1;

/** `GET /api/files` (schemas/files.schema.json). */
export interface FilesReport {
  schemaVersion: typeof FILES_SCHEMA_VERSION;
  files: string[];
}

export interface GitBlameLine {
  /** Full sha of the commit that last touched this line. */
  sha: string;
  author: string;
  /** Author date, YYYY-MM-DD in the author's timezone. */
  date: string;
  /** First line of the commit message. */
  summary: string;
  /** The line's content at HEAD, without its newline. */
  text: string;
}

/** `GET /api/blame?path=…` (schemas/gitblame.schema.json). */
export interface GitBlameReport {
  schemaVersion: typeof GITBLAME_SCHEMA_VERSION;
  path: string;
  /** Full sha the blame ran at — the coverage payload carries the same. */
  head: string;
  lines: GitBlameLine[];
}

/** Every tracked file at HEAD. Untracked files have no story to show. */
export function buildFileList(repo: string): FilesReport {
  const result = git(repo, ["ls-files", "-z"]);
  if (result.status !== 0) {
    throw new ServeError(`git ls-files failed in ${repo}: ${result.stderr.trim()}`);
  }
  return {
    schemaVersion: FILES_SCHEMA_VERSION,
    files: result.stdout.split("\0").filter((path) => path !== ""),
  };
}

/** Author epoch + `+HHMM`-style zone → the author's local calendar date. */
function isoDate(epochSeconds: number, tz: string): string {
  const match = /^([+-])(\d{2})(\d{2})$/.exec(tz);
  const offset = match
    ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 3600 + Number(match[3]) * 60)
    : 0;
  return new Date((epochSeconds + offset) * 1000).toISOString().slice(0, 10);
}

interface BlameCommit {
  author: string;
  time: number;
  tz: string;
  summary: string;
}

/**
 * `git blame --porcelain HEAD` for one file, parsed to one entry per line in
 * file order. Blaming HEAD (not the working tree) keeps line numbers agreeing
 * with the coverage payload computed at the same HEAD.
 */
export function buildGitBlame(repo: string, path: string): GitBlameReport {
  const head = git(repo, ["rev-parse", "HEAD"]);
  if (head.status !== 0) {
    throw new ServeError("no resolvable HEAD — serve blame inside a git repository with at least one commit");
  }
  const blame = git(repo, ["blame", "--porcelain", "HEAD", "--", path]);
  if (blame.status !== 0) {
    throw new ServeError(`git blame HEAD -- ${path}: ${blame.stderr.trim()}`, 404);
  }
  // Porcelain interleaves commit headers, metadata (only on a commit's first
  // appearance), and tab-prefixed content lines, already in file order.
  const commits = new Map<string, BlameCommit>();
  const lines: GitBlameLine[] = [];
  let sha = "";
  for (const raw of blame.stdout.split("\n")) {
    if (raw.startsWith("\t")) {
      const commit = commits.get(sha);
      if (commit === undefined) {
        throw new ServeError(`git blame emitted a content line before any commit header for ${path}`);
      }
      lines.push({
        sha,
        author: commit.author,
        date: isoDate(commit.time, commit.tz),
        summary: commit.summary,
        text: raw.slice(1),
      });
      continue;
    }
    const header = /^([0-9a-f]{40,64}) \d+ \d+/.exec(raw);
    if (header) {
      sha = header[1]!;
      if (!commits.has(sha)) commits.set(sha, { author: "", time: 0, tz: "", summary: "" });
      continue;
    }
    const commit = commits.get(sha);
    if (commit === undefined) continue; // preamble before the first header
    if (raw.startsWith("author ")) commit.author = raw.slice("author ".length);
    else if (raw.startsWith("author-time ")) commit.time = Number(raw.slice("author-time ".length));
    else if (raw.startsWith("author-tz ")) commit.tz = raw.slice("author-tz ".length);
    else if (raw.startsWith("summary ")) commit.summary = raw.slice("summary ".length);
  }
  return { schemaVersion: GITBLAME_SCHEMA_VERSION, path, head: head.stdout.trim(), lines };
}

// --- HTTP server ---------------------------------------------------------------

/** Localhost only — remote access is out of scope by design, not by option. */
const HOST = "127.0.0.1";

export interface ServeOptions {
  /** Port to bind on 127.0.0.1; default 0 = a random free port. */
  port?: number;
}

export interface RunningWhyServer {
  server: Server;
  port: number;
  url: string;
  close(): Promise<void>;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendAsset(res: ServerResponse, contentType: string, body: string): void {
  res.writeHead(200, { "content-type": contentType, "cache-control": "no-store" });
  res.end(body);
}

function requiredParam(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (value === null || value === "") {
    throw new ServeError(`missing required query parameter "${name}"`, 400);
  }
  return value;
}

/** `path` (+ optional 1-based `start`/`end`) → the story target span. */
function storyTarget(url: URL): BlameTarget {
  const target: BlameTarget = { path: normalizePath(requiredParam(url, "path")) };
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end") ?? start;
  if (start === null) return target;
  const lines = { start: Number(start), end: Number(end) };
  if (
    !Number.isInteger(lines.start) ||
    !Number.isInteger(lines.end) ||
    lines.start < 1 ||
    lines.end < lines.start
  ) {
    throw new ServeError(`"start"/"end" must be a 1-based low-high line range, got ${start}-${end}`, 400);
  }
  target.lines = lines;
  return target;
}

/**
 * The JSON API. Bundle-backed endpoints reload the bundle per request, so a
 * concept edit or a new HEAD shows on the next refresh instead of serving a
 * silently stale story; `write: false` keeps the index read-only on disk.
 */
async function apiPayload(bundleRoot: string, repo: string, url: URL): Promise<unknown> {
  switch (url.pathname) {
    case "/api/files":
      return buildFileList(repo);
    case "/api/blame":
      return buildGitBlame(repo, requiredParam(url, "path"));
    case "/api/coverage": {
      const bundle = await loadBundle(bundleRoot);
      const { index } = await loadAnchorIndex(bundle, { write: false });
      return buildUiIndex(bundle, index);
    }
    case "/api/story": {
      const bundle = await loadBundle(bundleRoot);
      const { index } = await loadAnchorIndex(bundle, { write: false });
      return buildBlameReport(bundle, storyTarget(url), index);
    }
    case "/api/graph":
      return buildGraph(await loadBundle(bundleRoot));
    case "/api/doctor":
      return buildDoctorSummary(await buildDoctorReport(await loadBundle(bundleRoot)));
    default:
      return undefined;
  }
}

async function handle(
  bundleRoot: string,
  repo: string,
  assets: UiAssets,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "read-only server — GET only" });
    return;
  }
  const url = new URL(req.url ?? "/", `http://${HOST}`);
  switch (url.pathname) {
    case "/":
      sendAsset(res, "text/html; charset=utf-8", assets.html);
      return;
    case "/app.js":
      sendAsset(res, "text/javascript; charset=utf-8", assets.js);
      return;
    case "/app.css":
      sendAsset(res, "text/css; charset=utf-8", assets.css);
      return;
  }
  try {
    const payload = await apiPayload(bundleRoot, repo, url);
    if (payload === undefined) {
      sendJson(res, 404, { error: `no such endpoint: ${url.pathname}` });
      return;
    }
    sendJson(res, 200, payload);
  } catch (e) {
    if (e instanceof ServeError) sendJson(res, e.httpStatus, { error: e.message });
    else if (e instanceof BlameTargetError) sendJson(res, 400, { error: e.message });
    else if (e instanceof ExportError) sendJson(res, 500, { error: e.message });
    else sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
}

/** Start the UI server on 127.0.0.1. The caller owns printing the URL. */
export async function startWhyServer(
  bundleRoot: string,
  options: ServeOptions = {},
): Promise<RunningWhyServer> {
  const repo = dirname(bundleRoot);
  const assets = await buildUiAssets();
  const server = createServer((req, res) => {
    handle(bundleRoot, repo, assets, req, res).catch(() => res.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", (e) =>
      reject(new ServeError(`cannot bind ${HOST}:${options.port ?? 0} — ${e.message}`)),
    );
    server.listen(options.port ?? 0, HOST, resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    server,
    port,
    url: `http://${HOST}:${port}/`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
      }),
  };
}
