// Hover markdown over the story payload. Dumb renderer rules
// (docs/ui-contract.md): renderedRationale is displayed verbatim — the hedge
// prefix is already baked in by the engine — and an expired upstream
// constraint is never invisible: its warning card renders FIRST, ahead of the
// hits, downstream blast radius included.

import type { Story, StoryHit } from "./contract.js";

/** Same vocabulary the engine precomputes into coverage spans; the contract
 * doc says stories derive theirs the same way from type + status. */
export function glyphFor(type: string, status: string | undefined): string {
  if (type === "question") return "?";
  if (status === "expired" || status === "superseded") return "⚠";
  return "●";
}

/**
 * The muted staleness note: coverage/stories were computed at `coverageHead`;
 * when the checkout's HEAD differs — or cannot be resolved, which is never
 * treated as fresh — say which sha the data is as of. Data is shown, never
 * hidden; re-anchoring is the CLI's job, not the extension's.
 */
export function stalenessNote(coverageHead: string, currentHead: string | undefined): string | undefined {
  if (currentHead !== undefined && currentHead === coverageHead) return undefined;
  return `as of ${coverageHead.slice(0, 7)}`;
}

/** Escape markdown syntax in engine-supplied text used inside formatting. */
function escapeMd(text: string): string {
  return text.replace(/([\\`*_{}[\]()<>#+!|~])/g, "\\$1");
}

function card(hit: StoryHit): string {
  const lines: string[] = [];
  const glyph = glyphFor(hit.type, hit.status);
  const badges: string[] = [`\`${hit.type}\``];
  const expired = hit.type === "constraint" && hit.status === "expired";
  if (expired) {
    badges.push(`**EXPIRED ${hit.expired_on ?? "(date unknown)"}**`);
  } else if (hit.status !== undefined) {
    badges.push(hit.status);
  }
  if (hit.type !== "question" && hit.confidence !== undefined) {
    badges.push(`\`${hit.confidence}\``);
  }
  lines.push(`${glyph} **${escapeMd(hit.title)}** · ${badges.join(" · ")}`);

  // Verbatim: the mandatory hedge prefix is already in the data.
  if (hit.renderedRationale !== "") {
    lines.push("", hit.renderedRationale);
  }

  for (const decision of hit.downstream) {
    lines.push("", `→ downstream decision "${escapeMd(decision.title)}" may now be scar tissue.`);
  }

  if (hit.citations.length > 0) {
    lines.push("", hit.citations.map((c) => `[${escapeMd(c.label)}](${c.url})`).join(" · "));
  }
  return lines.join("\n");
}

export interface HoverOptions {
  /** From stalenessNote(); rendered muted at the end when present. */
  staleNote?: string;
}

/**
 * The hover for a covered line: one markdown card per concept, expired-
 * upstream warnings first, then the hits. Returns undefined when the story
 * carries nothing to show — the provider then shows no hover at all.
 */
export function hoverMarkdown(story: Story, options: HoverOptions = {}): string | undefined {
  const cards = [...story.warnings, ...story.hits].map(card);
  if (cards.length === 0) return undefined;
  let markdown = cards.join("\n\n---\n\n");
  if (options.staleNote !== undefined) {
    markdown += `\n\n*${options.staleNote}*`;
  }
  return markdown;
}
