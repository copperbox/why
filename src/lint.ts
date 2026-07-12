// `why lint` (DESIGN.md §3): the why-schema layer above OKF conformance.
// OKF conformance itself is okf-mcp's job — its validateBundle findings pass
// through unmodified under the single rule id W001 — while the W1xx–W4xx
// rules enforce the `why:` vocab tables (§2), required sections, edge-target
// types, and status/section consistency (§3).

import { validateBundle } from "@copperbox/okf-mcp";
import {
  CONCEPT_TYPES,
  isOneOf,
  STATUS_VOCAB,
  type ConceptType,
  type WhyBundle,
  type WhyConcept,
} from "./bundle.js";

export type Severity = "error" | "warning";

export interface Finding {
  /** Stable rule id, `W###`. */
  rule: RuleId;
  severity: Severity;
  /** Bundle-relative file path; `(bundle)` for bundle-level OKF findings. */
  file: string;
  message: string;
}

/**
 * Every rule this linter can report. W0xx: okf-mcp pass-through; W1xx: `why:`
 * field validity (§2 vocab tables); W2xx: required sections; W3xx: edge-section
 * link targets; W4xx: status/section consistency (§3).
 */
export const RULES = {
  W001: "OKF conformance finding (okf-mcp validateBundle, passed through)",
  W100: "malformed `why:` value",
  W101: "unknown status for the concept's type",
  W102: "unknown confidence",
  W103: "malformed anchors entry",
  W104: "malformed verify block",
  W105: "unrecognized `why:` key",
  W106: "`why:` field not applicable to the concept's type",
  W200: "decision missing its `# Why` section",
  W201: "confidence inferred/speculative without a `# Citations` section",
  W202: "constraint missing its `# Still true?` section",
  W300: "`# Because of` link target must be a constraint/incident/attempt/decision",
  W301: "`# Instead of` link target must be an attempt",
  W302: "`# Superseded by` link target must be a decision",
  W303: "`# Led to` link target must be a decision/incident",
  W400: "status superseded without a `# Superseded by` section with a link",
  W401: "`# Superseded by` section without status superseded",
  W402: "expired constraint missing expired_on",
} as const;
export type RuleId = keyof typeof RULES;

/** Which W1xx rule a load-time `why:` diagnostic belongs to, by field. */
const FIELD_RULES: Record<string, RuleId> = {
  status: "W101",
  confidence: "W102",
  anchors: "W103",
  verify: "W104",
  happened_on: "W100",
  expired_on: "W100",
};

function ruleForDiagnostic(field: string): RuleId {
  const segment = /^why\.([a-z_]+)/.exec(field)?.[1];
  if (segment === undefined) return "W100"; // `why` itself is not a map
  return FIELD_RULES[segment] ?? "W105"; // any other segment is an unrecognized key
}

/** Allowed link-target types per edge section (DESIGN.md §3 table). */
const EDGE_TARGETS: Record<string, { rule: RuleId; allowed: readonly ConceptType[] }> = {
  "because of": { rule: "W300", allowed: ["constraint", "incident", "attempt", "decision"] },
  "instead of": { rule: "W301", allowed: ["attempt"] },
  "superseded by": { rule: "W302", allowed: ["decision"] },
  "led to": { rule: "W303", allowed: ["decision", "incident"] },
};

function hasSection(concept: WhyConcept, heading: string): boolean {
  return concept.sections.some((s) => s.heading.toLowerCase() === heading);
}

type Push = (rule: RuleId, severity: Severity, message: string) => void;

function lintConcept(bundle: WhyBundle, concept: WhyConcept, push: Push): void {
  const type = concept.frontmatter.type;
  const why = concept.why;

  // W106 — the §2 field table scopes some fields to one concept type.
  if (why.verify !== undefined && type !== "constraint") {
    push("W106", "warning", `why.verify: only a constraint carries a verify block, not a ${type} (DESIGN.md §2)`);
  }
  if (why.expired_on !== undefined && type !== "constraint") {
    push("W106", "warning", `why.expired_on: only a constraint expires, not a ${type} (DESIGN.md §2)`);
  }
  if (why.confidence !== undefined && type === "question") {
    push("W106", "warning", "why.confidence: a question is the uncertainty — it carries no confidence (DESIGN.md §2)");
  }

  // W2xx — required sections (§3).
  if (type === "decision" && !hasSection(concept, "why")) {
    push("W200", "error", 'every decision needs a "# Why" section — the narrative is the point');
  }
  if (
    (why.confidence === "inferred" || why.confidence === "speculative") &&
    !hasSection(concept, "citations")
  ) {
    push("W201", "error", `confidence "${why.confidence}" requires a "# Citations" section backing the claim`);
  }
  if (type === "constraint" && !hasSection(concept, "still true?")) {
    push("W202", "error", 'every constraint needs a "# Still true?" section — a constraint must be falsifiable');
  }

  // W3xx — links in edge sections must target the types the §3 table allows.
  // Unresolved links are okf-mcp's broken-link findings, passed through as W001.
  for (const link of concept.links) {
    const edge = link.section === undefined ? undefined : EDGE_TARGETS[link.section.toLowerCase()];
    if (edge === undefined || link.resolvedId === undefined) continue;
    const targetType = bundle.concepts.get(link.resolvedId)?.frontmatter.type;
    if (targetType !== undefined && !isOneOf(edge.allowed, targetType)) {
      push(edge.rule, "error", `"# ${link.section}" links to ${link.target}, a ${targetType} — allowed targets: ${edge.allowed.join(", ")}`);
    }
  }

  // W4xx — status ⇔ section consistency.
  const supersededLinks = concept.links.filter((l) => l.section?.toLowerCase() === "superseded by");
  if (why.status === "superseded" && supersededLinks.length === 0) {
    push("W400", "error", 'status "superseded" requires a "# Superseded by" section with at least one link to the successor');
  }
  // The reverse direction only where the type's vocab admits "superseded" —
  // the §3 table allows the section on constraints, whose vocab does not.
  const vocab = isOneOf(CONCEPT_TYPES, type) ? STATUS_VOCAB[type] : undefined;
  if (supersededLinks.length > 0 && why.status !== "superseded" && vocab !== undefined && vocab.includes("superseded")) {
    const actual = why.status === undefined ? "unset" : `"${why.status}"`;
    push("W401", "error", `a "# Superseded by" section requires status "superseded" (status is ${actual})`);
  }
  if (type === "constraint" && why.status === "expired" && why.expired_on === undefined) {
    push("W402", "error", 'status "expired" requires an expired_on date (DESIGN.md §2)');
  }
}

/** Lint one loaded bundle; deterministic order (file, rule, message). */
export async function lintBundle(bundle: WhyBundle): Promise<Finding[]> {
  const findings: Finding[] = [];

  // OKF-level conformance is delegated wholesale; validateBundle's report
  // already includes the load-time problems.
  const okf = await validateBundle(bundle.okf);
  for (const problem of [...okf.errors, ...okf.warnings]) {
    findings.push({
      rule: "W001",
      severity: problem.severity,
      file: problem.path ?? "(bundle)",
      message: problem.message,
    });
  }

  // `why:` field validity was already checked at load time (bundle.ts) —
  // map each diagnostic to its stable rule id.
  for (const diag of bundle.diagnostics) {
    const rule = ruleForDiagnostic(diag.field);
    findings.push({
      rule,
      severity: rule === "W105" ? "warning" : "error",
      file: diag.path,
      message: `${diag.field}: ${diag.message}`,
    });
  }

  for (const concept of bundle.concepts.values()) {
    lintConcept(bundle, concept, (rule, severity, message) =>
      findings.push({ rule, severity, file: concept.path, message }),
    );
  }

  return findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule) || a.message.localeCompare(b.message),
  );
}

function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Human-readable findings, grouped by file; a clean line when there are none. */
export function renderFindings(bundle: WhyBundle, findings: Finding[]): string[] {
  if (findings.length === 0) {
    return [`${bundle.root}: ${count(bundle.concepts.size, "concept")}, no findings`];
  }
  const lines: string[] = [];
  let currentFile: string | undefined;
  for (const finding of findings) {
    if (finding.file !== currentFile) {
      if (currentFile !== undefined) lines.push("");
      lines.push(finding.file);
      currentFile = finding.file;
    }
    lines.push(`  ${finding.severity.padEnd(7)} ${finding.rule}  ${finding.message}`);
  }
  const errors = findings.filter((f) => f.severity === "error").length;
  lines.push("", `${count(findings.length, "finding")} (${count(errors, "error")}, ${count(findings.length - errors, "warning")})`);
  return lines;
}
