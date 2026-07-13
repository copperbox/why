// `why audit` (DESIGN.md §5): constraints must be falsifiable, and expiry
// must propagate downstream. The sweep covers every `active` constraint:
// `verify.method: check` commands run in the enclosing repo directory with a
// timeout and captured output; `method: ask` items are exported as an
// agent-consumable questionnaire (the CLI never calls an LLM) and applied
// back via `--answers`; overdue `review_by` dates are flagged. A failed
// check — or an answer marking an ask no longer true — flips the constraint
// to `status: expired` and walks `# Because of` edges backwards: every
// `active` decision reached is reported as candidate scar tissue and gets a
// generated `question` concept, unless an open question already links the
// pair. That report is the tool's reason to exist.
//
// Nothing here asserts above its evidence: a check that cannot run (timeout,
// spawn failure) is an error item, never an expiry, and an unanswered ask
// stays open. Writes go through okf-mcp's updateConcept/writeConcept so
// everything outside the touched spans survives byte-for-byte.

import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { extractSection, updateConcept, writeConcept } from "@copperbox/okf-mcp";
import { isOneOf, isPlainMap, type WhyBundle, type WhyConcept } from "./bundle.js";

const execAsync = promisify(exec);

/** An audit run that must stop cleanly (exit 1), not crash. */
export class AuditError extends Error {}

/** How long one `verify.check` command may run before it counts as an error. */
export const DEFAULT_CHECK_TIMEOUT_MS = 30_000;

/** Chars of captured check output kept — clipped with a marker, never silently. */
export const CHECK_OUTPUT_LIMIT = 4_000;

/**
 * `error` means the check could not be evaluated (timeout, spawn failure) —
 * that is a problem to report, but it is not evidence the constraint is
 * false, so it never flips anything.
 */
export type CheckOutcome = "passed" | "failed" | "error";

export interface CheckResult {
  concept: string;
  command: string;
  outcome: CheckOutcome;
  /** null when the command produced no exit code (timeout, spawn failure). */
  exitCode: number | null;
  /** Combined stdout+stderr, clipped to CHECK_OUTPUT_LIMIT with a marker. */
  output: string;
  /** Why the outcome is `error`. */
  detail?: string;
}

export const ASK_ANSWERS = ["still-true", "no-longer-true", "unknown"] as const;
export type AskAnswer = (typeof ASK_ANSWERS)[number];

export interface AskResult {
  concept: string;
  ask: string;
  /** From the `--answers` file; `unknown` when unanswered. */
  answer: AskAnswer;
}

export interface ReviewByDueItem {
  concept: string;
  review_by: string;
}

export interface UnverifiableItem {
  concept: string;
  reason: string;
}

export interface BlastEntry {
  /** Concept id of the still-active downstream decision. */
  decision: string;
  /** The question concept covering the pair — freshly written or pre-existing. */
  question: string;
  /** false when an equivalent open question already existed (deduped). */
  written: boolean;
}

export interface ExpiredConstraint {
  concept: string;
  method: "check" | "ask";
  expired_on: string;
  /** One line of what falsified it (the full evidence lands in `# Still true?`). */
  detail: string;
  blastRadius: BlastEntry[];
}

/**
 * A constraint that was already `expired` before this run and still has
 * `active` decisions downstream — candidate scar tissue. Report-only: the
 * flip (and its question filing) happened when it expired; re-flagging it
 * every run would be noise, but the candidacy must stay visible.
 */
export interface AlreadyExpiredItem {
  concept: string;
  expired_on: string | null;
  decisions: string[];
}

/** The `--json` shape. Keys are a stable, tested surface. */
export interface AuditReport {
  root: string;
  activeConstraints: number;
  checks: CheckResult[];
  asks: AskResult[];
  reviewByPastDue: ReviewByDueItem[];
  unverifiable: UnverifiableItem[];
  /** Constraints flipped by this run — the exit-1 condition. */
  expired: ExpiredConstraint[];
  alreadyExpired: AlreadyExpiredItem[];
  /** Bundle-relative paths of the question concepts written. */
  questionsWritten: string[];
  /** Absolute path of the questionnaire written, when --questions-out was passed. */
  questionnaire: string | null;
}

export interface AnswerEntry {
  answer: AskAnswer;
  evidence: string;
}

export interface AuditOptions {
  /** Parsed `--answers` content, keyed by concept id. */
  answers?: Map<string, AnswerEntry>;
  /** Absolute path to write the `method: ask` questionnaire to. */
  questionsOut?: string;
  /** "Today" for expired_on and review_by; injectable so tests are deterministic. */
  now?: Date;
  timeoutMs?: number;
}

// --- Questionnaire ---------------------------------------------------------

export const EVIDENCE_PLACEHOLDER = "(replace this line with the evidence for your answer)";

/** The agent-facing export of `method: ask` items; round-trips via `--answers`. */
export function renderQuestionnaire(items: AskResult[]): string {
  const lines = [
    "# why audit questionnaire",
    "",
    "Active constraints verifying with `method: ask`, exported for an agent (or",
    "human) to re-verify — `why audit` never calls an LLM itself. For each item,",
    "investigate, set `answer:` to `still-true`, `no-longer-true`, or `unknown`,",
    "and replace the placeholder with your evidence. Then apply the answers:",
    "",
    "    why audit --answers <this-file>",
    "",
  ];
  if (items.length === 0) {
    lines.push("No unanswered `method: ask` constraints — nothing to do.");
  }
  for (const item of items) {
    lines.push(`## ${item.concept}`, "", item.ask, "", "answer: unknown", "", EVIDENCE_PLACEHOLDER, "");
  }
  return lines.join("\n").trimEnd() + "\n";
}

/**
 * Parse a filled-in questionnaire: `## <concept-id>` starts an item, the first
 * `answer:` line inside it is the verdict, and everything after that line
 * (until the next item) is the evidence. Strict where it matters: an
 * unrecognized answer or a `no-longer-true` without evidence is an error —
 * the flip writes that evidence into `# Still true?`, so it cannot be empty.
 */
export function parseAnswers(text: string): Map<string, AnswerEntry> {
  const out = new Map<string, AnswerEntry>();
  let current: string | undefined;
  let answer: string | undefined;
  let evidence: string[] = [];
  const flush = (): void => {
    if (current === undefined) return;
    const value = answer ?? "unknown";
    if (!isOneOf(ASK_ANSWERS, value)) {
      throw new AuditError(
        `--answers: "${value}" is not an answer for ${current} — use ${ASK_ANSWERS.join(", ")}`,
      );
    }
    const kept = evidence.join("\n").replaceAll(EVIDENCE_PLACEHOLDER, "").trim();
    if (value === "no-longer-true" && kept === "") {
      throw new AuditError(
        `--answers: ${current} is marked no-longer-true without evidence — the flip records that evidence in "# Still true?", so it cannot be empty`,
      );
    }
    out.set(current, { answer: value, evidence: kept });
  };
  for (const line of text.split("\n")) {
    const heading = /^##\s+(\S+)\s*$/.exec(line);
    if (heading !== null) {
      flush();
      current = heading[1]!;
      if (out.has(current)) {
        throw new AuditError(`--answers: ${current} appears twice — keep one answer per constraint`);
      }
      answer = undefined;
      evidence = [];
      continue;
    }
    if (current === undefined) continue;
    if (answer === undefined) {
      const m = /^answer:\s*(.*)$/.exec(line.trim());
      if (m !== null) answer = m[1]!.trim();
      continue; // text between the heading and the answer line is the ask itself
    }
    evidence.push(line);
  }
  flush();
  return out;
}

// --- Check execution -------------------------------------------------------

function clipOutput(text: string): string {
  if (text.length <= CHECK_OUTPUT_LIMIT) return text;
  return `${text.slice(0, CHECK_OUTPUT_LIMIT)}\n[clipped: showing ${CHECK_OUTPUT_LIMIT} of ${text.length} chars]`;
}

/**
 * Run one `verify.check` command, confined to the repo directory (cwd) with a
 * timeout and captured output. Exit 0 = still true; a non-zero exit is the
 * falsification; anything that prevents an exit code is an `error`.
 */
async function runCheck(concept: string, command: string, repoDir: string, timeoutMs: number): Promise<CheckResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: repoDir,
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { concept, command, outcome: "passed", exitCode: 0, output: clipOutput((stdout + stderr).trimEnd()) };
  } catch (e) {
    const err = e as { killed?: boolean; code?: unknown; stdout?: string; stderr?: string; message?: string };
    const output = clipOutput(`${err.stdout ?? ""}${err.stderr ?? ""}`.trimEnd());
    if (err.killed === true) {
      return { concept, command, outcome: "error", exitCode: null, output, detail: `timed out after ${timeoutMs}ms` };
    }
    if (typeof err.code === "number") {
      return { concept, command, outcome: "failed", exitCode: err.code, output };
    }
    return { concept, command, outcome: "error", exitCode: null, output, detail: String(err.message ?? err.code) };
  }
}

// --- Blast radius ----------------------------------------------------------

/**
 * Walk `# Because of` edges backwards from a constraint (DESIGN.md §5):
 * concepts linking to it from a `# Because of` section exist because of it,
 * transitively. Returns every `active` decision reached, sorted.
 */
export function blastRadius(bundle: WhyBundle, constraintId: string): string[] {
  const inbound = new Map<string, string[]>();
  for (const concept of bundle.concepts.values()) {
    for (const link of concept.links) {
      if (link.section?.toLowerCase() !== "because of" || link.resolvedId === undefined) continue;
      const sources = inbound.get(link.resolvedId) ?? [];
      sources.push(concept.id);
      inbound.set(link.resolvedId, sources);
    }
  }
  const visited = new Set<string>([constraintId]);
  const queue = [constraintId];
  const decisions: string[] = [];
  while (queue.length > 0) {
    for (const source of inbound.get(queue.shift()!) ?? []) {
      if (visited.has(source)) continue;
      visited.add(source);
      queue.push(source);
      const concept = bundle.concepts.get(source);
      if (concept?.frontmatter.type === "decision" && concept.why.status === "active") {
        decisions.push(source);
      }
    }
  }
  return decisions.sort();
}

/** An open question already linking both the constraint and the decision. */
function existingQuestion(bundle: WhyBundle, constraintId: string, decisionId: string): WhyConcept | undefined {
  return [...bundle.concepts.values()].find(
    (c) =>
      c.frontmatter.type === "question" &&
      c.why.status === "open" &&
      c.links.some((l) => l.resolvedId === constraintId) &&
      c.links.some((l) => l.resolvedId === decisionId),
  );
}

// --- Writes ------------------------------------------------------------------

function titleOf(concept: WhyConcept): string {
  const title = concept.frontmatter.title;
  return typeof title === "string" && title !== "" ? title : concept.id;
}

/**
 * Flip one constraint: status/expired_on via the frontmatter patch, evidence
 * appended to `# Still true?` via the section patch — the rest of the file
 * survives byte-for-byte (okf-mcp updateConcept splices the document on disk).
 */
async function expireConstraint(
  bundle: WhyBundle,
  constraint: WhyConcept,
  expiredOn: string,
  evidence: string,
): Promise<void> {
  const rawWhy = isPlainMap(constraint.frontmatter.why) ? constraint.frontmatter.why : {};
  const frontmatter = { why: { ...rawWhy, status: "expired", expired_on: expiredOn } };
  const existing = extractSection(constraint.body, "still true?");
  if (existing !== undefined) {
    const content = existing.content === "" ? evidence : `${existing.content}\n\n${evidence}`;
    await updateConcept(bundle.okf, constraint.id, {
      frontmatter,
      section: { heading: "Still true?", content },
    });
    return;
  }
  // A constraint missing its required `# Still true?` section (lint W202)
  // still flips — the falsification is real — and gains the section by a
  // plain append, since the section patch has no heading to splice into.
  await updateConcept(bundle.okf, constraint.id, { frontmatter });
  const absolute = join(bundle.root, constraint.path);
  const source = await readFile(absolute, "utf8");
  const glue = source.endsWith("\n") ? "\n" : "\n\n";
  await writeFile(absolute, `${source}${glue}# Still true?\n\n${evidence}\n`, "utf8");
}

/** File the "is this decision still needed?" question for one blast-radius pair. */
async function writeQuestion(
  bundle: WhyBundle,
  constraint: WhyConcept,
  decision: WhyConcept,
  expiredOn: string,
): Promise<string> {
  const slug = `is-${basename(decision.path, ".md")}-still-needed`;
  let relPath = `questions/${slug}.md`;
  for (let n = 2; existsSync(join(bundle.root, relPath)); n++) {
    relPath = `questions/${slug}-${n}.md`;
  }
  const constraintTitle = titleOf(constraint);
  const decisionTitle = titleOf(decision);
  const title = `Constraint "${constraintTitle}" expired — is "${decisionTitle}" still needed?`;
  const body = [
    `# ${title}`,
    "",
    `[${constraintTitle}](/${constraint.path}) expired on ${expiredOn}, but ` +
      `[${decisionTitle}](/${decision.path}) — shaped by it via \`# Because of\` — is still \`active\`. ` +
      "The decision's code shape may now be scar tissue: re-evaluate it, then either supersede it " +
      "or record why it stands on its own merits.",
    "",
    "Filed by `why audit` (DESIGN.md §5).",
    "",
  ].join("\n");
  await writeConcept(
    bundle.root,
    relPath,
    {
      type: "question",
      title,
      description: `Generated by why audit: ${constraint.id} expired on ${expiredOn} while ${decision.id} is still active.`,
      why: { status: "open", happened_on: expiredOn },
    },
    body,
    { failIfExists: true },
  );
  return relPath;
}

// --- The sweep ---------------------------------------------------------------

function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function indentBlock(text: string): string {
  const body = text === "" ? "(no output)" : text;
  return body
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

/** The evidence paragraph appended to `# Still true?` when a check fails. */
function checkEvidence(check: CheckResult, expiredOn: string): string {
  return [
    `**No — expired ${expiredOn}.** \`why audit\`: the verify check failed (exit ${check.exitCode}).`,
    "",
    indentBlock(`$ ${check.command}\n${check.output === "" ? "(no output)" : check.output}`),
  ].join("\n");
}

/** The evidence paragraph appended to `# Still true?` for an answered ask. */
function askEvidence(evidence: string, expiredOn: string): string {
  const quoted = evidence
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
  return [
    `**No — expired ${expiredOn}.** \`why audit --answers\`: marked no longer true.`,
    "",
    quoted,
  ].join("\n");
}

interface Flip {
  constraint: WhyConcept;
  method: "check" | "ask";
  detail: string;
  evidence: string;
}

/**
 * The full audit: sweep, verify, flip, walk, file. Returns the report; exit
 * semantics (1 when anything newly expired) belong to the CLI.
 */
export async function auditBundle(bundle: WhyBundle, options: AuditOptions = {}): Promise<AuditReport> {
  const now = options.now ?? new Date();
  const today = isoDate(now);
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  const answers = options.answers ?? new Map<string, AnswerEntry>();
  const repoDir = dirname(bundle.root);

  const constraints = [...bundle.concepts.values()]
    .filter((c) => c.frontmatter.type === "constraint")
    .sort((a, b) => a.id.localeCompare(b.id));
  const active = constraints.filter((c) => c.why.status === "active");
  const activeIds = new Set(active.map((c) => c.id));

  // Answers must land on sweepable ask constraints — a typo or a stale
  // questionnaire (the constraint expired since) errors loudly, never a no-op.
  for (const id of answers.keys()) {
    const target = bundle.concepts.get(id);
    if (target === undefined || target.frontmatter.type !== "constraint") {
      throw new AuditError(`--answers: ${id} is not a constraint in this bundle`);
    }
    if (!activeIds.has(id)) {
      throw new AuditError(`--answers: ${id} is not an active constraint (status: ${target.why.status ?? "unset"}) — the answer no longer applies`);
    }
    if (target.why.verify?.method !== "ask") {
      throw new AuditError(`--answers: ${id} does not verify with method "ask"`);
    }
  }

  const checks: CheckResult[] = [];
  const asks: AskResult[] = [];
  const reviewByPastDue: ReviewByDueItem[] = [];
  const unverifiable: UnverifiableItem[] = [];
  const flips: Flip[] = [];

  for (const constraint of active) {
    const verify = constraint.why.verify;
    if (verify === undefined) {
      unverifiable.push({
        concept: constraint.id,
        reason: "no verify block — a constraint must be falsifiable (DESIGN.md §5)",
      });
      continue;
    }
    if (verify.method === "check") {
      if (verify.check === undefined) {
        unverifiable.push({ concept: constraint.id, reason: "verify.check is missing — run `why lint`" });
        continue;
      }
      const result = await runCheck(constraint.id, verify.check, repoDir, timeoutMs);
      checks.push(result);
      if (result.outcome === "failed") {
        flips.push({
          constraint,
          method: "check",
          detail: `verify check failed (exit ${result.exitCode})`,
          evidence: checkEvidence(result, today),
        });
      }
    } else if (verify.method === "ask") {
      if (verify.ask === undefined) {
        unverifiable.push({ concept: constraint.id, reason: "verify.ask is missing — run `why lint`" });
        continue;
      }
      const entry = answers.get(constraint.id);
      asks.push({ concept: constraint.id, ask: verify.ask, answer: entry?.answer ?? "unknown" });
      if (entry?.answer === "no-longer-true") {
        flips.push({
          constraint,
          method: "ask",
          detail: "marked no longer true via --answers",
          evidence: askEvidence(entry.evidence, today),
        });
      }
    } else {
      const reviewBy = verify.review_by;
      if (reviewBy === undefined) {
        unverifiable.push({ concept: constraint.id, reason: "verify.review_by is missing — run `why lint`" });
        continue;
      }
      // An unparseable date cannot be shown to lie in the future, so it counts
      // as due — the check may not silently pass a claim it cannot evaluate.
      if (!(Date.parse(reviewBy) > now.getTime())) {
        reviewByPastDue.push({ concept: constraint.id, review_by: reviewBy });
      }
    }
  }

  // Flips and their blast radius. The question filing dedupes by link pair:
  // an open question already linking both concepts makes a new one noise.
  const expired: ExpiredConstraint[] = [];
  const questionsWritten: string[] = [];
  for (const flip of flips) {
    await expireConstraint(bundle, flip.constraint, today, flip.evidence);
    const entries: BlastEntry[] = [];
    for (const decisionId of blastRadius(bundle, flip.constraint.id)) {
      const decision = bundle.concepts.get(decisionId)!;
      const open = existingQuestion(bundle, flip.constraint.id, decisionId);
      if (open !== undefined) {
        entries.push({ decision: decisionId, question: open.id, written: false });
      } else {
        const relPath = await writeQuestion(bundle, flip.constraint, decision, today);
        questionsWritten.push(relPath);
        entries.push({ decision: decisionId, question: relPath, written: true });
      }
    }
    expired.push({
      concept: flip.constraint.id,
      method: flip.method,
      expired_on: today,
      detail: flip.detail,
      blastRadius: entries,
    });
  }

  // Constraints already expired before this run keep their candidacy visible
  // (report-only — no re-flip, no new questions: that flagging already ran).
  const alreadyExpired: AlreadyExpiredItem[] = [];
  for (const constraint of constraints) {
    if (constraint.why.status !== "expired") continue;
    const decisions = blastRadius(bundle, constraint.id);
    if (decisions.length === 0) continue;
    alreadyExpired.push({ concept: constraint.id, expired_on: constraint.why.expired_on ?? null, decisions });
  }

  // The questionnaire exports what still needs answering; already-answered
  // items would loop forever if re-exported.
  let questionnaire: string | null = null;
  if (options.questionsOut !== undefined) {
    const unanswered = asks.filter((a) => a.answer === "unknown");
    await writeFile(options.questionsOut, renderQuestionnaire(unanswered), "utf8");
    questionnaire = options.questionsOut;
  }

  return {
    root: bundle.root,
    activeConstraints: active.length,
    checks,
    asks,
    reviewByPastDue,
    unverifiable,
    expired,
    alreadyExpired,
    questionsWritten,
    questionnaire,
  };
}

// --- Rendering ---------------------------------------------------------------

function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function renderAuditReport(report: AuditReport): string[] {
  const lines: string[] = [];
  lines.push(`why audit: ${count(report.activeConstraints, "active constraint")} at ${report.root}`);

  const swept =
    report.checks.length + report.asks.length + report.reviewByPastDue.length + report.unverifiable.length > 0;
  if (swept) lines.push("");
  for (const check of report.checks) {
    const label = check.outcome === "failed" ? "FAILED" : check.outcome;
    const suffix =
      check.outcome === "passed" ? "" : check.outcome === "failed" ? ` (exit ${check.exitCode})` : ` — ${check.detail}`;
    lines.push(`  check     ${label.padEnd(8)} ${check.concept}  \`${check.command}\`${suffix}`);
  }
  for (const ask of report.asks) {
    const note =
      ask.answer === "unknown"
        ? "unanswered — export with --questions-out, apply with --answers"
        : `answered ${ask.answer} via --answers`;
    lines.push(`  ask       ${ask.answer.padEnd(8)} ${ask.concept}  ${note}`);
  }
  for (const item of report.reviewByPastDue) {
    lines.push(`  review-by PAST DUE ${item.concept}  review_by ${item.review_by} — needs a human look`);
  }
  for (const item of report.unverifiable) {
    lines.push(`  unverifiable       ${item.concept}  ${item.reason}`);
  }
  if (report.questionnaire !== null) {
    const unanswered = report.asks.filter((a) => a.answer === "unknown").length;
    lines.push("", `wrote questionnaire (${count(unanswered, "unanswered ask")}) to ${report.questionnaire}`);
  }

  if (report.expired.length > 0) {
    lines.push("", "expired this run:");
    for (const item of report.expired) {
      lines.push(`  ${item.concept} — expired_on ${item.expired_on} (${item.detail})`);
      for (const entry of item.blastRadius) {
        const action = entry.written ? `filed ${entry.question}` : `already tracked by ${entry.question}`;
        lines.push(`    ${entry.decision} is active because of it — ${action}`);
      }
      if (item.blastRadius.length === 0) {
        lines.push("    no active decisions downstream");
      }
    }
  }

  if (report.alreadyExpired.length > 0) {
    lines.push("", "already expired (candidate scar tissue, report-only):");
    for (const item of report.alreadyExpired) {
      lines.push(`  ${item.concept}${item.expired_on === null ? "" : ` (expired_on ${item.expired_on})`}`);
      for (const decision of item.decisions) {
        lines.push(`    ${decision} is still active`);
      }
    }
  }

  lines.push("");
  if (report.expired.length > 0) {
    lines.push(
      `${count(report.expired.length, "constraint")} expired this run — the archive learned something (exit 1)`,
    );
  } else {
    lines.push("nothing newly expired");
  }
  return lines;
}
