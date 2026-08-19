// Small Markdown/frontmatter helpers owned by Why. okf-mcp 1.x intentionally
// keeps parser internals out of its semver-covered library surface; Why only
// needs this narrow subset for its own extension schema and draft workflow.

import path from "node:path";
import { parse, stringify } from "yaml";
import type { ConceptFrontmatter } from "@copperbox/okf-mcp";

export interface FrontmatterSplit {
  data: Record<string, unknown> | null;
  body: string;
  present: boolean;
  error?: string;
}

export interface BodySection {
  heading: string;
  level: number;
  content: string;
}

interface Heading {
  heading: string;
  level: number;
  start: number;
  contentStart: number;
}

const OPEN = /^---\r?\n/;
const CLOSE = /^(?:---|\.\.\.)\s*$/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

export function splitFrontmatter(source: string): FrontmatterSplit {
  if (!OPEN.test(source)) return { data: null, body: source, present: false };
  const lines = source.split(/\r?\n/);
  const close = lines.findIndex((line, index) => index > 0 && CLOSE.test(line));
  if (close === -1) {
    return { data: null, body: source, present: true, error: "unterminated frontmatter block" };
  }
  const body = lines.slice(close + 1).join("\n").replace(/^\r?\n/, "");
  try {
    const value: unknown = parse(lines.slice(1, close).join("\n"));
    if (value === null || value === undefined) return { data: {}, body, present: true };
    if (typeof value !== "object" || Array.isArray(value)) {
      return { data: null, body, present: true, error: "frontmatter is not a YAML mapping" };
    }
    return { data: value as Record<string, unknown>, body, present: true };
  } catch (error) {
    return { data: null, body, present: true, error: `invalid YAML frontmatter: ${(error as Error).message}` };
  }
}

export function serializeDocument(frontmatter: Record<string, unknown>, body: string): string {
  const yaml = stringify(frontmatter).trimEnd();
  return `---\n${yaml}\n---\n\n${body.replace(/^\s+/, "").trimEnd()}\n`;
}

function headings(body: string): Heading[] {
  const result: Heading[] = [];
  let offset = 0;
  let fence: { char: string; length: number } | undefined;
  for (const line of body.split("\n")) {
    const start = offset;
    offset += line.length + 1;
    const marker = FENCE.exec(line)?.[1];
    if (fence !== undefined) {
      if (marker?.[0] === fence.char && marker.length >= fence.length && line.trim() === marker) fence = undefined;
      continue;
    }
    if (marker !== undefined) {
      fence = { char: marker[0]!, length: marker.length };
      continue;
    }
    const match = ATX.exec(line);
    if (match === null) continue;
    result.push({
      heading: (match[2] ?? "").replace(/[ \t]+#+$/, ""),
      level: match[1]!.length,
      start,
      contentStart: Math.min(offset, body.length),
    });
  }
  return result;
}

export function splitSections(body: string): BodySection[] {
  const found = headings(body);
  return found.map((heading, index) => ({
    heading: heading.heading,
    level: heading.level,
    content: body.slice(heading.contentStart, found[index + 1]?.start ?? body.length).trim(),
  }));
}

export function sectionAt(body: string, offset: number): string | undefined {
  let section: string | undefined;
  for (const heading of headings(body)) {
    if (heading.start > offset) break;
    section = heading.heading;
  }
  return section;
}

export function extractSection(body: string, name: string): BodySection | undefined {
  const found = headings(body);
  const index = found.findIndex((heading) => heading.heading.toLowerCase() === name.trim().toLowerCase());
  if (index === -1) return undefined;
  const heading = found[index]!;
  const next = found.slice(index + 1).find((candidate) => candidate.level <= heading.level);
  return {
    heading: heading.heading,
    level: heading.level,
    content: body.slice(heading.contentStart, next?.start ?? body.length).trim(),
  };
}

/** Remove the first named heading and its subtree, preserving surrounding text. */
export function removeSection(body: string, name: string): string {
  const found = headings(body);
  const index = found.findIndex((heading) => heading.heading.toLowerCase() === name.trim().toLowerCase());
  if (index === -1) return body;
  const heading = found[index]!;
  const next = found.slice(index + 1).find((candidate) => candidate.level <= heading.level);
  return `${body.slice(0, heading.start).trimEnd()}\n${body.slice(next?.start ?? body.length).replace(/^\s+/, "")}`;
}

export function deriveTitle(concept: { id: string; path: string; frontmatter: ConceptFrontmatter }): string {
  if (typeof concept.frontmatter.title === "string") return concept.frontmatter.title;
  const title = path.posix.basename(concept.path).replace(/\.md$/i, "").split(/[-_\s]+/)
    .filter(Boolean).map((word) => word[0]!.toUpperCase() + word.slice(1)).join(" ");
  return title === "" ? concept.id : title;
}
