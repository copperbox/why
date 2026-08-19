// Decision impact for a Git diff. Conservatively names every concept anchored
// to a changed path, marks exact hunk overlap where it can prove it, and shows
// only expired constraints causally upstream of those concepts.

import { deriveTitle } from "./okf.js";
import { dirname } from "node:path";
import { parseLineRange, type LineRange } from "./anchors.js";
import type { WhyBundle, WhyConcept } from "./bundle.js";
import { git } from "./git.js";

export class ImpactError extends Error {}

export interface ChangedFile {
  path: string;
  lines: LineRange[];
  deleted: boolean;
}

export interface ImpactConcept {
  id: string;
  title: string;
  type: string;
  status?: string;
  paths: string[];
  overlaps_hunk: boolean;
}

export interface ImpactConstraint {
  id: string;
  title: string;
  expired_on?: string;
  affects: string[];
}

export interface ImpactReport {
  root: string;
  range: string;
  files: ChangedFile[];
  concepts: ImpactConcept[];
  expired_constraints: ImpactConstraint[];
}

function addRange(file: ChangedFile, start: number, count: number): void {
  const at = Math.max(start, 1);
  file.lines.push({ start: at, end: count === 0 ? at : at + count - 1 });
}

export function parseDiff(patch: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  let current: ChangedFile | undefined;
  for (const line of patch.split("\n")) {
    const header = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
    if (header !== null) {
      current = { path: header[2]!, lines: [], deleted: false };
      files.push(current);
      continue;
    }
    if (current === undefined) continue;
    const oldPath = /^--- a\/(.*)$/.exec(line);
    if (oldPath !== null && current.deleted) current.path = oldPath[1]!;
    if (line === "+++ /dev/null") current.deleted = true;
    if (current.deleted && oldPath !== null) current.path = oldPath[1]!;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk !== null) addRange(current, Number(hunk[1]), hunk[2] === undefined ? 1 : Number(hunk[2]));
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function overlaps(anchorLines: string | undefined, changed: ChangedFile): boolean {
  if (anchorLines === undefined) return true;
  const anchor = parseLineRange(anchorLines);
  if (anchor === undefined) return false;
  return changed.lines.some((line) => anchor.start <= line.end && line.start <= anchor.end);
}

function upstreamExpired(bundle: WhyBundle, start: WhyConcept): WhyConcept[] {
  const found = new Map<string, WhyConcept>();
  const seen = new Set<string>([start.id]);
  const queue = [start];
  while (queue.length > 0) {
    const concept = queue.shift()!;
    for (const link of concept.links) {
      if (link.section?.toLowerCase() !== "because of" || link.resolvedId === undefined) continue;
      const neighbor = bundle.concepts.get(link.resolvedId);
      if (neighbor === undefined || seen.has(neighbor.id)) continue;
      seen.add(neighbor.id);
      if (neighbor.frontmatter.type === "constraint" && neighbor.why.status === "expired") {
        found.set(neighbor.id, neighbor);
      }
      queue.push(neighbor);
    }
  }
  return [...found.values()];
}

export function buildImpactReport(bundle: WhyBundle, range?: string): ImpactReport {
  const repo = dirname(bundle.root);
  const args = ["diff", "--find-renames", "--unified=0", "--no-color"];
  const label = range ?? "HEAD..worktree";
  if (range !== undefined) args.push(range);
  else args.push("HEAD");
  args.push("--");
  const result = git(repo, args);
  if (result.status !== 0) throw new ImpactError(`git diff ${label} failed: ${result.stderr.trim()}`);
  const files = parseDiff(result.stdout);
  const byPath = new Map(files.map((file) => [file.path, file]));
  const concepts: ImpactConcept[] = [];
  const expired = new Map<string, ImpactConstraint>();
  for (const concept of bundle.concepts.values()) {
    const anchors = concept.why.anchors.filter((anchor) => anchor.state !== "lost" && byPath.has(anchor.path));
    if (anchors.length === 0) continue;
    const item: ImpactConcept = {
      id: concept.id,
      title: deriveTitle(concept),
      type: concept.frontmatter.type,
      paths: [...new Set(anchors.map((anchor) => anchor.path))].sort(),
      overlaps_hunk: anchors.some((anchor) => overlaps(anchor.lines, byPath.get(anchor.path)!)),
    };
    if (concept.why.status !== undefined) item.status = concept.why.status;
    concepts.push(item);
    for (const constraint of upstreamExpired(bundle, concept)) {
      const existing = expired.get(constraint.id);
      if (existing) existing.affects.push(concept.id);
      else {
        const warning: ImpactConstraint = {
          id: constraint.id,
          title: deriveTitle(constraint),
          affects: [concept.id],
        };
        if (constraint.why.expired_on !== undefined) warning.expired_on = constraint.why.expired_on;
        expired.set(constraint.id, warning);
      }
    }
  }
  concepts.sort((a, b) => Number(b.overlaps_hunk) - Number(a.overlaps_hunk) || a.id.localeCompare(b.id));
  for (const item of expired.values()) item.affects.sort();
  return {
    root: bundle.root,
    range: label,
    files,
    concepts,
    expired_constraints: [...expired.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function renderImpactReport(report: ImpactReport): string[] {
  const lines = [`why impact: ${report.range} · ${report.files.length} changed file(s)`, ""];
  if (report.concepts.length === 0) lines.push("No recorded decisions touch this diff.");
  else {
    lines.push(`Affected concepts (${report.concepts.length})`);
    for (const item of report.concepts) {
      lines.push(`  ${item.overlaps_hunk ? "●" : "○"} ${item.title} (${item.type}${item.status ? ` · ${item.status}` : ""})`);
      lines.push(`    ${item.paths.join(", ")}${item.overlaps_hunk ? " · overlaps changed lines" : " · same file"}`);
    }
  }
  if (report.expired_constraints.length > 0) {
    lines.push("", `Expired upstream constraints (${report.expired_constraints.length})`);
    for (const item of report.expired_constraints) {
      lines.push(`  ⚠ ${item.title}${item.expired_on ? ` · expired ${item.expired_on}` : ""}`);
      lines.push(`    affects ${item.affects.join(", ")}`);
    }
  }
  return lines;
}
