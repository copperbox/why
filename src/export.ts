// `why export` — the UI data contract payloads (docs/ui-contract.md): the
// per-file coverage map (`ui-index`) and the bundle graph, both versioned so
// dumb renderers can consume them without re-deriving semantics. The story
// payload is `why blame --json` (src/blame.ts); this module owns the other
// two. Schemas live in schemas/ and are validated against real outputs in
// test/ui-contract.test.ts.

import { deriveTitle } from "./okf.js";
import { indexedConcept, type AnchorIndex, type LineRange } from "./anchors.js";
import { glyphFor, type Glyph } from "./blame.js";
import type { Confidence, WhyBundle } from "./bundle.js";

/** An export cannot make its honesty guarantees — operational, not a bug. */
export class ExportError extends Error {}

/** Major versions of the payloads — see docs/ui-contract.md for the policy. */
export const COVERAGE_SCHEMA_VERSION = 1;
export const GRAPH_SCHEMA_VERSION = 1;

export const EXPORT_TARGETS = ["ui-index", "graph"] as const;
export type ExportTarget = (typeof EXPORT_TARGETS)[number];

// --- Coverage (`why export ui-index`) ----------------------------------------

/** One live anchor claim, resolved to the concept it paints the span for. */
export interface CoverageSpan {
  conceptId: string;
  type: string;
  status?: string;
  confidence?: Confidence;
  /** Status glyph — same vocabulary `why blame` renders (docs/ui-contract.md). */
  glyph: Glyph;
  /** Absent = a whole-file claim. */
  lines?: LineRange;
}

export interface CoverageFile {
  path: string;
  /** Whole-file claims first, then ranged spans by start — overlaps possible. */
  spans: CoverageSpan[];
}

export interface CoverageReport {
  schemaVersion: typeof COVERAGE_SCHEMA_VERSION;
  /** The HEAD the anchor index was computed at — compare to detect staleness. */
  head: string;
  files: CoverageFile[];
}

function spanOrder(a: CoverageSpan, b: CoverageSpan): number {
  return (
    (a.lines?.start ?? 0) - (b.lines?.start ?? 0) ||
    (a.lines?.end ?? 0) - (b.lines?.end ?? 0) ||
    a.conceptId.localeCompare(b.conceptId)
  );
}

/**
 * The per-file coverage map, from the anchor index at HEAD. Only live,
 * parseable claims paint spans: `lost` anchors are last-known locations, not
 * live claims, and an anchor whose `lines` value does not parse cannot
 * verifiably cover any span (`why lint` W103 reports it) — both are excluded
 * rather than guessed at.
 */
export function buildUiIndex(bundle: WhyBundle, index: AnchorIndex): CoverageReport {
  const head = index.head;
  if (head === undefined) {
    throw new ExportError(
      "ui-index carries the repo HEAD so consumers can detect staleness, and no HEAD resolved here — run inside a git repository with at least one commit",
    );
  }
  const files: CoverageFile[] = [];
  for (const [path, bucket] of index.paths) {
    const spans: CoverageSpan[] = [];
    for (const entry of [...bucket.wholeFile, ...bucket.intervals]) {
      const concept = indexedConcept(bundle, entry.conceptId);
      const span: CoverageSpan = {
        conceptId: entry.conceptId,
        type: concept.frontmatter.type,
        glyph: glyphFor(concept.frontmatter.type, concept.why.status),
      };
      if (concept.why.status !== undefined) span.status = concept.why.status;
      if (concept.why.confidence !== undefined) span.confidence = concept.why.confidence;
      if (entry.range) span.lines = { start: entry.range.start, end: entry.range.end };
      spans.push(span);
    }
    if (spans.length === 0) continue; // only lost/unparseable claims on this path
    spans.sort(spanOrder);
    files.push({ path, spans });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { schemaVersion: COVERAGE_SCHEMA_VERSION, head, files };
}

// --- Graph (`why export graph`) -----------------------------------------------

export type GraphRelation = "becauseOf" | "insteadOf" | "supersededBy" | "ledTo";

/** Edge-section heading → contract relation name (DESIGN.md §3). */
const GRAPH_RELATIONS = new Map<string, GraphRelation>([
  ["because of", "becauseOf"],
  ["instead of", "insteadOf"],
  ["superseded by", "supersededBy"],
  ["led to", "ledTo"],
]);

export interface GraphNode {
  id: string;
  type: string;
  title: string;
  status?: string;
  confidence?: Confidence;
  happened_on?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: GraphRelation;
}

export interface GraphReport {
  schemaVersion: typeof GRAPH_SCHEMA_VERSION;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * The bundle as nodes and typed edges, suitable for direct rendering. Only
 * links in the four §3 edge sections become edges, and only when they resolve
 * to a concept in the bundle — an unresolved edge link is `why lint`'s
 * broken-link finding, not a renderable edge.
 */
export function buildGraph(bundle: WhyBundle): GraphReport {
  const nodes: GraphNode[] = [...bundle.concepts.values()]
    .map((concept) => {
      const node: GraphNode = {
        id: concept.id,
        type: concept.frontmatter.type,
        title: deriveTitle(concept),
      };
      if (concept.why.status !== undefined) node.status = concept.why.status;
      if (concept.why.confidence !== undefined) node.confidence = concept.why.confidence;
      if (concept.why.happened_on !== undefined) node.happened_on = concept.why.happened_on;
      return node;
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const concept of bundle.concepts.values()) {
    for (const link of concept.links) {
      const relation = link.section === undefined ? undefined : GRAPH_RELATIONS.get(link.section.toLowerCase());
      if (relation === undefined || link.resolvedId === undefined) continue;
      const key = `${concept.id}\u0000${relation}\u0000${link.resolvedId}`;
      if (seen.has(key)) continue; // the same link written twice is one edge
      seen.add(key);
      edges.push({ from: concept.id, to: link.resolvedId, relation });
    }
  }
  edges.sort(
    (a, b) =>
      a.from.localeCompare(b.from) || a.relation.localeCompare(b.relation) || a.to.localeCompare(b.to),
  );
  return { schemaVersion: GRAPH_SCHEMA_VERSION, nodes, edges };
}
