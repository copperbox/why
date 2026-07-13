// The Show Story webview document: same contract, same ordering as hovers,
// themed by --vscode-* variables only, all engine text HTML-escaped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStory, type Story } from "../src/core/contract.ts";
import { renderStoryHtml } from "../src/core/story-html.ts";

const here = __dirname;
const story = parseStory(readFileSync(join(here, "fixtures", "story.json"), "utf8"));

test("story cards render with the warning first, EXPIRED badge, scar line, citations", () => {
  const html = renderStoryHtml(story);
  assert.ok(html.includes("src/lock.rs:41-58 · acquire_shared"), "span heading");
  const warning = html.indexOf("Acme 45s gateway timeout");
  const hit = html.indexOf("Queue-based locking");
  assert.ok(warning >= 0 && hit >= 0 && warning < hit, "warning card first, like the hovers");
  assert.ok(html.includes("EXPIRED 2025-06-30"), html.slice(0, 400));
  assert.ok(html.includes("may now be scar tissue"));
  assert.ok(html.includes('href="https://github.com/acme/harbor/pull/212"'));
  assert.ok(html.includes("likely — ") === false, "this fixture is unhedged; nothing invents a hedge");
});

test("colors come from --vscode-* theme variables, never hardcoded hex", () => {
  const html = renderStoryHtml(story);
  const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  assert.ok(style !== undefined && style.includes("var(--vscode-"), "theme variables in use");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(style), "no hex colors in the stylesheet");
});

test("engine-supplied text is escaped — a hostile title cannot script the webview", () => {
  const hostile: Story = JSON.parse(JSON.stringify(story));
  hostile.hits[0]!.title = '<script>alert("x")</script>';
  const html = renderStoryHtml(hostile);
  assert.ok(!html.includes('<script>alert("x")</script>'), "raw script tag must not survive");
  assert.ok(html.includes("&lt;script&gt;"), "escaped instead");
});

test("uncovered target: honest empty line plus the nearby fallback list", () => {
  const uncovered: Story = {
    target: { path: "src/new.rs", lines: { start: 1, end: 1 } },
    hits: [],
    warnings: [],
    nearby: [
      {
        id: "decisions/queue-based-locking",
        title: "Queue-based locking",
        type: "decision",
        status: "active",
        anchor: { path: "src/lock.rs", lines: "41-58" },
      },
    ],
  };
  const html = renderStoryHtml(uncovered, { staleNote: "as of 8b7d3f0" });
  assert.ok(html.includes("No concepts anchor src/new.rs:1"), html);
  assert.ok(html.includes("Anchored concepts nearby"));
  assert.ok(html.includes("src/lock.rs:41-58"));
  assert.ok(html.includes("<em>as of 8b7d3f0</em>"), "muted staleness note in the panel too");
});
