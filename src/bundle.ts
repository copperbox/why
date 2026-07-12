// Schema-aware bundle loading: okf-mcp parses the OKF layer (frontmatter,
// links, sections); this module types the `why:` extension map on top
// (DESIGN.md §2) and tags each link with the section it appears in (§3).
// Loading is permissive in the OKF spirit: malformed `why:` data becomes a
// diagnostic, never an exception — `why lint` renders the diagnostics.

import {
  loadBundle as loadOkfBundle,
  sectionAt,
  splitSections,
} from "@copperbox/okf-mcp";
import type {
  BodySection,
  ConceptFrontmatter,
  ConceptLink,
  LoadedBundle,
} from "@copperbox/okf-mcp";

export const CONCEPT_TYPES = ["decision", "constraint", "attempt", "incident", "question"] as const;
export type ConceptType = (typeof CONCEPT_TYPES)[number];

/** Per-type `status` vocabulary (DESIGN.md §2 field table). */
export const STATUS_VOCAB: Record<ConceptType, readonly string[]> = {
  decision: ["active", "superseded", "reversed"],
  constraint: ["active", "expired", "unknown"],
  attempt: ["failed", "abandoned", "partial"],
  incident: ["resolved", "recurring"],
  question: ["open", "answered"],
};

/** The confidence ladder (DESIGN.md §2), strongest first. */
export const CONFIDENCE_LEVELS = ["recorded", "corroborated", "inferred", "speculative"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const ANCHOR_STATES = ["live", "lost"] as const;
export type AnchorState = (typeof ANCHOR_STATES)[number];

/** An anchor is a claim: at commit `as_of`, this concept was about this span. */
export interface Anchor {
  path: string;
  symbol?: string;
  /** Line span as written (`"41-58"` or `"31"`); absent = whole file. */
  lines?: string;
  as_of?: string;
  state?: AnchorState;
}

export const VERIFY_METHODS = ["check", "ask", "review-by"] as const;
export type VerifyMethod = (typeof VERIFY_METHODS)[number];

/** A constraint's falsifiability contract (DESIGN.md §5). */
export interface VerifySpec {
  method: VerifyMethod;
  check?: string;
  ask?: string;
  review_by?: string;
}

/**
 * The typed `why:` extension map. Invalid values are dropped to undefined
 * with a diagnostic — in particular an unrecognized `confidence` must never
 * survive into the typed view, or rendering could hedge less than the
 * evidence supports.
 */
export interface WhyMeta {
  status?: string;
  happened_on?: string;
  expired_on?: string;
  confidence?: Confidence;
  anchors: Anchor[];
  verify?: VerifySpec;
}

/** One problem with a concept's `why:` data, addressed for `why lint`. */
export interface Diagnostic {
  /** Bundle-relative file path. */
  path: string;
  /** Dotted field the problem is about, e.g. `why.anchors[1].path`. */
  field: string;
  message: string;
}

/** A body link plus the heading of the section it appears under (DESIGN.md §3). */
export interface SectionedLink extends ConceptLink {
  section?: string;
}

export interface WhyConcept {
  id: string;
  /** Bundle-relative file path. */
  path: string;
  frontmatter: ConceptFrontmatter;
  why: WhyMeta;
  body: string;
  sections: BodySection[];
  links: SectionedLink[];
}

export interface WhyBundle {
  /** Absolute path to the bundle root. */
  root: string;
  concepts: Map<string, WhyConcept>;
  /** `why:` schema problems, per concept. */
  diagnostics: Diagnostic[];
  /** The underlying okf-mcp bundle — OKF-level problems and validation live there. */
  okf: LoadedBundle;
}

const WHY_KEYS = new Set(["status", "happened_on", "expired_on", "confidence", "anchors", "verify"]);

function isPlainMap(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** YAML reads a bare `31` or all-digit sha as a number; both mean the string. */
function asStringy(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function list(values: readonly string[]): string {
  return values.join(", ");
}

function readAnchors(value: unknown, push: (field: string, message: string) => void): Anchor[] {
  if (!Array.isArray(value)) {
    push("why.anchors", "must be a list of anchor maps");
    return [];
  }
  const anchors: Anchor[] = [];
  value.forEach((entry, i) => {
    const at = `why.anchors[${i}]`;
    if (!isPlainMap(entry)) {
      push(at, "must be a map with at least a path");
      return;
    }
    const path = asStringy(entry.path);
    if (path === undefined) {
      push(`${at}.path`, "is required and must be a string");
      return;
    }
    const anchor: Anchor = { path };
    if (entry.symbol !== undefined) {
      const symbol = asStringy(entry.symbol);
      if (symbol === undefined) push(`${at}.symbol`, "must be a string");
      else anchor.symbol = symbol;
    }
    if (entry.lines !== undefined) {
      const lines = asStringy(entry.lines);
      if (lines === undefined) push(`${at}.lines`, 'must be a line or range like "41-58"');
      else anchor.lines = lines;
    }
    if (entry.as_of !== undefined) {
      const asOf = asStringy(entry.as_of);
      if (asOf === undefined) push(`${at}.as_of`, "must be a commit id string");
      else anchor.as_of = asOf;
    }
    if (entry.state !== undefined) {
      if ((ANCHOR_STATES as readonly unknown[]).includes(entry.state)) {
        anchor.state = entry.state as AnchorState;
      } else {
        push(`${at}.state`, `"${String(entry.state)}" is not an anchor state: allowed values are ${list(ANCHOR_STATES)}`);
      }
    }
    anchors.push(anchor);
  });
  return anchors;
}

/** The frontmatter key each verify method requires its detail under. */
const VERIFY_DETAIL_KEYS: Record<VerifyMethod, "check" | "ask" | "review_by"> = {
  check: "check",
  ask: "ask",
  "review-by": "review_by",
};

function readVerify(
  value: unknown,
  push: (field: string, message: string) => void,
): VerifySpec | undefined {
  if (!isPlainMap(value)) {
    push("why.verify", "must be a map with a method (DESIGN.md §5)");
    return undefined;
  }
  const method = value.method;
  if (!(VERIFY_METHODS as readonly unknown[]).includes(method)) {
    push("why.verify.method", `"${String(method)}" is not a verify method: allowed values are ${list(VERIFY_METHODS)}`);
    return undefined;
  }
  const spec: VerifySpec = { method: method as VerifyMethod };
  const detailKey = VERIFY_DETAIL_KEYS[spec.method];
  const detail = asStringy(value[detailKey]);
  if (detail === undefined) {
    push(`why.verify.${detailKey}`, `method "${spec.method}" requires a "${detailKey}" value`);
  } else {
    spec[detailKey] = detail;
  }
  return spec;
}

function readWhyMeta(
  frontmatter: ConceptFrontmatter,
  path: string,
  diagnostics: Diagnostic[],
): WhyMeta {
  const push = (field: string, message: string) => diagnostics.push({ path, field, message });
  const meta: WhyMeta = { anchors: [] };
  const raw = frontmatter.why;
  if (raw === undefined) return meta;
  if (!isPlainMap(raw)) {
    push("why", "must be a map (DESIGN.md §2)");
    return meta;
  }
  for (const key of Object.keys(raw)) {
    if (!WHY_KEYS.has(key)) {
      push(`why.${key}`, `unrecognized key: known keys are ${list([...WHY_KEYS])}`);
    }
  }
  if (raw.status !== undefined) {
    const status = asStringy(raw.status);
    if (status === undefined) {
      push("why.status", "must be a string");
    } else {
      meta.status = status;
      const vocab = STATUS_VOCAB[frontmatter.type as ConceptType];
      if (vocab && !vocab.includes(status)) {
        push("why.status", `"${status}" is not a ${frontmatter.type} status: allowed values are ${list(vocab)}`);
      }
    }
  }
  for (const key of ["happened_on", "expired_on"] as const) {
    if (raw[key] !== undefined) {
      const date = asStringy(raw[key]);
      if (date === undefined) push(`why.${key}`, "must be a date string");
      else meta[key] = date;
    }
  }
  if (raw.confidence !== undefined) {
    if ((CONFIDENCE_LEVELS as readonly unknown[]).includes(raw.confidence)) {
      meta.confidence = raw.confidence as Confidence;
    } else {
      push("why.confidence", `"${String(raw.confidence)}" is not a confidence level: allowed values are ${list(CONFIDENCE_LEVELS)}`);
    }
  }
  if (raw.anchors !== undefined) meta.anchors = readAnchors(raw.anchors, push);
  if (raw.verify !== undefined) meta.verify = readVerify(raw.verify, push);
  return meta;
}

/** Load a `.why/` bundle from disk into the typed view. Never throws on content. */
export async function loadBundle(root: string): Promise<WhyBundle> {
  const okf = await loadOkfBundle({ id: "why", root });
  const concepts = new Map<string, WhyConcept>();
  const diagnostics: Diagnostic[] = [];
  for (const [id, concept] of okf.concepts) {
    concepts.set(id, {
      id,
      path: concept.path,
      frontmatter: concept.frontmatter,
      why: readWhyMeta(concept.frontmatter, concept.path, diagnostics),
      body: concept.body,
      sections: splitSections(concept.body),
      links: concept.links.map((link) => ({
        ...link,
        section: sectionAt(concept.body, link.targetStart),
      })),
    });
  }
  return { root: okf.root, concepts, diagnostics, okf };
}
