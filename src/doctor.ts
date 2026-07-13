// `why doctor` (DESIGN.md §4, §8): the maintenance dashboard — one read-only
// command that says whether the archive can be trusted right now. It reports
// what the recorded state already implies: lost anchors and lint errors are
// red (the archive is asserting things it cannot back), everything else is
// maintenance debt (yellow). Doctor diagnoses only — `why anchor` and
// `why audit` treat.

import { dirname } from "node:path";
import { AnchorError, GitView } from "./anchor.js";
import { anchorSpan } from "./blame.js";
import type { Anchor, WhyBundle } from "./bundle.js";
import { DigStateError, readDigState, type DigState } from "./dig-state.js";
import { git as runGit } from "./git.js";
import { lintBundle, type Finding } from "./lint.js";

/** Red exits 1 (the archive cannot be trusted); yellow is maintenance debt. */
export type DoctorSeverity = "red" | "yellow";

export interface AnchorItem {
  concept: string;
  path: string;
  lines?: string;
  symbol?: string;
  as_of?: string;
}

/**
 * Why a live anchor's as_of is a real concern: it names a commit unrelated to
 * HEAD (history diverged or was rebased away), or one this repository cannot
 * resolve at all. A clean ancestor behind HEAD is stable provenance — the
 * `why anchor` claim (DESIGN.md §2/§4: "the commit at which path+lines were
 * valid") has simply survived unchanged since then — so it is not flagged.
 */
export type StaleReason = "not-ancestor" | "unresolved";

export interface StaleAsOfItem extends AnchorItem {
  as_of: string;
  reason: StaleReason;
}

export interface ReviewByItem {
  concept: string;
  review_by: string;
}

export interface ConstraintItem {
  concept: string;
  expired_on?: string;
}

export interface QuestionItem {
  concept: string;
  happened_on?: string;
}

export interface DoctorSection<Item> {
  title: string;
  severity: DoctorSeverity;
  count: number;
  items: Item[];
  /** Present only when the check could not run (as_of freshness needs a git repo). */
  skipped?: string;
}

/**
 * Dig freshness (DESIGN.md §6): how far HEAD has moved past the high-water
 * mark in `.dig-state.json`. Informational — it never counts as a finding.
 */
export type DigStateHealth =
  | { status: "ok"; branch: string; lastProcessed: string; commitsSince: number }
  | { status: "none"; branch?: string }
  | { status: "invalid"; detail: string }
  | { status: "unavailable"; detail: string };

/** The `--json` shape. Keys and section order are a stable, tested surface. */
export interface DoctorReport {
  root: string;
  /** Short HEAD sha the as_of checks ran against; null when there is no repo. */
  head: string | null;
  digState: DigStateHealth;
  concepts: number;
  /** No red findings — the exit-0 condition. */
  healthy: boolean;
  red: number;
  yellow: number;
  sections: {
    lostAnchors: DoctorSection<AnchorItem>;
    staleAsOf: DoctorSection<StaleAsOfItem>;
    reviewByPastDue: DoctorSection<ReviewByItem>;
    unknownConstraints: DoctorSection<ConstraintItem>;
    expiredConstraints: DoctorSection<ConstraintItem>;
    openQuestions: DoctorSection<QuestionItem>;
    lintErrors: DoctorSection<Finding>;
  };
}

export interface DoctorOptions {
  /** "Today" for the review-by check; injectable so tests are deterministic. */
  now?: Date;
}

function anchorItem(concept: string, anchor: Anchor): AnchorItem {
  const item: AnchorItem = { concept, path: anchor.path };
  if (anchor.symbol !== undefined) item.symbol = anchor.symbol;
  if (anchor.lines !== undefined) item.lines = anchor.lines;
  if (anchor.as_of !== undefined) item.as_of = anchor.as_of;
  return item;
}

/**
 * A state file doctor cannot read reports `invalid` (with the read error) but
 * never throws — the dashboard must still render. With no enclosing repo the
 * freshness of an existing mark is unknowable and says so.
 */
async function digStateHealth(
  bundleRoot: string,
  git: GitView | undefined,
  gitUnavailable: string | undefined,
): Promise<DigStateHealth> {
  let state: DigState | undefined;
  try {
    state = await readDigState(bundleRoot);
  } catch (e) {
    if (!(e instanceof DigStateError)) throw e;
    return { status: "invalid", detail: e.message };
  }
  if (git === undefined) {
    if (state === undefined) return { status: "none" };
    return { status: "unavailable", detail: gitUnavailable! };
  }
  const branch = runGit(git.root, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  const mark = state?.branches[branch];
  if (mark === undefined) return { status: "none", branch };
  const count = runGit(git.root, ["rev-list", "--count", `${mark.lastProcessed}..HEAD`]);
  if (count.status !== 0) {
    return {
      status: "invalid",
      detail: `last processed commit ${mark.lastProcessed} on branch ${branch} does not resolve in this repository`,
    };
  }
  return {
    status: "ok",
    branch,
    lastProcessed: mark.lastProcessed,
    commitsSince: Number(count.stdout.trim()),
  };
}

function section<Item>(
  title: string,
  severity: DoctorSeverity,
  items: Item[],
  skipped?: string,
): DoctorSection<Item> {
  const built: DoctorSection<Item> = { title, severity, count: items.length, items };
  if (skipped !== undefined) built.skipped = skipped;
  return built;
}

/** Build the full health report. Pure read — nothing on disk changes. */
export async function buildDoctorReport(
  bundle: WhyBundle,
  options: DoctorOptions = {},
): Promise<DoctorReport> {
  const now = options.now ?? new Date();
  const concepts = [...bundle.concepts.values()];

  // No enclosing git repo (or no commits) leaves as_of freshness unknowable;
  // the section then says so out loud instead of silently reporting zero.
  let git: GitView | undefined;
  let gitUnavailable: string | undefined;
  try {
    git = await GitView.open(dirname(bundle.root));
  } catch (e) {
    if (!(e instanceof AnchorError)) throw e;
    gitUnavailable = e.message;
  }

  const digState = await digStateHealth(bundle.root, git, gitUnavailable);

  const lost: AnchorItem[] = [];
  const stale: StaleAsOfItem[] = [];
  for (const concept of concepts) {
    for (const anchor of concept.why.anchors) {
      if (anchor.state === "lost") {
        lost.push(anchorItem(concept.id, anchor));
        continue;
      }
      if (anchor.as_of === undefined || git === undefined) continue;
      const sha = await git.commitSha(anchor.as_of);
      if (sha === git.headFull) continue;
      let reason: StaleReason;
      if (sha === undefined) reason = "unresolved";
      else if (await git.isAncestor(sha)) continue; // clean ancestor of HEAD — stable provenance, not drift
      else reason = "not-ancestor";
      stale.push({ ...anchorItem(concept.id, anchor), as_of: anchor.as_of, reason });
    }
  }

  const reviewByPastDue: ReviewByItem[] = [];
  const unknown: ConstraintItem[] = [];
  const expired: ConstraintItem[] = [];
  for (const concept of concepts) {
    if (concept.frontmatter.type !== "constraint") continue;
    const why = concept.why;
    if (why.status === "unknown") unknown.push({ concept: concept.id });
    if (why.status === "expired") {
      const item: ConstraintItem = { concept: concept.id };
      if (why.expired_on !== undefined) item.expired_on = why.expired_on;
      expired.push(item);
    }
    const reviewBy = why.verify?.method === "review-by" ? why.verify.review_by : undefined;
    // An unparseable date cannot be shown to lie in the future, so it counts
    // as due — this check may not silently pass a claim it cannot evaluate.
    if (reviewBy !== undefined && !(Date.parse(reviewBy) > now.getTime())) {
      reviewByPastDue.push({ concept: concept.id, review_by: reviewBy });
    }
  }

  // Age-sorted: the longest-open gaps first; undated questions sink last.
  const openQuestions: QuestionItem[] = concepts
    .filter((c) => c.frontmatter.type === "question" && c.why.status === "open")
    .map((c) => {
      const item: QuestionItem = { concept: c.id };
      if (c.why.happened_on !== undefined) item.happened_on = c.why.happened_on;
      return item;
    })
    .sort((a, b) => (a.happened_on ?? "\uffff").localeCompare(b.happened_on ?? "\uffff"));

  const lintErrors = (await lintBundle(bundle)).filter((f) => f.severity === "error");

  const sections: DoctorReport["sections"] = {
    lostAnchors: section("lost anchors", "red", lost),
    staleAsOf: section("stale as_of", "yellow", stale, gitUnavailable),
    reviewByPastDue: section("review-by past due", "yellow", reviewByPastDue),
    unknownConstraints: section("constraints with status unknown", "yellow", unknown),
    expiredConstraints: section("expired constraints", "yellow", expired),
    openQuestions: section("open questions", "yellow", openQuestions),
    lintErrors: section("lint errors", "red", lintErrors),
  };
  let red = 0;
  let yellow = 0;
  for (const s of Object.values(sections)) {
    if (s.severity === "red") red += s.count;
    else yellow += s.count;
  }
  return {
    root: bundle.root,
    head: git?.headShort ?? null,
    digState,
    concepts: concepts.length,
    healthy: red === 0,
    red,
    yellow,
    sections,
  };
}

// --- Rendering -------------------------------------------------------------

const STALE_NOTES: Record<StaleReason, string> = {
  "not-ancestor": "is not an ancestor of HEAD",
  unresolved: "does not resolve in this repository",
};

/** One display line per finding — shared by the CLI renderer and the serve
 * summary (schemas/doctor.schema.json), so the two surfaces cannot drift. */
const ITEM_TEXT = {
  lostAnchors: (i: AnchorItem) =>
    `${i.concept}  ${anchorSpan(i)} (last known${i.as_of === undefined ? "" : `, as_of ${i.as_of}`})`,
  staleAsOf: (i: StaleAsOfItem) => `${i.concept}  ${anchorSpan(i)} — as_of ${i.as_of} ${STALE_NOTES[i.reason]}`,
  reviewByPastDue: (i: ReviewByItem) => `${i.concept}  review_by ${i.review_by}`,
  unknownConstraints: (i: ConstraintItem) => i.concept,
  expiredConstraints: (i: ConstraintItem) =>
    `${i.concept}  expired_on ${i.expired_on ?? "(unrecorded — see why lint W402)"}`,
  openQuestions: (i: QuestionItem) => `${i.concept}  open since ${i.happened_on ?? "(undated)"}`,
  lintErrors: (i: Finding) => `${i.file}  ${i.rule}  ${i.message}`,
} as const;

export type DoctorSectionKey = keyof typeof ITEM_TEXT;

/** Major version of the serve summary payload — policy in docs/ui-contract.md. */
export const DOCTOR_SUMMARY_SCHEMA_VERSION = 1;

export interface DoctorSummarySection {
  key: DoctorSectionKey;
  title: string;
  severity: DoctorSeverity;
  count: number;
  /** Pre-rendered display lines — the same text the CLI prints per finding. */
  items: string[];
  skipped?: string;
}

/** The `GET /api/doctor` payload (schemas/doctor.schema.json). */
export interface DoctorSummary {
  schemaVersion: typeof DOCTOR_SUMMARY_SCHEMA_VERSION;
  healthy: boolean;
  head: string | null;
  concepts: number;
  red: number;
  yellow: number;
  /** All seven sections, in the CLI's render order. */
  sections: DoctorSummarySection[];
}

function summarizeSection<Key extends DoctorSectionKey>(
  key: Key,
  sec: DoctorReport["sections"][Key],
): DoctorSummarySection {
  const items = sec.items.map((item) => (ITEM_TEXT[key] as (i: typeof item) => string)(item));
  const summary: DoctorSummarySection = {
    key,
    title: sec.title,
    severity: sec.severity,
    count: sec.count,
    items,
  };
  if (sec.skipped !== undefined) summary.skipped = sec.skipped;
  return summary;
}

/** Flatten a report into the UI-contract summary `why serve` emits. */
export function buildDoctorSummary(report: DoctorReport): DoctorSummary {
  const s = report.sections;
  return {
    schemaVersion: DOCTOR_SUMMARY_SCHEMA_VERSION,
    healthy: report.healthy,
    head: report.head,
    concepts: report.concepts,
    red: report.red,
    yellow: report.yellow,
    sections: [
      summarizeSection("lostAnchors", s.lostAnchors),
      summarizeSection("staleAsOf", s.staleAsOf),
      summarizeSection("reviewByPastDue", s.reviewByPastDue),
      summarizeSection("unknownConstraints", s.unknownConstraints),
      summarizeSection("expiredConstraints", s.expiredConstraints),
      summarizeSection("openQuestions", s.openQuestions),
      summarizeSection("lintErrors", s.lintErrors),
    ],
  };
}

const TITLE_WIDTH = 31; // the longest section title

function pushSection<Item>(
  out: string[],
  sec: DoctorSection<Item>,
  detail: (item: Item) => string,
): void {
  const label = sec.count === 0 ? "ok" : sec.severity;
  out.push(`  ${label.padEnd(7)} ${sec.title.padEnd(TITLE_WIDTH)} ${sec.count}`);
  if (sec.skipped !== undefined) out.push(`             (not checked: ${sec.skipped})`);
  for (const item of sec.items) out.push(`             ${detail(item)}`);
}

function digStateLine(d: DigStateHealth): string {
  if (d.status === "ok") {
    return `dig state: ${d.commitsSince} commit${d.commitsSince === 1 ? "" : "s"} since last dig on ${d.branch}`;
  }
  if (d.status === "none") {
    return `dig state: none — ${d.branch === undefined ? "never dug" : `branch ${d.branch} has never been dug`}`;
  }
  if (d.status === "invalid") return `dig state: invalid — ${d.detail}`;
  return `dig state: not checked — ${d.detail}`;
}

export function renderDoctorReport(report: DoctorReport): string[] {
  const lines: string[] = [];
  const head = report.head === null ? "" : `, HEAD ${report.head}`;
  lines.push(
    `why doctor: ${report.concepts} concept${report.concepts === 1 ? "" : "s"} at ${report.root}${head}`,
  );
  lines.push(digStateLine(report.digState));
  lines.push("");
  const s = report.sections;
  pushSection(lines, s.lostAnchors, ITEM_TEXT.lostAnchors);
  pushSection(lines, s.staleAsOf, ITEM_TEXT.staleAsOf);
  pushSection(lines, s.reviewByPastDue, ITEM_TEXT.reviewByPastDue);
  pushSection(lines, s.unknownConstraints, ITEM_TEXT.unknownConstraints);
  pushSection(lines, s.expiredConstraints, ITEM_TEXT.expiredConstraints);
  pushSection(lines, s.openQuestions, ITEM_TEXT.openQuestions);
  pushSection(lines, s.lintErrors, ITEM_TEXT.lintErrors);
  lines.push("");
  const total = report.red + report.yellow;
  if (total === 0) {
    lines.push("healthy — no findings");
  } else {
    lines.push(
      `${total} finding${total === 1 ? "" : "s"} (${report.red} red, ${report.yellow} yellow) — ${report.healthy ? "healthy" : "unhealthy"}`,
    );
  }
  return lines;
}
