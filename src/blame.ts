// `why blame` (static, DESIGN.md §7): match anchors to a target span, expand
// one hop along typed edges, render the story. Phase 1 trusts anchors as
// written — no re-resolution — but a `lost` anchor is a claim that no longer
// holds, so it never matches: anchors are live or lost, never silently wrong.

import { deriveTitle, extractCitations } from "@copperbox/okf-mcp";
import type { Anchor, Confidence, WhyBundle, WhyConcept } from "./bundle.js";

/** The target spec was malformed — a usage error, not an operational one. */
export class BlameTargetError extends Error {}

export interface LineRange {
  start: number;
  end: number;
}

export interface BlameTarget {
  path: string;
  /** Absent = the whole file. */
  lines?: LineRange;
}

/** Parse `<path>[:line[-line]]`; a non-numeric suffix is part of the path. */
export function parseBlameTarget(spec: string): BlameTarget {
  const match = /^(.+):(\d+)(?:-(\d+))?$/.exec(spec);
  if (!match) return { path: normalizePath(spec) };
  const start = Number(match[2]);
  const end = match[3] === undefined ? start : Number(match[3]);
  if (start < 1 || end < start) {
    throw new BlameTargetError(`"${spec}": line ranges are 1-based low-high, like src/lock.rs:41-58`);
  }
  return { path: normalizePath(match[1]!), lines: { start, end } };
}

function normalizePath(path: string): string {
  return path.replace(/^\.\//, "");
}

export function formatTarget(target: BlameTarget): string {
  if (!target.lines) return target.path;
  const { start, end } = target.lines;
  return `${target.path}:${start}${end === start ? "" : `-${end}`}`;
}

/** One edge endpoint or downstream note, resolved to its concept when possible. */
export interface BlameEdge {
  title: string;
  id?: string;
  type?: string;
  status?: string;
}

/** One concept in the story, fully resolved for rendering or `--json`. */
export interface BlameBlock {
  id: string;
  title: string;
  type: string;
  status?: string;
  happened_on?: string;
  expired_on?: string;
  confidence?: Confidence;
  /** The one-line rationale as written; the renderer adds hedges on top. */
  description: string;
  /** Anchors of this concept that cover the target (empty on warning blocks). */
  anchors: Anchor[];
  because_of: BlameEdge[];
  instead_of: BlameEdge[];
  superseded_by: BlameEdge[];
  /** Short citation labels — the `evidence ▸` line. */
  evidence: string[];
  /** Expired constraints only: active decisions reachable via `# Led to`. */
  downstream: BlameEdge[];
}

export interface NearbyConcept {
  id: string;
  title: string;
  type: string;
  status?: string;
  anchor: Anchor;
}

export interface BlameReport {
  target: BlameTarget;
  /** Narrowest covering anchor span — the output header. */
  span?: string;
  /** Concepts anchored on the target, newest first. */
  matches: BlameBlock[];
  /** Expired constraints not already matched: never invisible (DESIGN.md §7). */
  warnings: BlameBlock[];
  /** When nothing matches: anchored concepts nearest the target's directory. */
  nearby: NearbyConcept[];
}

export function parseLineRange(lines: string): LineRange | undefined {
  const match = /^(\d+)\s*-\s*(\d+)$|^(\d+)$/.exec(lines.trim());
  if (!match) return undefined;
  const start = Number(match[1] ?? match[3]);
  const end = Number(match[2] ?? match[3]);
  return start >= 1 && end >= start ? { start, end } : undefined;
}

function anchorCovers(anchor: Anchor, target: BlameTarget): boolean {
  if (anchor.state === "lost") return false; // a last-known location, not a live claim
  if (anchor.path !== target.path) return false;
  if (!target.lines || anchor.lines === undefined) return true;
  const range = parseLineRange(anchor.lines);
  if (!range) return false; // an unparseable span cannot verifiably cover the target
  return range.start <= target.lines.end && target.lines.start <= range.end;
}

function newestFirst(a: WhyConcept, b: WhyConcept): number {
  const byDate = (b.why.happened_on ?? "").localeCompare(a.why.happened_on ?? "");
  return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
}

function edgeFrom(bundle: WhyBundle, link: { text: string; resolvedId?: string }): BlameEdge {
  const neighbor = link.resolvedId ? bundle.concepts.get(link.resolvedId) : undefined;
  if (!neighbor) return { title: link.text };
  const edge: BlameEdge = { title: deriveTitle(neighbor), id: neighbor.id, type: neighbor.frontmatter.type };
  if (neighbor.why.status !== undefined) edge.status = neighbor.why.status;
  return edge;
}

function edgesIn(bundle: WhyBundle, concept: WhyConcept, section: string): BlameEdge[] {
  return concept.links
    .filter((link) => link.section?.toLowerCase() === section)
    .map((link) => edgeFrom(bundle, link));
}

/** `PR #212: replace striped locks…` reads as `PR #212` on one evidence line. */
function citationLabels(bundle: WhyBundle, concept: WhyConcept): string[] {
  const { citations } = extractCitations(concept.body, concept.path, (id) => bundle.concepts.has(id));
  const labels = citations.map((c) => c.text.split(":")[0]!.trim()).filter((label) => label !== "");
  return [...new Set(labels)];
}

function isExpiredConstraint(type: string, status: string | undefined): boolean {
  return type === "constraint" && status === "expired";
}

function toBlock(bundle: WhyBundle, concept: WhyConcept, anchors: Anchor[]): BlameBlock {
  const block: BlameBlock = {
    id: concept.id,
    title: deriveTitle(concept),
    type: concept.frontmatter.type,
    description: oneLiner(concept),
    anchors,
    because_of: edgesIn(bundle, concept, "because of"),
    instead_of: edgesIn(bundle, concept, "instead of"),
    superseded_by: edgesIn(bundle, concept, "superseded by"),
    evidence: citationLabels(bundle, concept),
    downstream: [],
  };
  if (concept.why.status !== undefined) block.status = concept.why.status;
  if (concept.why.happened_on !== undefined) block.happened_on = concept.why.happened_on;
  if (concept.why.expired_on !== undefined) block.expired_on = concept.why.expired_on;
  if (concept.why.confidence !== undefined) block.confidence = concept.why.confidence;
  if (isExpiredConstraint(block.type, block.status)) {
    // The §5 payoff: what downstream shape may now be scar tissue.
    block.downstream = edgesIn(bundle, concept, "led to").filter(
      (edge) => edge.type === "decision" && edge.status === "active",
    );
  }
  return block;
}

function oneLiner(concept: WhyConcept): string {
  if (concept.frontmatter.description) return concept.frontmatter.description;
  const firstProse = concept.sections.find((s) => s.content !== "")?.content ?? "";
  return firstProse.split("\n")[0] ?? "";
}

function dirOf(path: string): string[] {
  const segments = path.split("/");
  segments.pop();
  return segments;
}

function dirDistance(a: string[], b: string[]): number {
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
  return a.length - shared + (b.length - shared);
}

const NEARBY_LIMIT = 5;

function nearestAnchored(bundle: WhyBundle, target: BlameTarget): NearbyConcept[] {
  const targetDir = dirOf(target.path);
  const ranked: Array<{ distance: number; entry: NearbyConcept }> = [];
  for (const concept of bundle.concepts.values()) {
    let best: { distance: number; anchor: Anchor } | undefined;
    for (const anchor of concept.why.anchors) {
      if (anchor.state === "lost") continue;
      const distance = dirDistance(targetDir, dirOf(anchor.path));
      if (!best || distance < best.distance) best = { distance, anchor };
    }
    if (!best) continue;
    const entry: NearbyConcept = {
      id: concept.id,
      title: deriveTitle(concept),
      type: concept.frontmatter.type,
      anchor: best.anchor,
    };
    if (concept.why.status !== undefined) entry.status = concept.why.status;
    ranked.push({ distance: best.distance, entry });
  }
  ranked.sort((a, b) => a.distance - b.distance || a.entry.title.localeCompare(b.entry.title));
  return ranked.slice(0, NEARBY_LIMIT).map((r) => r.entry);
}

/** The narrowest covering span, README-style: `src/lock.rs:41-58 · acquire_shared`. */
function spanOf(anchors: Anchor[]): string | undefined {
  let best: { anchor: Anchor; width: number } | undefined;
  for (const anchor of anchors) {
    const range = anchor.lines === undefined ? undefined : parseLineRange(anchor.lines);
    const width = range ? range.end - range.start : Number.POSITIVE_INFINITY;
    if (!best || width < best.width) best = { anchor, width };
  }
  if (!best) return undefined;
  const { anchor } = best;
  const lines = anchor.lines === undefined ? "" : `:${anchor.lines}`;
  const symbol = anchor.symbol === undefined ? "" : ` · ${anchor.symbol}`;
  return `${anchor.path}${lines}${symbol}`;
}

export function buildBlameReport(bundle: WhyBundle, target: BlameTarget): BlameReport {
  const matched: Array<{ concept: WhyConcept; anchors: Anchor[] }> = [];
  for (const concept of bundle.concepts.values()) {
    const covering = concept.why.anchors.filter((anchor) => anchorCovers(anchor, target));
    if (covering.length > 0) matched.push({ concept, anchors: covering });
  }
  matched.sort((a, b) => newestFirst(a.concept, b.concept));

  const matches = matched.map(({ concept, anchors }) => toBlock(bundle, concept, anchors));
  const matchedIds = new Set(matches.map((block) => block.id));
  const warnings = [...bundle.concepts.values()]
    .filter(
      (concept) =>
        isExpiredConstraint(concept.frontmatter.type, concept.why.status) && !matchedIds.has(concept.id),
    )
    .sort(newestFirst)
    .map((concept) => toBlock(bundle, concept, []));

  const report: BlameReport = { target, matches, warnings, nearby: [] };
  const span = spanOf(matched.flatMap((m) => m.anchors));
  if (span !== undefined) report.span = span;
  if (matches.length === 0) report.nearby = nearestAnchored(bundle, target);
  return report;
}

// --- Rendering ---------------------------------------------------------------

const TITLE_COLUMN = 40;

function glyphFor(type: string, status: string | undefined): string {
  if (type === "question") return "?";
  if (status === "expired" || status === "superseded") return "⚠";
  return "●";
}

/**
 * Hedging is mandatory rendering logic: anything below `corroborated` hedges,
 * and an unstated confidence hedges hardest — rendering may never hedge less
 * than the evidence supports. Questions carry no rationale to hedge.
 */
function hedgeFor(block: BlameBlock): string {
  if (block.type === "question") return "";
  switch (block.confidence) {
    case "recorded":
    case "corroborated":
      return "";
    case "inferred":
      return "likely — ";
    default:
      return "speculation, thin evidence — ";
  }
}

function metaLine(block: BlameBlock): string {
  const parts = [block.type];
  if (isExpiredConstraint(block.type, block.status)) {
    parts.push(`EXPIRED ${block.expired_on ?? "(date unknown)"}`);
    return parts.join(" · ");
  }
  if (block.happened_on !== undefined) parts.push(block.happened_on);
  if (block.type === "question") {
    if (block.status !== undefined) parts.push(block.status);
  } else if (block.confidence !== undefined) {
    parts.push(block.confidence);
  }
  return parts.join(" · ");
}

function edgeText(edge: BlameEdge, withStatus: boolean): string {
  if (edge.type === undefined) return edge.title;
  const status = withStatus && edge.status !== undefined ? ` — ${edge.status}` : "";
  return `${edge.title} (${edge.type}${status})`;
}

function renderBlock(block: BlameBlock): string[] {
  const lines: string[] = [];
  const head = `${glyphFor(block.type, block.status)} ${block.title}`;
  lines.push(`  ${head.padEnd(TITLE_COLUMN)} ${metaLine(block)}`);
  if (block.description !== "") lines.push(`    ${hedgeFor(block)}${block.description}`);
  const edgeLines: Array<[string, string]> = [];
  for (const edge of block.because_of) edgeLines.push(["because of", edgeText(edge, false)]);
  for (const edge of block.instead_of) edgeLines.push(["instead of", edgeText(edge, true)]);
  for (const edge of block.superseded_by) edgeLines.push(["superseded by", edgeText(edge, false)]);
  if (block.evidence.length > 0) edgeLines.push(["evidence", block.evidence.join(", ")]);
  const labelWidth = Math.max(10, ...edgeLines.map(([label]) => label.length));
  for (const [label, text] of edgeLines) lines.push(`    ${label.padEnd(labelWidth)} ▸ ${text}`);
  for (const edge of block.downstream) {
    lines.push(`    → downstream decision "${edge.title}" may now be scar tissue.`);
  }
  return lines;
}

function anchorSpan(anchor: Anchor): string {
  return anchor.lines === undefined ? anchor.path : `${anchor.path}:${anchor.lines}`;
}

export function renderBlameReport(report: BlameReport): string[] {
  const lines: string[] = [];
  if (report.matches.length > 0) {
    if (report.span !== undefined) lines.push(report.span);
    for (const block of report.matches) lines.push("", ...renderBlock(block));
  } else {
    lines.push(`No concepts anchor ${formatTarget(report.target)}.`);
    if (report.nearby.length > 0) {
      lines.push("", "Anchored concepts nearby (nearest first):");
      for (const near of report.nearby) {
        const head = `${glyphFor(near.type, near.status)} ${near.title}`;
        lines.push(`  ${head.padEnd(TITLE_COLUMN)} ${near.type} · ${anchorSpan(near.anchor)}`);
      }
    } else {
      lines.push("", "This bundle has no anchored concepts yet — add why.anchors frontmatter to place its story in the code.");
    }
  }
  for (const block of report.warnings) lines.push("", ...renderBlock(block));
  return lines;
}
