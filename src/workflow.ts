// Outcome-oriented workflows over the lower-level commands. These modules
// deepen the public interface without hiding the judgment seam: bootstrap
// prepares bounded evidence for an agent; maintain performs everything that
// is safe and deterministic in one run.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveAnchors, writeAnchorUpdates, type AnchorReport } from "./anchor.js";
import { auditBundle, type AuditReport } from "./audit.js";
import { CACHE_DIRNAME, ensureSelfIgnoringDir } from "./anchors.js";
import { loadBundle, type WhyBundle } from "./bundle.js";
import { extractEpisodes } from "./dig.js";
import { withDigState } from "./dig-state.js";
import { buildDoctorReport, type DoctorReport } from "./doctor.js";
import { buildEvidencePack, readEpisodes } from "./evidence.js";
import { lintBundle, type Finding } from "./lint.js";
import { buildReviewReport, type ReviewReport } from "./review.js";
import { git } from "./git.js";

export class WorkflowError extends Error {}

export interface BootstrapOptions {
  evidenceDir?: string;
  maxChars?: number;
  full?: boolean;
}

export interface BootstrapReport {
  root: string;
  branch: string;
  head: string;
  episodes: number;
  workspace: string | null;
  handoff: string | null;
  alreadyCurrent: boolean;
}

function handoffMarkdown(episodeFiles: string[]): string {
  return [
    "# why bootstrap handoff",
    "",
    "The deterministic cold-start pass is complete. Rationale remains an editorial",
    "judgment: run the `skills/dig` skill once for each evidence pack below, in",
    "order, then run `skills/dig-synthesize` once for the batch.",
    "",
    ...episodeFiles.map((file) => `- [ ] ${file}`),
    "",
    "Finish with `why maintain`, then spot-check the result with `why impact` and `why blame`.",
    "",
  ].join("\n");
}

export async function bootstrapBundle(
  bundle: WhyBundle,
  options: BootstrapOptions = {},
): Promise<BootstrapReport> {
  const repo = dirname(bundle.root);
  let built: BootstrapReport | undefined;
  const result = await withDigState(repo, bundle.root, { full: options.full === true }, async (range) => {
    const report = extractEpisodes(repo, range.from === undefined ? { to: range.head } : { from: range.from, to: range.head });
    const episodes = readEpisodes(JSON.stringify(report), "bootstrap episodes");
    const cache = join(bundle.root, CACHE_DIRNAME);
    await ensureSelfIgnoringDir(cache);
    const workspace = join(cache, "bootstrap", range.head.slice(0, 12));
    const packsDir = join(workspace, "evidence");
    await mkdir(packsDir, { recursive: true });
    await writeFile(join(workspace, "episodes.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const episodeFiles: string[] = [];
    for (const episode of episodes) {
      const pack = await buildEvidencePack(episode, {
        repo,
        evidenceDir: options.evidenceDir,
        maxChars: options.maxChars,
      });
      const name = `${pack.episodeId.replace(/[^A-Za-z0-9._-]+/g, "-")}.md`;
      await writeFile(join(packsDir, name), pack.markdown, "utf8");
      episodeFiles.push(`evidence/${name}`);
    }
    const handoff = join(workspace, "HANDOFF.md");
    await writeFile(handoff, handoffMarkdown(episodeFiles), "utf8");
    built = {
      root: bundle.root,
      branch: range.branch,
      head: range.head,
      episodes: episodes.length,
      workspace,
      handoff,
      alreadyCurrent: false,
    };
  });
  return built ?? {
    root: bundle.root,
    branch: result.branch,
    head: result.head,
    episodes: 0,
    workspace: null,
    handoff: null,
    alreadyCurrent: true,
  };
}

export function renderBootstrapReport(report: BootstrapReport): string[] {
  if (report.alreadyCurrent) {
    return [`why bootstrap: ${report.branch} is current at ${report.head.slice(0, 12)} — no new history to prepare`];
  }
  return [
    `why bootstrap: prepared ${report.episodes} episode(s) through ${report.head.slice(0, 12)}`,
    `  workspace ${report.workspace}`,
    `  handoff   ${report.handoff}`,
    "  next      complete the handoff, then run `why maintain`",
  ];
}

export interface MaintainReport {
  root: string;
  anchors: AnchorReport;
  anchorsWritten: string[];
  audit: AuditReport;
  doctor: DoctorReport;
  review: ReviewReport;
  lint: Finding[];
  healthy: boolean;
}

export async function maintainBundle(bundle: WhyBundle): Promise<MaintainReport> {
  const repo = dirname(bundle.root);
  const current = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const integration = git(repo, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (current.status === 0 && integration.status === 0) {
    const branch = current.stdout.trim();
    const target = integration.stdout.trim().replace(/^origin\//, "");
    if (branch !== target) {
      throw new WorkflowError(
        `refusing to write maintenance updates on branch ${branch}; switch to ${target}, or use the read-only ` +
          "`why lint`, `why anchor --check --allow-drift`, and `why review` commands",
      );
    }
  }
  const beforeLint = await lintBundle(bundle);
  if (beforeLint.some((finding) => finding.severity === "error")) {
    const doctor = await buildDoctorReport(bundle);
    const review = await buildReviewReport(bundle);
    return {
      root: bundle.root,
      anchors: { head: doctor.head ?? "unknown", results: [], skipped: [] },
      anchorsWritten: [],
      audit: {
        root: bundle.root,
        activeConstraints: 0,
        checks: [],
        asks: [],
        reviewByPastDue: [],
        unverifiable: [{ concept: "(bundle)", reason: "lint errors must be fixed before maintenance can write" }],
        expired: [],
        alreadyExpired: [],
        questionsWritten: [],
        questionnaire: null,
      },
      doctor,
      review,
      lint: beforeLint,
      healthy: false,
    };
  }
  const anchors = await resolveAnchors(bundle);
  const anchorsWritten = await writeAnchorUpdates(bundle, anchors);
  const afterAnchors = await loadBundle(bundle.root);
  const audit = await auditBundle(afterAnchors);
  const fresh = await loadBundle(bundle.root);
  const lint = await lintBundle(fresh);
  const doctor = await buildDoctorReport(fresh);
  const review = await buildReviewReport(fresh);
  return {
    root: bundle.root,
    anchors,
    anchorsWritten,
    audit,
    doctor,
    review,
    lint,
    healthy:
      !lint.some((finding) => finding.severity === "error") &&
      doctor.healthy &&
      audit.unverifiable.length === 0 &&
      !audit.checks.some((check) => check.outcome === "error"),
  };
}

export function renderMaintainReport(report: MaintainReport): string[] {
  const changed = report.anchors.results.filter((result) => result.changed).length;
  return [
    `why maintain: ${report.healthy ? "healthy" : "needs attention"} at ${report.root}`,
    `  anchors  ${report.anchors.results.length} checked · ${changed} updated · ${report.anchorsWritten.length} concept file(s) written`,
    `  audit    ${report.audit.activeConstraints} active constraint(s) · ${report.audit.expired.length} expired this run · ${report.audit.unverifiable.length} unverifiable`,
    `  archive  ${report.doctor.red} red · ${report.doctor.yellow} yellow · ${report.lint.length} lint finding(s)`,
    `  inbox    ${report.review.total} item(s) · ${report.review.overdue} overdue · ${report.review.unassigned} unassigned`,
    "  next     run `why review` for the editorial queue",
  ];
}
