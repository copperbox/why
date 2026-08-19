// Consolidated editorial inbox: drafts waiting for promotion, open questions,
// and archive-health work. This is the human judgment seam; deterministic
// commands prepare evidence, but nothing promotes or answers itself.

import { deriveTitle, splitFrontmatter } from "./okf.js";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DRAFTS_DIRNAME, EVIDENCE_SUFFIX } from "./capture.js";
import { isPlainMap, type WhyBundle } from "./bundle.js";
import { buildDoctorReport, type DoctorSectionKey } from "./doctor.js";

export interface ReviewItem {
  id: string;
  title: string;
  kind: "draft" | "question";
  owner: string | null;
  captured_on: string | null;
  review_by: string | null;
  age_days: number | null;
  overdue: boolean;
}

export interface MaintenanceItem {
  section: DoctorSectionKey;
  severity: "red" | "yellow";
  text: string;
}

export interface ReviewReport {
  root: string;
  as_of: string;
  drafts: ReviewItem[];
  questions: ReviewItem[];
  maintenance: MaintenanceItem[];
  total: number;
  overdue: number;
  unassigned: number;
}

function maintenanceText(item: unknown): string {
  if (!isPlainMap(item)) return String(item);
  const preferred = ["concept", "file", "path", "lines", "review_by", "expired_on", "rule", "message", "reason"];
  const parts = preferred
    .filter((key) => item[key] !== undefined)
    .map((key) => key === "concept" || key === "file" ? String(item[key]) : `${key} ${String(item[key])}`);
  return parts.length > 0 ? parts.join(" · ") : JSON.stringify(item);
}

function dateString(value: unknown): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return null;
}

function daysSince(date: string | null, now: Date): number | null {
  if (date === null) return null;
  const then = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

function isOverdue(date: string | null, today: string): boolean {
  return date !== null && date < today;
}

async function readDrafts(bundle: WhyBundle, now: Date, today: string): Promise<ReviewItem[]> {
  const dir = join(bundle.root, DRAFTS_DIRNAME);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const items: ReviewItem[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".md") || name.endsWith(EVIDENCE_SUFFIX)) continue;
    const split = splitFrontmatter(await readFile(join(dir, name), "utf8"));
    const data = split.data;
    const why = data !== null && isPlainMap(data.why) ? data.why : {};
    const capturedOn = dateString(why.captured_on);
    const reviewBy = dateString(why.review_by);
    items.push({
      id: name,
      title: data !== null && typeof data.title === "string" ? data.title : name.replace(/\.md$/, ""),
      kind: "draft",
      owner: typeof why.owner === "string" && why.owner.trim() !== "" ? why.owner : null,
      captured_on: capturedOn,
      review_by: reviewBy,
      age_days: daysSince(capturedOn, now),
      overdue: isOverdue(reviewBy, today),
    });
  }
  return items;
}

export async function buildReviewReport(bundle: WhyBundle, now: Date = new Date()): Promise<ReviewReport> {
  const today = now.toISOString().slice(0, 10);
  const drafts = await readDrafts(bundle, now, today);
  const questions = [...bundle.concepts.values()]
    .filter((concept) => concept.frontmatter.type === "question" && concept.why.status === "open")
    .map((concept): ReviewItem => {
      const capturedOn = concept.why.captured_on ?? concept.why.happened_on ?? null;
      const reviewBy = concept.why.review_by ?? null;
      return {
        id: concept.id,
        title: deriveTitle(concept),
        kind: "question",
        owner: concept.why.owner ?? null,
        captured_on: capturedOn,
        review_by: reviewBy,
        age_days: daysSince(capturedOn, now),
        overdue: isOverdue(reviewBy, today),
      };
    })
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.id.localeCompare(b.id));

  const doctor = await buildDoctorReport(bundle, { now });
  const maintenance: MaintenanceItem[] = [];
  for (const [key, section] of Object.entries(doctor.sections)) {
    if (key === "openQuestions") continue;
    for (const item of section.items) {
      maintenance.push({
        section: key as DoctorSectionKey,
        severity: section.severity,
        text: maintenanceText(item),
      });
    }
  }
  const editorial = [...drafts, ...questions];
  return {
    root: bundle.root,
    as_of: today,
    drafts,
    questions,
    maintenance,
    total: editorial.length + maintenance.length,
    overdue: editorial.filter((item) => item.overdue).length,
    unassigned: editorial.filter((item) => item.owner === null).length,
  };
}

function queueLine(item: ReviewItem): string {
  const flags = [item.overdue ? "OVERDUE" : undefined, item.owner ?? "unassigned"].filter(Boolean).join(" · ");
  const age = item.age_days === null ? "age unknown" : `${item.age_days}d old`;
  const due = item.review_by === null ? "no review date" : `review by ${item.review_by}`;
  return `  ${item.id} — ${item.title}\n    ${flags} · ${age} · ${due}`;
}

export function renderReviewReport(report: ReviewReport): string[] {
  const lines = [
    `why review: ${report.total} item(s) at ${report.root}`,
    `  ${report.overdue} overdue · ${report.unassigned} unassigned · as of ${report.as_of}`,
    "",
    `Drafts (${report.drafts.length})`,
  ];
  if (report.drafts.length === 0) lines.push("  none");
  else for (const item of report.drafts) lines.push(...queueLine(item).split("\n"));
  lines.push("", `Open questions (${report.questions.length})`);
  if (report.questions.length === 0) lines.push("  none");
  else for (const item of report.questions) lines.push(...queueLine(item).split("\n"));
  lines.push("", `Maintenance (${report.maintenance.length})`);
  if (report.maintenance.length === 0) lines.push("  none");
  else for (const item of report.maintenance) lines.push(`  ${item.severity} ${item.section}: ${item.text}`);
  return lines;
}
