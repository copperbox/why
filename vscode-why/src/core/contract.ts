// Parsers for the two UI-contract payloads this extension consumes
// (docs/ui-contract.md in the why repo): coverage (`why export ui-index`) and
// story (`why blame --json`). The extension is a dumb renderer — these checks
// only establish the v1 shape well enough to render honestly; they never
// re-derive semantics the engine precomputes (hedging, glyphs, downstream).
//
// Versioning per the contract: additive fields are ignored; a payload whose
// schemaVersion is above 1 must be said out loud, never guessed at.

export class ContractError extends Error {}

export const SUPPORTED_SCHEMA_VERSION = 1;

export type ConceptType = "decision" | "constraint" | "attempt" | "incident" | "question";
export type Glyph = "●" | "⚠" | "?";

export interface LineRange {
  start: number;
  end: number;
}

export interface CoverageSpan {
  conceptId: string;
  type: ConceptType;
  glyph: Glyph;
  status?: string;
  confidence?: string;
  /** 1-based inclusive; absent = a whole-file claim. */
  lines?: LineRange;
}

export interface CoverageFile {
  path: string;
  spans: CoverageSpan[];
}

export interface Coverage {
  /** Full sha of the HEAD the index was computed at — the staleness contract. */
  head: string;
  files: CoverageFile[];
}

export interface StoryAnchor {
  path: string;
  symbol?: string;
  lines?: string;
  as_of?: string;
  state?: string;
}

export interface StoryEdge {
  title: string;
  id?: string;
  type?: string;
  status?: string;
}

export interface StoryCitation {
  label: string;
  url: string;
}

export interface StoryHit {
  id: string;
  title: string;
  type: ConceptType;
  status?: string;
  happened_on?: string;
  expired_on?: string;
  confidence?: string;
  description: string;
  hedged: boolean;
  /** Pre-hedged rationale — always displayed verbatim, never re-derived. */
  renderedRationale: string;
  anchors: StoryAnchor[];
  edges: {
    becauseOf: StoryEdge[];
    insteadOf: StoryEdge[];
    supersededBy: StoryEdge[];
  };
  citations: StoryCitation[];
  evidence: string[];
  downstream: StoryEdge[];
}

export interface StoryNearby {
  id: string;
  title: string;
  type: ConceptType;
  status?: string;
  anchor: StoryAnchor;
}

export interface Story {
  target: { path: string; lines?: LineRange };
  span?: string;
  hits: StoryHit[];
  warnings: StoryHit[];
  nearby: StoryNearby[];
}

function fail(payload: string, message: string): never {
  throw new ContractError(`${payload} payload: ${message}`);
}

function asRecord(value: unknown, payload: string, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(payload, `${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, payload: string, what: string): unknown[] {
  if (!Array.isArray(value)) fail(payload, `${what} must be an array`);
  return value;
}

function asString(value: unknown, payload: string, what: string): string {
  if (typeof value !== "string") fail(payload, `${what} must be a string`);
  return value;
}

function optionalString(value: unknown, payload: string, what: string): string | undefined {
  if (value === undefined) return undefined;
  return asString(value, payload, what);
}

function parseRoot(raw: string, payload: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (e) {
    fail(payload, `not valid JSON — ${e instanceof Error ? e.message : String(e)}`);
  }
  const root = asRecord(value, payload, "the payload");
  const version = root.schemaVersion;
  if (typeof version !== "number") fail(payload, "missing its schemaVersion");
  if (version > SUPPORTED_SCHEMA_VERSION) {
    fail(
      payload,
      `schemaVersion ${version} is newer than this extension understands (v${SUPPORTED_SCHEMA_VERSION}) — update the extension`,
    );
  }
  if (version !== SUPPORTED_SCHEMA_VERSION) {
    fail(payload, `unsupported schemaVersion ${version} (expected ${SUPPORTED_SCHEMA_VERSION})`);
  }
  return root;
}

function parseLineRange(value: unknown, payload: string, what: string): LineRange {
  const range = asRecord(value, payload, what);
  const { start, end } = range;
  if (typeof start !== "number" || typeof end !== "number" || start < 1 || end < 1) {
    fail(payload, `${what} must carry 1-based start/end numbers`);
  }
  return { start, end };
}

/** Parse `why export ui-index` output (schemas/coverage.schema.json, v1). */
export function parseCoverage(raw: string): Coverage {
  const root = parseRoot(raw, "coverage");
  const head = asString(root.head, "coverage", "head");
  const files = asArray(root.files, "coverage", "files").map((entry, i) => {
    const file = asRecord(entry, "coverage", `files[${i}]`);
    const path = asString(file.path, "coverage", `files[${i}].path`);
    const spans = asArray(file.spans, "coverage", `${path} spans`).map((s, j) => {
      const span = asRecord(s, "coverage", `${path} spans[${j}]`);
      const parsed: CoverageSpan = {
        conceptId: asString(span.conceptId, "coverage", `${path} span conceptId`),
        type: asString(span.type, "coverage", `${path} span type`) as ConceptType,
        glyph: asString(span.glyph, "coverage", `${path} span glyph`) as Glyph,
      };
      const status = optionalString(span.status, "coverage", `${path} span status`);
      if (status !== undefined) parsed.status = status;
      const confidence = optionalString(span.confidence, "coverage", `${path} span confidence`);
      if (confidence !== undefined) parsed.confidence = confidence;
      if (span.lines !== undefined) {
        parsed.lines = parseLineRange(span.lines, "coverage", `${path} span lines`);
      }
      return parsed;
    });
    return { path, spans };
  });
  return { head, files };
}

function parseEdges(value: unknown, payload: string, what: string): StoryHit["edges"] {
  const edges = asRecord(value, payload, what);
  const group = (key: keyof StoryHit["edges"]): StoryEdge[] =>
    asArray(edges[key], payload, `${what}.${key}`).map((e, i) => {
      const edge = asRecord(e, payload, `${what}.${key}[${i}]`);
      return {
        title: asString(edge.title, payload, `${what}.${key}[${i}].title`),
        ...(edge.id !== undefined && { id: asString(edge.id, payload, "edge id") }),
        ...(edge.type !== undefined && { type: asString(edge.type, payload, "edge type") }),
        ...(edge.status !== undefined && { status: asString(edge.status, payload, "edge status") }),
      };
    });
  return { becauseOf: group("becauseOf"), insteadOf: group("insteadOf"), supersededBy: group("supersededBy") };
}

function parseHit(value: unknown, what: string): StoryHit {
  const hit = asRecord(value, "story", what);
  if (typeof hit.hedged !== "boolean") fail("story", `${what}.hedged must be a boolean`);
  const parsed: StoryHit = {
    id: asString(hit.id, "story", `${what}.id`),
    title: asString(hit.title, "story", `${what}.title`),
    type: asString(hit.type, "story", `${what}.type`) as ConceptType,
    description: asString(hit.description, "story", `${what}.description`),
    hedged: hit.hedged,
    renderedRationale: asString(hit.renderedRationale, "story", `${what}.renderedRationale`),
    anchors: asArray(hit.anchors, "story", `${what}.anchors`).map((a, i) => {
      const anchor = asRecord(a, "story", `${what}.anchors[${i}]`);
      return {
        path: asString(anchor.path, "story", `${what}.anchors[${i}].path`),
        ...(anchor.symbol !== undefined && { symbol: asString(anchor.symbol, "story", "anchor symbol") }),
        ...(anchor.lines !== undefined && { lines: asString(anchor.lines, "story", "anchor lines") }),
        ...(anchor.as_of !== undefined && { as_of: asString(anchor.as_of, "story", "anchor as_of") }),
        ...(anchor.state !== undefined && { state: asString(anchor.state, "story", "anchor state") }),
      };
    }),
    edges: parseEdges(hit.edges, "story", `${what}.edges`),
    citations: asArray(hit.citations, "story", `${what}.citations`).map((c, i) => {
      const citation = asRecord(c, "story", `${what}.citations[${i}]`);
      return {
        label: asString(citation.label, "story", "citation label"),
        url: asString(citation.url, "story", "citation url"),
      };
    }),
    evidence: asArray(hit.evidence, "story", `${what}.evidence`).map((e, i) =>
      asString(e, "story", `${what}.evidence[${i}]`),
    ),
    downstream: asArray(hit.downstream, "story", `${what}.downstream`).map((d, i) => {
      const edge = asRecord(d, "story", `${what}.downstream[${i}]`);
      return {
        title: asString(edge.title, "story", "downstream title"),
        ...(edge.id !== undefined && { id: asString(edge.id, "story", "downstream id") }),
        ...(edge.type !== undefined && { type: asString(edge.type, "story", "downstream type") }),
        ...(edge.status !== undefined && { status: asString(edge.status, "story", "downstream status") }),
      };
    }),
  };
  const optional: Array<keyof StoryHit & ("status" | "happened_on" | "expired_on" | "confidence")> = [
    "status",
    "happened_on",
    "expired_on",
    "confidence",
  ];
  for (const key of optional) {
    const v = optionalString(hit[key], "story", `${what}.${key}`);
    if (v !== undefined) parsed[key] = v;
  }
  return parsed;
}

/** Parse `why blame --json` output (schemas/story.schema.json, v1). */
export function parseStory(raw: string): Story {
  const root = parseRoot(raw, "story");
  const target = asRecord(root.target, "story", "target");
  const parsed: Story = {
    target: { path: asString(target.path, "story", "target.path") },
    hits: asArray(root.hits, "story", "hits").map((h, i) => parseHit(h, `hits[${i}]`)),
    warnings: asArray(root.warnings, "story", "warnings").map((w, i) => parseHit(w, `warnings[${i}]`)),
    nearby: asArray(root.nearby, "story", "nearby").map((n, i) => {
      const near = asRecord(n, "story", `nearby[${i}]`);
      const anchor = asRecord(near.anchor, "story", `nearby[${i}].anchor`);
      const entry: StoryNearby = {
        id: asString(near.id, "story", `nearby[${i}].id`),
        title: asString(near.title, "story", `nearby[${i}].title`),
        type: asString(near.type, "story", `nearby[${i}].type`) as ConceptType,
        anchor: {
          path: asString(anchor.path, "story", `nearby[${i}].anchor.path`),
          ...(anchor.lines !== undefined && { lines: asString(anchor.lines, "story", "nearby anchor lines") }),
        },
      };
      const status = optionalString(near.status, "story", `nearby[${i}].status`);
      if (status !== undefined) entry.status = status;
      return entry;
    }),
  };
  if (target.lines !== undefined) {
    parsed.target.lines = parseLineRange(target.lines, "story", "target.lines");
  }
  const span = optionalString(root.span, "story", "span");
  if (span !== undefined) parsed.span = span;
  return parsed;
}
