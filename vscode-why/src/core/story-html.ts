// The `why: Show Story` webview document: the full story cards for a span,
// rendered to a self-contained HTML string themed entirely by --vscode-* CSS
// variables (no hardcoded hex, no external assets).
//
// Judged trade (issue 503 asked for the call): the serve SPA's card renderer
// (ui/story-panel.js) is a DOM function in the root package — reusing it here
// would mean copying a file across the package boundary into the .vsix at
// build time, a path that drifts silently from the source it was copied from.
// This renderer is ~a hundred lines over the same v1 contract, ordered like
// the hovers (expired-upstream warnings first) so both surfaces tell the same
// story. Semantics still live in the data: rationale arrives pre-hedged,
// downstream arrives precomputed.

import type { Story, StoryHit } from "./contract.js";
import { glyphFor } from "./hover.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTarget(target: Story["target"]): string {
  if (!target.lines) return target.path;
  const { start, end } = target.lines;
  return `${target.path}:${start}${end === start ? "" : `-${end}`}`;
}

const EDGE_LABELS = [
  ["becauseOf", "because of"],
  ["insteadOf", "instead of"],
  ["supersededBy", "superseded by"],
] as const;

function badge(className: string, text: string): string {
  return `<span class="badge ${className}">${escapeHtml(text)}</span>`;
}

function card(hit: StoryHit, isWarning: boolean): string {
  const expired = hit.type === "constraint" && hit.status === "expired";
  const classes = ["card", `type-${hit.type}`];
  if (expired) classes.push("expired");
  if (isWarning) classes.push("warning");

  const head: string[] = [
    `<span class="glyph">${escapeHtml(glyphFor(hit.type, hit.status))}</span>`,
    `<strong>${escapeHtml(hit.title)}</strong>`,
    badge("type", hit.type),
  ];
  if (expired) {
    head.push(badge("loud", `EXPIRED ${hit.expired_on ?? "(date unknown)"}`));
  } else if (hit.status !== undefined) {
    head.push(badge("status", hit.status));
  }
  if (hit.happened_on !== undefined) head.push(badge("date", hit.happened_on));
  if (hit.type !== "question" && hit.confidence !== undefined) {
    head.push(badge("conf", hit.confidence));
  }

  const body: string[] = [`<header>${head.join(" ")}</header>`];
  // Verbatim: the mandatory hedge prefix is already in the data.
  if (hit.renderedRationale !== "") {
    body.push(`<p class="rationale">${escapeHtml(hit.renderedRationale)}</p>`);
  }
  for (const [key, label] of EDGE_LABELS) {
    const edges = hit.edges[key];
    if (edges.length === 0) continue;
    const items = edges
      .map((edge) => {
        const suffix =
          edge.type === undefined ? "" : ` (${edge.type}${edge.status === undefined ? "" : ` — ${edge.status}`})`;
        return `<li>${escapeHtml(edge.title + suffix)}</li>`;
      })
      .join("");
    body.push(`<div class="edges"><span class="edge-label">${label}</span><ul>${items}</ul></div>`);
  }
  for (const decision of hit.downstream) {
    body.push(`<p class="scar">→ downstream decision "${escapeHtml(decision.title)}" may now be scar tissue.</p>`);
  }
  if (hit.citations.length > 0) {
    const items = hit.citations
      .map((c) => `<li><a href="${escapeHtml(c.url)}">${escapeHtml(c.label)}</a></li>`)
      .join("");
    body.push(`<ul class="citations">${items}</ul>`);
  }
  return `<article class="${classes.join(" ")}">${body.join("")}</article>`;
}

const STYLE = `
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0 1rem 1rem; }
  h2 { font-size: 1.1em; }
  .card { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 0.5rem 0.75rem; margin: 0.75rem 0; }
  .card.expired { border-color: var(--vscode-editorWarning-foreground); }
  .badge { border: 1px solid var(--vscode-panel-border); border-radius: 3px; padding: 0 0.3em; font-size: 0.85em; }
  .badge.loud { color: var(--vscode-editorWarning-foreground); border-color: var(--vscode-editorWarning-foreground); font-weight: bold; }
  .scar { color: var(--vscode-editorWarning-foreground); }
  .rationale { margin: 0.5rem 0; }
  .edges { font-size: 0.9em; } .edges ul { margin: 0.1rem 0 0.4rem; }
  .edge-label { color: var(--vscode-descriptionForeground); }
  .citations { font-size: 0.9em; }
  a { color: var(--vscode-textLink-foreground); }
  .stale, .empty, .nearby-head { color: var(--vscode-descriptionForeground); }
`;

export interface StoryHtmlOptions {
  /** From stalenessNote(); rendered muted under the heading when present. */
  staleNote?: string;
}

/** Render one story payload as a full webview HTML document. */
export function renderStoryHtml(story: Story, options: StoryHtmlOptions = {}): string {
  const parts: string[] = [];
  parts.push(`<h2>${escapeHtml(story.span ?? formatTarget(story.target))}</h2>`);
  if (options.staleNote !== undefined) {
    parts.push(`<p class="stale"><em>${escapeHtml(options.staleNote)}</em></p>`);
  }
  if (story.hits.length === 0) {
    parts.push(`<p class="empty">No concepts anchor ${escapeHtml(formatTarget(story.target))}.</p>`);
  }
  // Same ordering as the hovers: an expired upstream constraint warns first.
  for (const warning of story.warnings) parts.push(card(warning, true));
  for (const hit of story.hits) parts.push(card(hit, false));
  if (story.hits.length === 0 && story.nearby.length > 0) {
    parts.push(`<h3 class="nearby-head">Anchored concepts nearby (nearest first)</h3>`);
    const items = story.nearby
      .map((near) => {
        const anchor = near.anchor.lines === undefined ? near.anchor.path : `${near.anchor.path}:${near.anchor.lines}`;
        return `<li>${escapeHtml(`${glyphFor(near.type, near.status)} ${near.title} — ${near.type} · ${anchor}`)}</li>`;
      })
      .join("");
    parts.push(`<ul class="nearby">${items}</ul>`);
  }
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">`,
    `<style>${STYLE}</style>`,
    "</head><body>",
    ...parts,
    "</body></html>",
  ].join("\n");
}
